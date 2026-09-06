-- Owner lifecycle and short-lived, PKCE-bound registration handoff.
-- No user content is deleted. Historical migrations remain immutable.
begin;
set local lock_timeout = '5s';

create or replace function private.enforce_listing_publication_period()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' then
    if tg_op = 'INSERT' or old.status = 'pending' then
      new.published_at := clock_timestamp();
      new.expires_at := ((new.published_at at time zone 'Asia/Almaty') + interval '1 month') at time zone 'Asia/Almaty';
    elsif old.status <> 'active' then
      -- Moderator restore preserves the original term; a new term needs resubmission.
      if new.expires_at is null or new.expires_at <= statement_timestamp() then
        raise exception 'publication expired; owner must resubmit' using errcode = '42501';
      end if;
    else
      new.published_at := old.published_at;
      new.expires_at := old.expires_at;
    end if;
  end if;
  return new;
end;
$$;

-- Existing live publications keep their original start, not the migration date.
update public.listings set expires_at =
  ((published_at at time zone 'Asia/Almaty') + interval '1 month') at time zone 'Asia/Almaty'
where status = 'active' and published_at is not null and deleted_at is null;
create trigger listings_publication_period before insert or update on public.listings
for each row execute function private.enforce_listing_publication_period();

create index listings_due_archive_idx on public.listings(expires_at, id)
where status = 'active' and deleted_at is null;

create function public.owner_listing_transition(target_listing_id uuid, requested_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  listing public.listings%rowtype;
  next_status text;
begin
  if auth.uid() is null or not private.current_profile_is_active() then
    raise exception 'active profile required' using errcode = '42501';
  end if;
  select * into listing from public.listings
    where id = target_listing_id and owner_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'listing unavailable' using errcode = '42501'; end if;
  case requested_action
    when 'edit' then next_status := 'draft';
    when 'restore' then
      if listing.status not in ('archived', 'expired', 'sold') and not
        (listing.status = 'active' and listing.expires_at <= statement_timestamp()) then
        raise exception 'listing state changed' using errcode = '42501';
      end if;
      next_status := 'draft';
    when 'delete' then next_status := 'deleted';
    when 'archive' then
      if listing.status not in ('draft','pending','active','rejected','sold','expired') then
        raise exception 'listing state changed' using errcode = '42501';
      end if;
      next_status := 'archived';
    when 'sold' then
      if listing.status <> 'active' or listing.expires_at <= statement_timestamp() then
        raise exception 'listing state changed' using errcode = '42501';
      end if;
      next_status := 'sold';
    else raise exception 'invalid owner action' using errcode = '22023';
  end case;
  -- Editing a rejected draft retains its moderation feedback until resubmission.
  if requested_action = 'edit' and listing.status in ('draft','rejected') then return listing.status; end if;
  update public.listings set status = next_status,
    deleted_at = case when next_status = 'deleted' then statement_timestamp() else null end,
    published_at = case when next_status = 'draft' then null else published_at end,
    expires_at = case when next_status = 'draft' then null else expires_at end,
    promoted_until = null
  where id = target_listing_id;
  return next_status;
end;
$$;
revoke all on function public.owner_listing_transition(uuid,text) from public, anon, service_role;
grant execute on function public.owner_listing_transition(uuid,text) to authenticated;

create or replace function public.archive_own_listing(target_listing_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin perform public.owner_listing_transition(target_listing_id, 'archive'); end;
$$;
create or replace function public.mark_own_listing_sold(target_listing_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin perform public.owner_listing_transition(target_listing_id, 'sold'); end;
$$;
revoke all on function public.archive_own_listing(uuid), public.mark_own_listing_sold(uuid) from public, anon, service_role;
grant execute on function public.archive_own_listing(uuid), public.mark_own_listing_sold(uuid) to authenticated;

create function public.archive_expired_listings()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  with due as (
    select id from public.listings where status = 'active' and deleted_at is null
      and (published_at is null or expires_at is null or expires_at <= statement_timestamp())
    order by expires_at nulls first, id limit 2000 for update skip locked
  ) update public.listings as listing set status = 'archived', promoted_until = null
    from due where listing.id = due.id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.archive_expired_listings() from public, anon, authenticated;
grant execute on function public.archive_expired_listings() to service_role;

-- Exact public cutoff is enforced at read time, independently of the minute cron.
create policy listings_anon_publication_term on public.listings as restrictive for select to anon
using (expires_at > statement_timestamp());
create policy listings_authenticated_publication_term on public.listings as restrictive for select to authenticated
using (owner_id = (select auth.uid()) or private.has_any_role(array['moderator','admin'])
  or expires_at > statement_timestamp());

-- Child policies already restrict archive access to owners/staff. Their EXISTS
-- reads now also pass through the parent's restrictive expiry policy.
create or replace view public.catalog_listing_cards with (security_invoker = true) as
select listing.id, listing.slug, listing.title, listing.price_minor, listing.currency_code,
  listing.category_id, category.slug as category_slug, listing.settlement_id,
  settlement.name_ru as location_name_ru, settlement.name_kk as location_name_kk,
  listing.published_at, (listing.promoted_until is not null and listing.promoted_until > now()) as promoted,
  primary_image.storage_key as primary_image_storage_key, listing.expires_at
from public.listings as listing
join public.categories as category on category.id = listing.category_id
join public.settlements as settlement on settlement.id = listing.settlement_id
left join lateral (select image.storage_key from public.listing_images as image
  where image.listing_id = listing.id order by image.sort_order, image.id limit 1) as primary_image on true
where listing.status = 'active' and listing.published_at is not null and listing.deleted_at is null
  and listing.expires_at > statement_timestamp();

-- Authentication relay: capabilities are independent; the email link can only
-- deposit a code, and only the originating browser has both read proof + PKCE verifier.
create table private.registration_handoffs (
  read_hash text primary key check (read_hash ~ '^[a-f0-9]{64}$'),
  write_hash text not null unique check (write_hash ~ '^[a-f0-9]{64}$'),
  client_hash text not null check (client_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '1 hour'),
  auth_code text check (length(auth_code) <= 2048),
  code_expires_at timestamptz,
  lease_hash text,
  completed_user uuid,
  leased_until timestamptz
);
alter table private.registration_handoffs enable row level security;
revoke all on private.registration_handoffs from public, anon, authenticated, service_role;
create index registration_handoffs_expiry_idx on private.registration_handoffs(expires_at);
create index registration_handoffs_client_idx on private.registration_handoffs(client_hash, created_at);

create function public.registration_handoff(
  operation text, read_proof text default null, write_proof text default null,
  code_value text default null, lease_proof text default null, client_proof text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare handoff private.registration_handoffs%rowtype;
begin
  if operation = 'start' then
    -- Serialize per client before counting; never store addresses, emails or passwords.
    perform pg_advisory_xact_lock(hashtextextended(client_proof, 28));
    delete from private.registration_handoffs where expires_at <= statement_timestamp();
    if (select count(*) from private.registration_handoffs where client_hash = client_proof
        and created_at > statement_timestamp() - interval '10 minutes') >= 5 then
      return jsonb_build_object('state','limited');
    end if;
    insert into private.registration_handoffs(read_hash,write_hash,client_hash)
      values(read_proof,write_proof,client_proof);
    update private.registration_handoffs set auth_code = null, completed_user = null,
      code_expires_at = statement_timestamp(), leased_until = null, lease_hash = null
      where read_hash = lease_proof and read_hash <> read_proof;
    return jsonb_build_object('state','waiting');
  end if;
  select * into handoff from private.registration_handoffs
    where case when operation = 'deposit' then write_hash = write_proof else read_hash = read_proof end
    for update;
  if not found or handoff.expires_at <= statement_timestamp() then return jsonb_build_object('state','missing'); end if;
  if operation = 'deposit' then
    if handoff.completed_user is not null or handoff.code_expires_at <= statement_timestamp() then
      return jsonb_build_object('state','invalid');
    end if;
    if code_value is null or length(code_value) < 8 or length(code_value) > 2048 then
      return jsonb_build_object('state','invalid');
    end if;
    if handoff.auth_code is not null and handoff.auth_code <> code_value then
      return jsonb_build_object('state','invalid');
    end if;
    update private.registration_handoffs set auth_code = code_value,
      code_expires_at = coalesce(code_expires_at, statement_timestamp() + interval '5 minutes')
      where read_hash = handoff.read_hash;
    return jsonb_build_object('state','received');
  elsif operation = 'cancel' then
    -- Keep a rate-limit tombstone until expiry, but invalidate the callback.
    update private.registration_handoffs set auth_code = null, completed_user = null, code_expires_at = statement_timestamp(),
      leased_until = null, lease_hash = null where read_hash = handoff.read_hash;
    return jsonb_build_object('state','missing');
  elsif operation = 'claim' then
    if handoff.completed_user is not null then return jsonb_build_object('state','complete','user_id',handoff.completed_user); end if;
    if handoff.code_expires_at <= statement_timestamp() then return jsonb_build_object('state','expired'); end if;
    if handoff.auth_code is null or handoff.leased_until > statement_timestamp() then return jsonb_build_object('state','waiting'); end if;
    if lease_proof is null or lease_proof !~ '^[a-f0-9]{64}$' then return jsonb_build_object('state','invalid'); end if;
    update private.registration_handoffs set lease_hash = lease_proof,
      leased_until = statement_timestamp() + interval '30 seconds' where read_hash = handoff.read_hash;
    return jsonb_build_object('state','ready','code',handoff.auth_code);
  elsif operation = 'release' and handoff.lease_hash = lease_proof then
    update private.registration_handoffs set lease_hash = null, leased_until = null where read_hash = handoff.read_hash;
    return jsonb_build_object('state','waiting');
  elsif operation = 'finish' and handoff.lease_hash = lease_proof then
    update private.registration_handoffs set auth_code = null, code_expires_at = statement_timestamp(),
      leased_until = null, completed_user = code_value::uuid where read_hash = handoff.read_hash;
    return jsonb_build_object('state','complete');
  end if;
  return jsonb_build_object('state','invalid');
end;
$$;
revoke all on function public.registration_handoff(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.registration_handoff(text,text,text,text,text,text) to service_role;
revoke all on function private.enforce_listing_publication_period() from public, anon, authenticated, service_role;

create or replace function public.get_or_create_listing_conversation(target_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  buyer_id uuid := (select auth.uid());
  seller_id uuid;
  low_id uuid;
  high_id uuid;
  created_conversation_id uuid;
begin
  if buyer_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles where id = buyer_id and status = 'active'
  ) then
    raise exception 'active profile required' using errcode = '42501';
  end if;

  select listing.owner_id into seller_id
  from public.listings as listing
  where listing.id = target_listing_id
    and listing.status = 'active'
    and listing.published_at is not null
    and listing.expires_at > statement_timestamp()
    and listing.deleted_at is null;

  if seller_id is null then
    raise exception 'listing is unavailable';
  end if;
  if seller_id = buyer_id then
    raise exception 'owner cannot create a buyer conversation';
  end if;

  if buyer_id::text < seller_id::text then
    low_id := buyer_id;
    high_id := seller_id;
  else
    low_id := seller_id;
    high_id := buyer_id;
  end if;

  insert into public.conversations (
    listing_id, created_by, participant_low_id, participant_high_id
  ) values (
    target_listing_id, buyer_id, low_id, high_id
  )
  on conflict (listing_id, participant_low_id, participant_high_id) do nothing
  returning id into created_conversation_id;

  if created_conversation_id is null then
    select conversation.id into strict created_conversation_id
    from public.conversations as conversation
    where conversation.listing_id = target_listing_id
      and conversation.participant_low_id = low_id
      and conversation.participant_high_id = high_id;
  end if;

  insert into public.conversation_participants (conversation_id, user_id, participant_role)
  values
    (created_conversation_id, buyer_id, 'buyer'),
    (created_conversation_id, seller_id, 'seller')
  on conflict (conversation_id, user_id) do nothing;

  return created_conversation_id;
end;
$$;

create or replace function public.get_city_premium_placements(
  p_settlement_id uuid,
  p_limit integer default 15
)
returns table (
  placement_id uuid,
  listing_id uuid,
  slug text,
  title text,
  price_minor bigint,
  currency_code char(3),
  settlement_id uuid,
  location_name_ru text,
  location_name_kk text,
  primary_image_storage_key text,
  published_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    placement.id,
    listing.id,
    listing.slug,
    listing.title,
    listing.price_minor,
    listing.currency_code,
    listing.settlement_id,
    settlement.name_ru,
    settlement.name_kk,
    image.storage_key,
    listing.published_at,
    placement.starts_at,
    least(placement.ends_at, listing.expires_at)
  from public.city_premium_placements as placement
  join public.listings as listing on listing.id = placement.listing_id
  join public.settlements as settlement on settlement.id = placement.settlement_id
  left join lateral (
    select listing_image.storage_key
    from public.listing_images as listing_image
    where listing_image.listing_id = listing.id
    order by listing_image.sort_order, listing_image.id
    limit 1
  ) as image on true
  where placement.settlement_id = p_settlement_id
    and placement.status = 'active'
    and placement.starts_at <= current_timestamp
    and placement.ends_at > current_timestamp
    and listing.status = 'active'
    and listing.expires_at > statement_timestamp()
    and listing.published_at is not null
    and listing.deleted_at is null
    and listing.settlement_id = placement.settlement_id
  order by md5(p_settlement_id::text || ':' || placement.id::text), placement.id
  limit least(greatest(coalesce(p_limit, 15), 1), 15);
$$;

create policy favorites_insert_publication_term on public.favorites as restrictive
for insert to authenticated with check (exists (
  select 1 from public.listings as listing where listing.id = listing_id
    and listing.status = 'active' and listing.deleted_at is null
    and listing.published_at is not null and listing.expires_at > statement_timestamp()
));

select public.archive_expired_listings();
notify pgrst, 'reload schema';
commit;
