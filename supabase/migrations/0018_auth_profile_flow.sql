-- Marketo v1.0: authenticated account profile read/update contract.

begin;

create or replace function public.get_my_account_profile()
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  bio text,
  language_code varchar(10),
  settlement_id uuid,
  status text,
  verified_at timestamptz,
  contact_phone_e164 text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.display_name,
    profile.avatar_path,
    profile.bio,
    profile.language_code,
    profile.settlement_id,
    profile.status,
    profile.verified_at,
    private_profile.contact_phone_e164,
    profile.created_at,
    profile.updated_at
  from public.profiles as profile
  join public.profile_private as private_profile on private_profile.user_id = profile.id
  where profile.id = (select auth.uid());
$$;

revoke all on function public.get_my_account_profile() from public;
grant execute on function public.get_my_account_profile() to authenticated;

create or replace function public.update_my_account_profile(
  p_display_name text,
  p_bio text,
  p_language_code varchar(10),
  p_settlement_id uuid,
  p_contact_phone_e164 text
)
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  bio text,
  language_code varchar(10),
  settlement_id uuid,
  status text,
  verified_at timestamptz,
  contact_phone_e164 text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_name text := btrim(coalesce(p_display_name, ''));
  normalized_bio text := nullif(btrim(coalesce(p_bio, '')), '');
  normalized_phone text := nullif(btrim(coalesce(p_contact_phone_e164, '')), '');
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if char_length(normalized_name) not between 1 and 80 then
    raise exception 'display name must contain 1 to 80 characters';
  end if;
  if normalized_bio is not null and char_length(normalized_bio) > 1000 then
    raise exception 'bio is too long';
  end if;
  if normalized_phone is not null and normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid phone format';
  end if;
  if not exists (
    select 1 from public.locales
    where code = p_language_code and is_active
  ) then
    raise exception 'unsupported language';
  end if;
  if p_settlement_id is not null and not exists (
    select 1 from public.settlements as settlement
    where settlement.id = p_settlement_id
      and settlement.is_active
      and settlement.is_selectable
  ) then
    raise exception 'invalid settlement';
  end if;

  update public.profiles as profile
  set
    display_name = normalized_name,
    bio = normalized_bio,
    language_code = p_language_code,
    settlement_id = p_settlement_id
  where profile.id = actor_id and profile.status = 'active';

  if not found then
    raise exception 'active profile required' using errcode = '42501';
  end if;

  insert into public.profile_private (user_id, contact_phone_e164)
  values (actor_id, normalized_phone)
  on conflict (user_id) do update
  set contact_phone_e164 = excluded.contact_phone_e164;

  return query
  select
    profile.id,
    profile.display_name,
    profile.avatar_path,
    profile.bio,
    profile.language_code,
    profile.settlement_id,
    profile.status,
    profile.verified_at,
    private_profile.contact_phone_e164,
    profile.created_at,
    profile.updated_at
  from public.profiles as profile
  join public.profile_private as private_profile on private_profile.user_id = profile.id
  where profile.id = actor_id;
end;
$$;

revoke all on function public.update_my_account_profile(text, text, varchar, uuid, text) from public;
grant execute on function public.update_my_account_profile(text, text, varchar, uuid, text) to authenticated;

commit;
