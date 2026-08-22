-- Marketo v1.0: public seller profiles, private contact data and database roles.

begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Пользователь',
  avatar_path text,
  bio text,
  language_code varchar(10) not null default 'ru' references public.locales(code) on delete restrict,
  settlement_id uuid references public.settlements(id) on delete set null,
  status text not null default 'active',
  verified_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 80),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 1000),
  constraint profiles_status_check check (status in ('active', 'suspended', 'banned', 'deleted'))
);

-- Email and Auth credentials stay exclusively in auth.users. This table holds
-- only user-controlled marketplace contact data and is never publicly readable.
create table public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  contact_phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_private_phone_format check (
    contact_phone_e164 is null or contact_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  )
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role),
  constraint user_roles_role_check check (role in ('support', 'moderator', 'admin'))
);

create or replace function private.has_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.user_roles as role_row
      where role_row.user_id = (select auth.uid())
        and role_row.role = any(required_roles)
    ),
    false
  );
$$;

revoke all on function private.has_any_role(text[]) from public;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_language text;
  selected_name text;
begin
  select locale.code into selected_language
  from public.locales as locale
  where locale.code = new.raw_user_meta_data ->> 'language'
    and locale.is_active;
  selected_language := coalesce(selected_language, 'ru');

  selected_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      case when selected_language = 'kk' then 'Қолданушы' else 'Пользователь' end
    ),
    80
  );

  insert into public.profiles (id, display_name, language_code)
  values (new.id, selected_name, selected_language)
  on conflict (id) do nothing;

  insert into public.profile_private (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

-- The browser role only receives the public seller columns on `profiles`.
-- These narrowly-scoped RPCs provide self/staff access to protected columns
-- without granting every authenticated user table-wide SELECT privileges.
create or replace function public.get_my_profile()
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  bio text,
  language_code varchar(10),
  settlement_id uuid,
  status text,
  verified_at timestamptz,
  last_seen_at timestamptz,
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
    profile.last_seen_at,
    profile.created_at,
    profile.updated_at
  from public.profiles as profile
  where profile.id = (select auth.uid());
$$;

revoke all on function public.get_my_profile() from public;

create or replace function public.get_profile_for_staff(target_profile_id uuid)
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  bio text,
  language_code varchar(10),
  settlement_id uuid,
  status text,
  verified_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not private.has_any_role(array['moderator', 'admin'])
  then
    raise exception 'moderator role required' using errcode = '42501';
  end if;

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
    profile.last_seen_at,
    profile.created_at,
    profile.updated_at
  from public.profiles as profile
  where profile.id = target_profile_id;
end;
$$;

revoke all on function public.get_profile_for_staff(uuid) from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger profile_private_set_updated_at
before update on public.profile_private
for each row execute function private.set_updated_at();

commit;
