-- Own-account erasure is coordinated with R2 and Auth by a server-only job.
-- No existing user rows are changed by installing this migration.
begin;
create table private.account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table private.account_deletion_media (
  job_id uuid not null references private.account_deletions(id) on delete cascade,
  storage_key text not null,
  primary key (job_id, storage_key)
);
alter table private.account_deletions enable row level security;
alter table private.account_deletion_media enable row level security;
revoke all on private.account_deletions, private.account_deletion_media from public, anon, authenticated, service_role;

-- Preserve moderation history when its target is erased by an FK SET NULL.
-- Clients cannot update report targets; new reports still require a target.
alter table public.reports drop constraint reports_target_present;
create function private.require_new_report_target()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.listing_id is null and new.reported_user_id is null then
    raise exception 'report target required' using errcode='23514', constraint='reports_target_present';
  end if;
  return new;
end;
$$;
create trigger reports_require_target_on_insert before insert on public.reports
for each row execute function private.require_new_report_target();

-- FK checks alone accept a profile that became deleted while waiting. Lock and
-- recheck its current state before a new listing or restricted account link.
create function private.require_writable_account_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare account_id uuid := (to_jsonb(new)->>tg_argv[0])::uuid; account_status text;
begin
  if account_id is null then return new; end if; -- Auth ON DELETE SET NULL
  select p.status into account_status from public.profiles p where p.id=account_id for share;
  if not found or account_status='deleted' then
    raise exception 'account unavailable for new references' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger listings_require_writable_owner before insert or update of owner_id on public.listings
for each row execute function private.require_writable_account_owner('owner_id');
create trigger user_roles_require_writable_owner before insert or update of user_id on public.user_roles
for each row execute function private.require_writable_account_owner('user_id');
create trigger city_premium_accounts_require_writable_owner before insert or update of owner_id on public.city_premium_accounts
for each row execute function private.require_writable_account_owner('owner_id');

alter policy profiles_owner_update on public.profiles
using (id=(select auth.uid()) and status<>'deleted')
with check (id=(select auth.uid()) and status<>'deleted');
create function private.current_profile_accepts_account_writes()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare account_status text;
begin
  select p.status into account_status from public.profiles p where p.id=(select auth.uid()) for share;
  return found and coalesce(account_status<>'deleted',false);
end;
$$;
alter policy profile_private_owner_insert on public.profile_private
with check (user_id=(select auth.uid()) and (select private.current_profile_accepts_account_writes()));
alter policy profile_private_owner_update on public.profile_private
using (user_id=(select auth.uid()) and (select private.current_profile_accepts_account_writes()))
with check (user_id=(select auth.uid()) and (select private.current_profile_accepts_account_writes()));
revoke all on function private.require_new_report_target(), private.require_writable_account_owner(),
  private.current_profile_accepts_account_writes() from public, anon, authenticated, service_role;
grant execute on function private.current_profile_accepts_account_writes() to authenticated;

create function public.begin_account_deletion(p_user_id uuid, p_token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare avatar text; job uuid;
begin
  if p_user_id is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid deletion request' using errcode='22023';
  end if;
  -- Lock the profile before gathering keys. Owner guards serialize new listings;
  -- listing locks serialize image metadata inserts and publishing.
  select avatar_path into avatar from public.profiles where id=p_user_id for update;
  if not found then raise exception 'profile unavailable' using errcode='42501'; end if;
  if exists(select 1 from public.city_premium_accounts where owner_id=p_user_id)
    or exists(select 1 from public.user_roles where user_id=p_user_id) then
    raise exception 'account requires assisted deletion' using errcode='P0002';
  end if;
  perform id from public.listings where owner_id=p_user_id order by id for update;
  if avatar is not null and avatar !~ ('^avatars/'||p_user_id||'/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|avif)$') then
    raise exception 'media ownership unresolved' using errcode='P0002';
  end if;
  if exists(select 1 from public.listing_images i join public.listings l on l.id=i.listing_id
    where l.owner_id=p_user_id and (i.storage_key !~ ('^listings/'||p_user_id||'/'||l.id||'/[a-zA-Z0-9-]+\.(jpg|png|webp|avif)$'))) then
    raise exception 'media ownership unresolved' using errcode='P0002';
  end if;
  insert into private.account_deletions(user_id,token_hash) values(p_user_id,p_token_hash)
    on conflict(user_id) do update set token_hash=excluded.token_hash
    returning id into job;
  insert into private.account_deletion_media(job_id,storage_key)
    select job,i.storage_key from public.listing_images i join public.listings l on l.id=i.listing_id
      where l.owner_id=p_user_id on conflict do nothing;
  if avatar is not null then
    insert into private.account_deletion_media values(job,avatar) on conflict do nothing;
  end if;
  -- Hide the seller and revoke marketplace writes before external cleanup.
  update public.profiles set status='deleted', display_name='Пользователь удалён',
    avatar_path=null, bio=null, settlement_id=null, last_seen_at=null where id=p_user_id;
  update public.profile_private set contact_phone_e164=null where user_id=p_user_id;
  -- Conversations/messages belong to both participants and are not cascaded.
  update public.conversations set status='closed'
    where participant_low_id=p_user_id or participant_high_id=p_user_id;
  delete from public.listings where owner_id=p_user_id;
end;
$$;

create function public.advance_account_deletion(p_token_hash text, p_deleted_keys text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job private.account_deletions%rowtype; keys jsonb;
begin
  select * into job from private.account_deletions where token_hash=p_token_hash for update;
  if not found then raise exception 'deletion unavailable' using errcode='42501'; end if;
  if coalesce(cardinality(p_deleted_keys),0)>100 then raise exception 'batch too large'; end if;
  delete from private.account_deletion_media where job_id=job.id and storage_key=any(p_deleted_keys);
  select coalesce(jsonb_agg(storage_key),'[]'::jsonb) into keys from (
    select storage_key from private.account_deletion_media where job_id=job.id order by storage_key limit 100
  ) batch;
  return jsonb_build_object('status',job.status,'userId',job.user_id,'keys',keys);
end;
$$;

create function public.finish_account_deletion(p_token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare job private.account_deletions%rowtype;
begin
  select * into job from private.account_deletions where token_hash=p_token_hash for update;
  if not found then raise exception 'deletion unavailable' using errcode='42501'; end if;
  if exists(select 1 from private.account_deletion_media where job_id=job.id)
    or exists(select 1 from auth.users where id=job.user_id) then
    raise exception 'deletion not finished' using errcode='55000';
  end if;
  update private.account_deletions set user_id=null,status='completed',completed_at=coalesce(completed_at,now()) where id=job.id;
end;
$$;
revoke all on function public.begin_account_deletion(uuid,text), public.advance_account_deletion(text,text[]), public.finish_account_deletion(text) from public, anon, authenticated;
grant execute on function public.begin_account_deletion(uuid,text), public.advance_account_deletion(text,text[]), public.finish_account_deletion(text) to service_role;
notify pgrst, 'reload schema';
commit;
