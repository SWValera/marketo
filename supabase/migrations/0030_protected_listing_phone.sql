-- Forward-only: hide public phone values; retain historical opt-outs.
-- Deployment prerequisite: effective PostgREST db-tx-end=commit, no client override.
-- The header guard below is defense in depth, not proof of API configuration.
begin;
do $$ begin
  if to_regprocedure('public.reveal_listing_phone(uuid)') is not null then
    raise exception 'Unexpected previous reveal function; stop and review preflight';
  end if;
end $$;
create table private.listing_phone_reveal_limits (
  session_key text primary key check (session_key ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default (clock_timestamp() + interval '25 hours'),
  attempts timestamptz[] not null default '{}',
  constraint phone_reveal_bounded_history check (cardinality(attempts) <= 40)
);
create index listing_phone_reveal_limits_expiry on private.listing_phone_reveal_limits(expires_at);
alter table private.listing_phone_reveal_limits enable row level security;
revoke all on private.listing_phone_reveal_limits from public, anon, authenticated, service_role;

-- Same API shape, including for cached clients. Never return an unmetered number.
create or replace function public.get_listing_contact_options(target_listing_id uuid)
returns table(allow_messages boolean, allow_phone boolean, phone text)
language sql stable security definer set search_path = '' as $$
  select contact.allow_messages,
    contact.allow_phone and coalesce(contact.contact_phone_e164 ~ '^\+[1-9][0-9]{7,14}$', false),
    null::text
  from public.listings as listing
  join public.listing_contacts as contact on contact.listing_id = listing.id
  join public.profiles as seller on seller.id = listing.owner_id and seller.status = 'active'
  where listing.id = target_listing_id and listing.status = 'active'
    and listing.published_at is not null and listing.expires_at > statement_timestamp()
    and listing.deleted_at is null;
$$;
revoke all on function public.get_listing_contact_options(uuid) from public, anon, authenticated;
grant execute on function public.get_listing_contact_options(uuid) to anon, authenticated;

create function public.reveal_listing_phone(target_listing_id uuid, p_session_key text)
returns jsonb language plpgsql volatile security definer
set search_path = '' set lock_timeout = '3s' as $$
declare
  request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  at_time timestamptz;
  history timestamptz[];
  minute_count integer;
  retry_at timestamptz;
  result_phone text;
begin
  perform set_config('response.headers', '[{"Cache-Control":"private, no-store, max-age=0"}]', true);
  -- GET/read-only and opt-in rollback transactions must not reveal numbers.
  if coalesce(nullif(current_setting('request.method', true), ''), 'POST') <> 'POST'
    or coalesce(request_headers ->> 'prefer', '') ~* '(^|,)[[:space:]]*tx[[:space:]]*=' then
    return jsonb_build_object('state', 'denied');
  end if;
  -- Only the server gateway has EXECUTE. It validates a fresh Turnstile token and
  -- derives this key from its signed guest cookie, never a client-supplied identity.
  if p_session_key is null or p_session_key !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('state', 'denied');
  end if;
  -- Bounded indexed cleanup; no personal data, phone or listing history in this table.
  delete from private.listing_phone_reveal_limits where session_key in (
    select session_key from private.listing_phone_reveal_limits
    where expires_at < statement_timestamp() order by expires_at limit 100 for update skip locked
  );
  insert into private.listing_phone_reveal_limits(session_key) values(p_session_key) on conflict do nothing;
  select attempts into history from private.listing_phone_reveal_limits where session_key = p_session_key for update;
  at_time := clock_timestamp();
  select coalesce(array_agg(stamp order by stamp), '{}'::timestamptz[]) into history
    from unnest(history) as stamp where stamp > at_time - interval '24 hours';
  select count(*) into minute_count from unnest(history) as stamp where stamp > at_time - interval '1 minute';
  if cardinality(history) >= 40 or minute_count >= 5 then
    select max(available_at) into retry_at from (
      select history[1] + interval '24 hours' as available_at where cardinality(history) >= 40
      union all
      select min(stamp) + interval '1 minute' from unnest(history) as stamp
        where stamp > at_time - interval '1 minute' having minute_count >= 5
    ) as waits;
    return jsonb_build_object('state', 'limited', 'retry_after', greatest(1, ceil(extract(epoch from retry_at - at_time))::integer));
  end if;
  -- Charge unavailable targets too: returning a state commits the quota; RAISE would not.
  update private.listing_phone_reveal_limits set attempts = array_append(history, at_time) where session_key = p_session_key;
  select contact.contact_phone_e164 into result_phone
  from public.listings as listing
  join public.listing_contacts as contact on contact.listing_id = listing.id and contact.allow_phone
  join public.profiles as seller on seller.id = listing.owner_id and seller.status = 'active'
  where listing.id = target_listing_id and listing.status = 'active'
    and listing.published_at is not null and listing.expires_at > at_time and listing.deleted_at is null
    and contact.contact_phone_e164 ~ '^\+[1-9][0-9]{7,14}$';
  if result_phone is null then return jsonb_build_object('state', 'unavailable'); end if;
  return jsonb_build_object('state', 'revealed', 'phone', result_phone);
end;
$$;
revoke all on function public.reveal_listing_phone(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.reveal_listing_phone(uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
