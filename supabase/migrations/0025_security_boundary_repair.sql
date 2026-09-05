-- Marketo v1.0: forward-only RPC and moderation boundary repair.
-- Repairs production drift without rewriting the immutable 0021-0022 history.

begin;

set local lock_timeout = '5s';
set local search_path = pg_catalog, pg_temp, public;

create temporary table marketo_security_0025_functions (
  signature text primary key,
  allow_anon boolean not null,
  allow_authenticated boolean not null,
  allow_service_role boolean not null
) on commit drop;

insert into marketo_security_0025_functions (
  signature, allow_anon, allow_authenticated, allow_service_role
) values
  ('private.set_updated_at()', false, false, false),
  ('private.validate_settlement_parent()', false, false, false),
  ('private.has_any_role(text[])', false, true, false),
  ('private.handle_new_auth_user()', false, false, false),
  ('private.category_is_ancestor(uuid,uuid)', false, true, true),
  ('private.check_category_parent_cycle()', false, false, false),
  ('private.validate_listing_currency()', false, false, false),
  ('private.attribute_applies_to_listing(uuid,uuid)', false, true, true),
  ('private.validate_listing_scalar_attribute()', false, false, false),
  ('private.validate_listing_option_attribute()', false, false, false),
  ('private.archive_listings_for_deleted_profile()', false, false, false),
  ('private.is_conversation_participant(uuid)', false, true, false),
  ('private.touch_conversation_after_message()', false, false, false),
  ('private.current_profile_is_active()', false, true, false),
  ('private.ensure_city_premium_setting()', false, false, false),
  ('private.validate_city_premium_placement()', false, false, false),
  ('private.apply_contextual_catalog_metadata()', false, false, false),
  ('private.assign_city_premium_metric_account()', false, false, false),
  ('private.validate_listing_leaf_category()', false, false, false),
  ('public.get_my_profile()', false, true, false),
  ('public.get_profile_for_staff(uuid)', false, true, false),
  ('public.submit_listing(uuid)', false, true, true),
  ('public.archive_own_listing(uuid)', false, true, true),
  ('public.mark_own_listing_sold(uuid)', false, true, true),
  ('public.moderate_listing(uuid,text,text,text)', false, true, false),
  ('public.resolve_report(uuid,text,text)', false, true, false),
  ('public.assign_user_role(uuid,text,boolean)', false, true, false),
  ('public.get_or_create_listing_conversation(uuid)', false, true, false),
  ('public.create_listing_draft(uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb)', false, true, true),
  ('public.search_catalog_listing_cards(uuid[],uuid,text,bigint,bigint,jsonb)', true, true, true),
  ('public.get_my_account_profile()', false, true, false),
  ('public.update_my_account_profile(text,text,character varying,uuid,text)', false, true, false),
  ('public.get_city_premium_placements(uuid,integer)', true, true, true),
  ('public.update_listing_draft(uuid,uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb)', false, true, false),
  ('public.get_my_listing_moderation_feedback(uuid)', false, true, false);

-- A signature allowlist is not sufficient if a known callable function was
-- replaced in-place. Fingerprint stable pg_proc source/security metadata and
-- the exact result contract. The four functions rebuilt below are checked only
-- after repair; every other callable function must already match before any
-- privilege is changed.
create temporary table marketo_security_0025_function_contracts (
  signature text primary key,
  function_result text not null,
  canonical_fingerprint text not null check (canonical_fingerprint ~ '^[0-9a-f]{32}$'),
  repaired_here boolean not null
) on commit drop;

insert into marketo_security_0025_function_contracts (
  signature, function_result, canonical_fingerprint, repaired_here
) values
  ('private.attribute_applies_to_listing(uuid,uuid)', 'boolean', 'cbcb3d11b1d1f69dbace5e172cfcd8d5', false),
  ('private.category_is_ancestor(uuid,uuid)', 'boolean', 'faddcd371c5a701080b8365885e5b47a', false),
  ('private.current_profile_is_active()', 'boolean', 'ec24d6f89c2dc008b730ab2ec5dbab63', false),
  ('private.has_any_role(text[])', 'boolean', 'a3f12f290a1d5a6ca3cdc233683ec633', true),
  ('private.is_conversation_participant(uuid)', 'boolean', '592fa1fefc410095ac61a373ec893ef0', false),
  ('public.archive_own_listing(uuid)', 'void', 'c5746d466aa4a29c77fa50407af3b643', false),
  ('public.assign_user_role(uuid,text,boolean)', 'void', 'eaccf01d78da7f438dc618076b072c5a', false),
  ('public.create_listing_draft(uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb)', 'TABLE(listing_id uuid, listing_slug text)', '6ff5bd7a8be46431162da3cdc35ea336', false),
  ('public.get_city_premium_placements(uuid,integer)', 'TABLE(placement_id uuid, listing_id uuid, slug text, title text, price_minor bigint, currency_code character, settlement_id uuid, location_name_ru text, location_name_kk text, primary_image_storage_key text, published_at timestamp with time zone, starts_at timestamp with time zone, ends_at timestamp with time zone)', 'a6c0b9c2982adea34f61e111104fe79e', false),
  ('public.get_my_account_profile()', 'TABLE(id uuid, display_name text, avatar_path text, bio text, language_code character varying, settlement_id uuid, status text, verified_at timestamp with time zone, contact_phone_e164 text, created_at timestamp with time zone, updated_at timestamp with time zone)', '1295395e20d935073206a719c3ca4445', false),
  ('public.get_my_listing_moderation_feedback(uuid)', 'TABLE(listing_id uuid, reason_code text, rejected_at timestamp with time zone)', 'c71914133cf3eba58d142984d1fb1b8b', true),
  ('public.get_my_profile()', 'TABLE(id uuid, display_name text, avatar_path text, bio text, language_code character varying, settlement_id uuid, status text, verified_at timestamp with time zone, last_seen_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)', 'c66ffade1e9fcef0c287a9f6d0890b6c', false),
  ('public.get_or_create_listing_conversation(uuid)', 'uuid', '3fd59b45e2764f4a550f9952e2787d26', false),
  ('public.get_profile_for_staff(uuid)', 'TABLE(id uuid, display_name text, avatar_path text, bio text, language_code character varying, settlement_id uuid, status text, verified_at timestamp with time zone, last_seen_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)', '771171b194837da3ac3c887499f8bd78', false),
  ('public.mark_own_listing_sold(uuid)', 'void', '9289ef71bd09f4560a73e8b70f6b4251', false),
  ('public.moderate_listing(uuid,text,text,text)', 'void', '2bef02156e6de0f3ae3939414286a4f4', true),
  ('public.resolve_report(uuid,text,text)', 'void', '5796f0effe5336651059579a789dbfd6', false),
  ('public.search_catalog_listing_cards(uuid[],uuid,text,bigint,bigint,jsonb)', 'SETOF catalog_listing_cards', 'f3f1749d8407677f41d176740fa2ebf0', false),
  ('public.submit_listing(uuid)', 'void', '48d4072b18a7ceeb1da335c8c6269fc8', false),
  ('public.update_listing_draft(uuid,uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb)', 'TABLE(listing_id uuid, listing_slug text, listing_status text)', '59de87283b5a8252e7665ce7233e1bb3', true),
  ('public.update_my_account_profile(text,text,character varying,uuid,text)', 'TABLE(id uuid, display_name text, avatar_path text, bio text, language_code character varying, settlement_id uuid, status text, verified_at timestamp with time zone, contact_phone_e164 text, created_at timestamp with time zone, updated_at timestamp with time zone)', '5f01b7337ca06a902e20c8afeaf07073', false);

create temporary table marketo_security_0025_actual_function_contracts (
  signature text primary key,
  function_result text not null,
  fingerprint text not null
) on commit drop;

insert into marketo_security_0025_actual_function_contracts (
  signature, function_result, fingerprint
)
select
  function_inventory.signature,
  pg_get_function_result(procedure.oid),
  md5(
    language.lanname || ' | ' ||
    procedure.prokind::text || ' | ' ||
    procedure.provolatile::text || ' | ' ||
    procedure.prosecdef::text || ' | ' ||
    procedure.proleakproof::text || ' | ' ||
    procedure.proisstrict::text || ' | ' ||
    procedure.proretset::text || ' | ' ||
    procedure.proparallel::text || ' | ' ||
    coalesce((
      select array_agg(config_value order by config_value)::text
      from unnest(coalesce(procedure.proconfig, '{}'::text[])) as config_value
    ), '{}') || ' | ' ||
    coalesce(to_jsonb(procedure.proargnames)::text, 'null') || ' | ' ||
    coalesce(to_jsonb(procedure.proargmodes)::text, 'null') || ' | ' ||
    procedure.pronargdefaults::text || ' | ' ||
    coalesce(pg_get_expr(procedure.proargdefaults, 0, false), 'null') || ' | ' ||
    procedure.prosrc
  )
from marketo_security_0025_functions as function_inventory
join pg_proc as procedure
  on procedure.oid = to_regprocedure(function_inventory.signature)
join pg_language as language on language.oid = procedure.prolang;

create temporary table marketo_security_0025_policies (
  table_name text not null,
  policy_name text not null,
  expected_cmd text not null,
  expected_role name not null,
  moderation_guarded boolean not null default false,
  primary key (table_name, policy_name)
) on commit drop;

insert into marketo_security_0025_policies (
  table_name, policy_name, expected_cmd, expected_role, moderation_guarded
) values
  ('profiles', 'profiles_anon_public_read', 'SELECT', 'anon', false),
  ('profiles', 'profiles_authenticated_read', 'SELECT', 'authenticated', false),
  ('profiles', 'profiles_owner_update', 'UPDATE', 'authenticated', false),
  ('profiles', 'profiles_moderation_staff_read', 'SELECT', 'authenticated', true),
  ('listings', 'listings_anon_active_read', 'SELECT', 'anon', false),
  ('listings', 'listings_authenticated_read', 'SELECT', 'authenticated', true),
  ('listings', 'listings_owner_insert_draft', 'INSERT', 'authenticated', false),
  ('listings', 'listings_owner_update_editable', 'UPDATE', 'authenticated', false),
  ('listing_attribute_values', 'listing_attribute_values_anon_active_read', 'SELECT', 'anon', false),
  ('listing_attribute_values', 'listing_attribute_values_authenticated_read', 'SELECT', 'authenticated', true),
  ('listing_attribute_values', 'listing_attribute_values_owner_insert', 'INSERT', 'authenticated', false),
  ('listing_attribute_values', 'listing_attribute_values_owner_update', 'UPDATE', 'authenticated', false),
  ('listing_attribute_values', 'listing_attribute_values_owner_delete', 'DELETE', 'authenticated', false),
  ('listing_attribute_option_values', 'listing_attribute_options_anon_active_read', 'SELECT', 'anon', false),
  ('listing_attribute_option_values', 'listing_attribute_options_authenticated_read', 'SELECT', 'authenticated', true),
  ('listing_attribute_option_values', 'listing_attribute_options_owner_insert', 'INSERT', 'authenticated', false),
  ('listing_attribute_option_values', 'listing_attribute_options_owner_delete', 'DELETE', 'authenticated', false),
  ('listing_images', 'listing_images_anon_active_read', 'SELECT', 'anon', false),
  ('listing_images', 'listing_images_authenticated_read', 'SELECT', 'authenticated', true);

do $marketo_security_0025_preflight$
declare
  missing_objects text;
  unexpected_objects text;
begin
  select string_agg(function_inventory.signature, ', ' order by function_inventory.signature)
  into missing_objects
  from marketo_security_0025_functions as function_inventory
  where to_regprocedure(function_inventory.signature) is null;

  if missing_objects is not null then
    raise exception '0025 requires missing function(s): %', missing_objects;
  end if;

  select string_agg(procedure.oid::regprocedure::text, ', ' order by procedure.oid::regprocedure::text)
  into unexpected_objects
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname in ('public', 'private')
    and not exists (
      select 1
      from marketo_security_0025_functions as function_inventory
      where to_regprocedure(function_inventory.signature) = procedure.oid
    );

  if unexpected_objects is not null then
    raise exception '0025 refuses unreviewed public/private function(s): %', unexpected_objects;
  end if;

  select string_agg(procedure.oid::regprocedure::text, ', ' order by procedure.oid::regprocedure::text)
  into unexpected_objects
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname in ('public', 'private')
    and procedure.proowner <> (select oid from pg_roles where rolname = current_user);

  if unexpected_objects is not null then
    raise exception '0025 requires the migration role to own every managed function; mismatches: %', unexpected_objects;
  end if;

  select string_agg(function_inventory.signature, ', ' order by function_inventory.signature)
  into unexpected_objects
  from marketo_security_0025_functions as function_inventory
  where (
    function_inventory.allow_anon
    or function_inventory.allow_authenticated
    or function_inventory.allow_service_role
  ) is distinct from exists (
    select 1
    from marketo_security_0025_function_contracts as expected_contract
    where expected_contract.signature = function_inventory.signature
  );

  if unexpected_objects is not null then
    raise exception '0025 callable function contract inventory mismatch: %', unexpected_objects;
  end if;

  select string_agg(expected_contract.signature, ', ' order by expected_contract.signature)
  into unexpected_objects
  from marketo_security_0025_function_contracts as expected_contract
  left join marketo_security_0025_actual_function_contracts as actual_contract
    on actual_contract.signature = expected_contract.signature
  where not expected_contract.repaired_here
    and (
      actual_contract.signature is null
      or actual_contract.function_result is distinct from expected_contract.function_result
      or actual_contract.fingerprint is distinct from expected_contract.canonical_fingerprint
    );

  if unexpected_objects is not null then
    raise exception '0025 refuses drifted reviewed callable function contract(s): %', unexpected_objects;
  end if;

  select string_agg(policy.tablename || '.' || policy.policyname, ', '
                    order by policy.tablename, policy.policyname)
  into unexpected_objects
  from pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename in (
      'profiles',
      'listings',
      'listing_attribute_values',
      'listing_attribute_option_values',
      'listing_images'
    )
    and not exists (
      select 1
      from marketo_security_0025_policies as policy_inventory
      where policy_inventory.table_name = policy.tablename
        and policy_inventory.policy_name = policy.policyname
    );

  if unexpected_objects is not null then
    raise exception '0025 refuses unreviewed RLS policy/policies: %', unexpected_objects;
  end if;

end;
$marketo_security_0025_preflight$;

lock table
  public.listings,
  public.listing_attribute_values,
  public.listing_attribute_option_values,
  public.listing_images,
  public.profiles
in access exclusive mode;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_attribute_values enable row level security;
alter table public.listing_attribute_option_values enable row level security;
alter table public.listing_images enable row level security;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. This must
-- be changed globally for the object-creating role; a schema-scoped REVOKE
-- cannot override the built-in global grant.
alter default privileges revoke execute on functions
from public, anon, authenticated, service_role;

-- Remove any explicit schema-level additions as well. This complements the
-- global REVOKE above; it does not attempt to replace it.
alter default privileges in schema public, private revoke execute on functions
from public, anon, authenticated, service_role;

-- Repair schema boundaries as well as function ACLs. Runtime roles can resolve
-- reviewed objects, but none of them can create objects in an exposed schema;
-- the anonymous role cannot resolve private helpers at all.
revoke all on schema private
from public, anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;

revoke create on schema public
from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

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
      join public.profiles as profile on profile.id = role_row.user_id
      where role_row.user_id = (select auth.uid())
        and role_row.role = any(required_roles)
        and profile.status = 'active'
    ),
    false
  );
$$;

-- Recreate the complete reviewed policy set on every affected table. Checking
-- policy names alone is insufficient because a same-name drifted qualifier or
-- role list can silently broaden a permissive RLS boundary.
drop policy if exists profiles_anon_public_read on public.profiles;
create policy profiles_anon_public_read
on public.profiles for select to anon
using (status = 'active');

drop policy if exists profiles_authenticated_read on public.profiles;
create policy profiles_authenticated_read
on public.profiles for select to authenticated
using (
  status = 'active'
  or id = (select auth.uid())
);

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists profiles_moderation_staff_read on public.profiles;
create policy profiles_moderation_staff_read
on public.profiles for select to authenticated
using ((select private.has_any_role(array['moderator', 'admin'])));

drop policy if exists listings_anon_active_read on public.listings;
create policy listings_anon_active_read
on public.listings for select to anon
using (status = 'active' and published_at is not null and deleted_at is null);

drop policy if exists listings_authenticated_read on public.listings;
create policy listings_authenticated_read
on public.listings for select to authenticated
using (
  (status = 'active' and published_at is not null and deleted_at is null)
  or owner_id = (select auth.uid())
  or (select private.has_any_role(array['moderator', 'admin']))
);

drop policy if exists listings_owner_insert_draft on public.listings;
create policy listings_owner_insert_draft
on public.listings for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and status = 'draft'
  and deleted_at is null
  and (select private.current_profile_is_active())
);

drop policy if exists listings_owner_update_editable on public.listings;
create policy listings_owner_update_editable
on public.listings for update to authenticated
using (
  owner_id = (select auth.uid())
  and status in ('draft', 'rejected')
  and (select private.current_profile_is_active())
)
with check (
  owner_id = (select auth.uid())
  and status in ('draft', 'rejected')
  and deleted_at is null
);

drop policy if exists listing_attribute_values_anon_active_read on public.listing_attribute_values;
create policy listing_attribute_values_anon_active_read
on public.listing_attribute_values for select to anon
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and listings.status = 'active'
      and listings.published_at is not null
      and listings.deleted_at is null
  )
);

drop policy if exists listing_attribute_values_authenticated_read on public.listing_attribute_values;
create policy listing_attribute_values_authenticated_read
on public.listing_attribute_values for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and (
        (listings.status = 'active' and listings.published_at is not null and listings.deleted_at is null)
        or listings.owner_id = (select auth.uid())
        or (select private.has_any_role(array['moderator', 'admin']))
      )
  )
);

drop policy if exists listing_attribute_values_owner_insert on public.listing_attribute_values;
create policy listing_attribute_values_owner_insert
on public.listing_attribute_values for insert to authenticated
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

drop policy if exists listing_attribute_values_owner_update on public.listing_attribute_values;
create policy listing_attribute_values_owner_update
on public.listing_attribute_values for update to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
)
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

drop policy if exists listing_attribute_values_owner_delete on public.listing_attribute_values;
create policy listing_attribute_values_owner_delete
on public.listing_attribute_values for delete to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

drop policy if exists listing_attribute_options_anon_active_read on public.listing_attribute_option_values;
create policy listing_attribute_options_anon_active_read
on public.listing_attribute_option_values for select to anon
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_option_values.listing_id
      and listings.status = 'active'
      and listings.published_at is not null
      and listings.deleted_at is null
  )
);

drop policy if exists listing_attribute_options_authenticated_read on public.listing_attribute_option_values;
create policy listing_attribute_options_authenticated_read
on public.listing_attribute_option_values for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_option_values.listing_id
      and (
        (listings.status = 'active' and listings.published_at is not null and listings.deleted_at is null)
        or listings.owner_id = (select auth.uid())
        or (select private.has_any_role(array['moderator', 'admin']))
      )
  )
);

drop policy if exists listing_attribute_options_owner_insert on public.listing_attribute_option_values;
create policy listing_attribute_options_owner_insert
on public.listing_attribute_option_values for insert to authenticated
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_option_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

drop policy if exists listing_attribute_options_owner_delete on public.listing_attribute_option_values;
create policy listing_attribute_options_owner_delete
on public.listing_attribute_option_values for delete to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_option_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

drop policy if exists listing_images_anon_active_read on public.listing_images;
create policy listing_images_anon_active_read
on public.listing_images for select to anon
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_images.listing_id
      and listings.status = 'active'
      and listings.published_at is not null
      and listings.deleted_at is null
  )
);

drop policy if exists listing_images_authenticated_read on public.listing_images;
create policy listing_images_authenticated_read
on public.listing_images for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_images.listing_id
      and (
        (listings.status = 'active' and listings.published_at is not null and listings.deleted_at is null)
        or listings.owner_id = (select auth.uid())
        or (select private.has_any_role(array['moderator', 'admin']))
      )
  )
);

create or replace function public.moderate_listing(
  target_listing_id uuid,
  decision text,
  reason_code text default null,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  old_status text;
  next_status text;
  normalized_reason text := nullif(btrim(reason_code), '');
  normalized_note text := nullif(btrim(note), '');
begin
  if actor_id is null or not private.has_any_role(array['moderator', 'admin']) then
    raise exception 'moderator role required' using errcode = '42501';
  end if;

  if decision not in ('approve', 'reject', 'hide', 'restore') then
    raise exception 'invalid moderation decision' using errcode = '22023';
  end if;

  if decision in ('reject', 'hide') and normalized_reason is null then
    raise exception 'reason_code is required for reject and hide decisions' using errcode = '22023';
  end if;

  if normalized_reason is not null and (
    char_length(normalized_reason) > 64
    or normalized_reason !~ '^[a-z][a-z0-9_]{1,63}$'
    or normalized_reason not in (
      'incomplete_information',
      'wrong_category',
      'duplicate',
      'photo_issue',
      'policy_violation',
      'other'
    )
  ) then
    raise exception 'invalid moderation reason_code' using errcode = '22023';
  end if;

  if normalized_note is not null and char_length(normalized_note) > 2000 then
    raise exception 'moderation note is too long' using errcode = '22023';
  end if;

  if decision in ('approve', 'restore') then
    normalized_reason := null;
  end if;

  select status into old_status
  from public.listings
  where id = target_listing_id
    and deleted_at is null
  for update;

  if old_status is null then
    raise exception 'listing is unavailable for moderation' using errcode = 'P0002';
  end if;

  next_status := case
    when decision = 'approve' and old_status = 'pending' then 'active'
    when decision = 'reject' and old_status = 'pending' then 'rejected'
    when decision = 'hide' and old_status = 'active' then 'archived'
    when decision = 'restore' and old_status = 'archived' then 'active'
    else null
  end;

  if next_status is null then
    raise exception 'moderation transition % -> % is not allowed', old_status, decision
      using errcode = '22023';
  end if;

  update public.listings
  set status = next_status,
      published_at = case
        when next_status = 'active' then coalesce(published_at, now())
        else published_at
      end
  where id = target_listing_id;

  insert into public.moderation_actions (
    listing_id, moderator_id, action, previous_status, new_status, reason_code, note
  ) values (
    target_listing_id, actor_id, decision, old_status, next_status, normalized_reason, normalized_note
  );

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'listing.' || decision,
    'listing',
    target_listing_id::text,
    jsonb_build_object(
      'previous_status', old_status,
      'new_status', next_status,
      'reason_code', normalized_reason,
      'note', normalized_note
    )
  );
end;
$$;

-- Reassert the canonical owner lifecycle RPC contracts from 0023. The remote
-- audit can prove that a signature exists, but existence alone cannot prove a
-- safe body, return projection, volatility or search-path boundary.
create or replace function public.update_listing_draft(
  target_listing_id uuid,
  p_category_id uuid,
  p_settlement_id uuid,
  p_title text,
  p_description text,
  p_price_minor bigint,
  p_currency_code char(3),
  p_contact_name text,
  p_contact_phone_e164 text,
  p_allow_messages boolean default true,
  p_attributes jsonb default '[]'::jsonb
)
returns table(listing_id uuid, listing_slug text, listing_status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_slug text;
  current_status text;
  attribute_item jsonb;
  option_text text;
  target_attribute_id uuid;
  expected_data_type text;
  seen_attribute_ids uuid[] := array[]::uuid[];
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not (select private.current_profile_is_active()) then
    raise exception 'active profile required' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_attributes, '[]'::jsonb)) <> 'array' then
    raise exception 'attributes must be a JSON array' using errcode = '22023';
  end if;

  select listing.slug, listing.status
  into current_slug, current_status
  from public.listings as listing
  where listing.id = target_listing_id
    and listing.owner_id = actor_id
    and listing.status in ('draft', 'rejected')
    and listing.deleted_at is null
  for update;

  if not found then
    raise exception 'listing is not editable' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.categories as category
    where category.id = p_category_id
      and category.is_active
      and not exists (
        select 1 from public.categories as child
        where child.parent_id = category.id and child.is_active
      )
  ) then
    raise exception 'an active leaf category is required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.settlements
    where id = p_settlement_id and is_active and is_selectable
  ) then
    raise exception 'an active selectable settlement is required' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 70 then
    raise exception 'listing title is outside the product contract' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 10 and 20000 then
    raise exception 'listing description is outside the product contract' using errcode = '22023';
  end if;
  if p_price_minor is not null and (p_price_minor < 0 or p_price_minor > 90000000000) then
    raise exception 'listing price is outside the product contract' using errcode = '22023';
  end if;
  if p_currency_code <> 'KZT' then
    raise exception 'unsupported listing currency' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_contact_name, ''))) not between 1 and 80 then
    raise exception 'listing contact name is outside the product contract' using errcode = '22023';
  end if;
  if p_contact_phone_e164 is null or p_contact_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'listing contact phone is invalid' using errcode = '22023';
  end if;

  update public.listings
  set category_id = p_category_id,
      settlement_id = p_settlement_id,
      title = btrim(p_title),
      description = btrim(p_description),
      price_minor = p_price_minor,
      currency_code = p_currency_code
  where id = target_listing_id;

  insert into public.listing_contacts (
    listing_id, contact_name, contact_phone_e164, allow_messages, allow_phone
  ) values (
    target_listing_id, btrim(p_contact_name), p_contact_phone_e164,
    coalesce(p_allow_messages, true), false
  )
  on conflict on constraint listing_contacts_pkey do update
  set contact_name = excluded.contact_name,
      contact_phone_e164 = excluded.contact_phone_e164,
      allow_messages = excluded.allow_messages,
      allow_phone = false;

  -- Removing first guarantees that a category change cannot leave incompatible
  -- values behind. Any later failure rolls the entire function call back.
  delete from public.listing_attribute_option_values
  where listing_attribute_option_values.listing_id = target_listing_id;
  delete from public.listing_attribute_values
  where listing_attribute_values.listing_id = target_listing_id;

  for attribute_item in
    select item.value
    from jsonb_array_elements(coalesce(p_attributes, '[]'::jsonb)) with ordinality as item(value, position)
    order by item.position
  loop
    begin
      target_attribute_id := (attribute_item ->> 'attribute_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid attribute identifier' using errcode = '22023';
    end;

    if target_attribute_id = any(seen_attribute_ids) then
      raise exception 'duplicate attribute identifier' using errcode = '22023';
    end if;
    seen_attribute_ids := array_append(seen_attribute_ids, target_attribute_id);

    select attribute.data_type
    into expected_data_type
    from public.category_attributes as attribute
    where attribute.id = target_attribute_id
      and attribute.is_active
      and attribute.is_visible;

    if expected_data_type is null
       or expected_data_type <> attribute_item ->> 'data_type'
       or not private.attribute_applies_to_listing(target_listing_id, target_attribute_id) then
      raise exception 'attribute type or category mismatch' using errcode = '22023';
    end if;

    if expected_data_type in ('select', 'multiselect') then
      if jsonb_typeof(coalesce(attribute_item -> 'option_ids', '[]'::jsonb)) <> 'array'
         or jsonb_array_length(coalesce(attribute_item -> 'option_ids', '[]'::jsonb)) = 0 then
        raise exception 'option_ids must be a non-empty JSON array' using errcode = '22023';
      end if;
      if expected_data_type = 'select'
         and jsonb_array_length(attribute_item -> 'option_ids') <> 1 then
        raise exception 'select attribute accepts one option' using errcode = '22023';
      end if;
      for option_text in
        select jsonb_array_elements_text(attribute_item -> 'option_ids')
      loop
        insert into public.listing_attribute_option_values (listing_id, attribute_id, option_id)
        values (target_listing_id, target_attribute_id, option_text::uuid);
      end loop;
    else
      insert into public.listing_attribute_values (
        listing_id,
        attribute_id,
        text_value,
        number_value,
        boolean_value,
        date_value,
        number_min_value,
        number_max_value
      ) values (
        target_listing_id,
        target_attribute_id,
        case when expected_data_type = 'text' then attribute_item ->> 'value' end,
        case when expected_data_type = 'number' then (attribute_item ->> 'value')::numeric end,
        case when expected_data_type = 'boolean' then (attribute_item ->> 'value')::boolean end,
        case when expected_data_type = 'date' then (attribute_item ->> 'value')::date end,
        case when expected_data_type = 'range' then (attribute_item ->> 'min')::numeric end,
        case when expected_data_type = 'range' then (attribute_item ->> 'max')::numeric end
      );
    end if;
  end loop;

  return query select target_listing_id, current_slug, current_status;
end;
$$;

comment on function public.update_listing_draft(uuid, uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb)
is 'Atomically replaces an active owner draft/rejected listing aggregate without changing its slug or status.';

create or replace function public.get_my_listing_moderation_feedback(
  p_listing_id uuid default null
)
returns table(listing_id uuid, reason_code text, rejected_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (listing.id)
    listing.id,
    action.reason_code,
    action.created_at
  from public.listings as listing
  join public.moderation_actions as action
    on action.listing_id = listing.id
   and action.action = 'reject'
   and action.reason_code is not null
  where (select auth.uid()) is not null
    and listing.owner_id = (select auth.uid())
    and listing.deleted_at is null
    and (p_listing_id is null or listing.id = p_listing_id)
  order by listing.id, action.created_at desc, action.id desc
$$;

comment on function public.get_my_listing_moderation_feedback(uuid)
is 'Returns only the current owner latest rejection reason code and timestamp; no moderator identity, note or metadata.';

-- Reset every effective browser/server execution grant before restoring the
-- complete reviewed allowlist. Trigger-only functions remain owner-only.
revoke execute on all functions in schema public
from public, anon, authenticated, service_role;
revoke execute on all functions in schema private
from public, anon, authenticated, service_role;

grant execute on function public.search_catalog_listing_cards(uuid[], uuid, text, bigint, bigint, jsonb)
  to anon, authenticated, service_role;
grant execute on function public.get_city_premium_placements(uuid, integer)
  to anon, authenticated, service_role;

grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_my_account_profile() to authenticated;
grant execute on function public.update_my_account_profile(text, text, varchar, uuid, text) to authenticated;
grant execute on function public.submit_listing(uuid) to authenticated, service_role;
grant execute on function public.archive_own_listing(uuid) to authenticated, service_role;
grant execute on function public.mark_own_listing_sold(uuid) to authenticated, service_role;
grant execute on function public.get_or_create_listing_conversation(uuid) to authenticated;
grant execute on function public.create_listing_draft(uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb)
  to authenticated, service_role;
grant execute on function public.get_profile_for_staff(uuid) to authenticated;
grant execute on function public.moderate_listing(uuid, text, text, text) to authenticated;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;
grant execute on function public.assign_user_role(uuid, text, boolean) to authenticated;
grant execute on function public.update_listing_draft(uuid, uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb)
  to authenticated;
grant execute on function public.get_my_listing_moderation_feedback(uuid) to authenticated;

grant execute on function private.has_any_role(text[]) to authenticated;
grant execute on function private.current_profile_is_active() to authenticated;
grant execute on function private.is_conversation_participant(uuid) to authenticated;
grant execute on function private.category_is_ancestor(uuid, uuid) to authenticated, service_role;
grant execute on function private.attribute_applies_to_listing(uuid, uuid) to authenticated, service_role;

truncate marketo_security_0025_actual_function_contracts;
insert into marketo_security_0025_actual_function_contracts (
  signature, function_result, fingerprint
)
select
  function_inventory.signature,
  pg_get_function_result(procedure.oid),
  md5(
    language.lanname || ' | ' ||
    procedure.prokind::text || ' | ' ||
    procedure.provolatile::text || ' | ' ||
    procedure.prosecdef::text || ' | ' ||
    procedure.proleakproof::text || ' | ' ||
    procedure.proisstrict::text || ' | ' ||
    procedure.proretset::text || ' | ' ||
    procedure.proparallel::text || ' | ' ||
    coalesce((
      select array_agg(config_value order by config_value)::text
      from unnest(coalesce(procedure.proconfig, '{}'::text[])) as config_value
    ), '{}') || ' | ' ||
    coalesce(to_jsonb(procedure.proargnames)::text, 'null') || ' | ' ||
    coalesce(to_jsonb(procedure.proargmodes)::text, 'null') || ' | ' ||
    procedure.pronargdefaults::text || ' | ' ||
    coalesce(pg_get_expr(procedure.proargdefaults, 0, false), 'null') || ' | ' ||
    procedure.prosrc
  )
from marketo_security_0025_functions as function_inventory
join pg_proc as procedure
  on procedure.oid = to_regprocedure(function_inventory.signature)
join pg_language as language on language.oid = procedure.prolang;

do $marketo_security_0025_postflight$
declare
  mismatch text;
  role_name text;
  expected boolean;
  function_rule record;
  role_oid oid := (select oid from pg_roles where rolname = current_user);
begin
  if exists (
    select 1
    from pg_namespace as namespace
    cross join lateral aclexplode(
      coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) as privilege
    where namespace.nspname = 'private'
      and privilege.grantee = 0
      and privilege.privilege_type in ('USAGE', 'CREATE')
  ) then
    raise exception '0025 found direct PUBLIC access to the private schema';
  end if;

  if has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception '0025 anon can use the private helper schema';
  end if;

  if not has_schema_privilege('authenticated', 'private', 'USAGE')
     or not has_schema_privilege('service_role', 'private', 'USAGE') then
    raise exception '0025 authenticated/service_role cannot use the private helper schema';
  end if;

  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if has_schema_privilege(role_name, 'private', 'CREATE') then
      raise exception '0025 role % can create objects in the private schema', role_name;
    end if;
    if has_schema_privilege(role_name, 'public', 'CREATE') then
      raise exception '0025 role % can create objects in the public schema', role_name;
    end if;
    if not has_schema_privilege(role_name, 'public', 'USAGE') then
      raise exception '0025 role % cannot use the public schema', role_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_namespace as namespace
    cross join lateral aclexplode(
      coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) as privilege
    where namespace.nspname = 'public'
      and privilege.grantee = 0
      and privilege.privilege_type = 'CREATE'
  ) then
    raise exception '0025 found direct PUBLIC CREATE on the public schema';
  end if;

  if not exists (
    select 1
    from pg_default_acl as defaults
    where defaults.defaclrole = role_oid
      and defaults.defaclnamespace = 0
      and defaults.defaclobjtype = 'f'
  ) or exists (
    select 1
    from pg_default_acl as defaults
    cross join lateral aclexplode(defaults.defaclacl) as privilege
    where defaults.defaclrole = role_oid
      and defaults.defaclnamespace = 0
      and defaults.defaclobjtype = 'f'
      and privilege.grantee in (
        0,
        (select oid from pg_roles where rolname = 'anon'),
        (select oid from pg_roles where rolname = 'authenticated'),
        (select oid from pg_roles where rolname = 'service_role')
      )
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception '0025 failed to revoke global default API-role function EXECUTE for owner %', current_user;
  end if;

  if exists (
    select 1
    from pg_default_acl as defaults
    join pg_namespace as namespace on namespace.oid = defaults.defaclnamespace
    cross join lateral aclexplode(defaults.defaclacl) as privilege
    where defaults.defaclrole = role_oid
      and defaults.defaclobjtype = 'f'
      and namespace.nspname in ('public', 'private')
      and privilege.grantee in (
        0,
        (select oid from pg_roles where rolname = 'anon'),
        (select oid from pg_roles where rolname = 'authenticated'),
        (select oid from pg_roles where rolname = 'service_role')
      )
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception '0025 found schema default API-role function EXECUTE in public/private';
  end if;

  for function_rule in select * from marketo_security_0025_functions order by signature loop
    foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
      expected := case role_name
        when 'anon' then function_rule.allow_anon
        when 'authenticated' then function_rule.allow_authenticated
        else function_rule.allow_service_role
      end;

      if has_function_privilege(role_name, to_regprocedure(function_rule.signature), 'EXECUTE') is distinct from expected then
        raise exception '0025 function grant mismatch for role % on % (expected %)',
          role_name, function_rule.signature, expected;
      end if;
    end loop;
  end loop;

  select string_agg(procedure.oid::regprocedure::text, ', '
                    order by procedure.oid::regprocedure::text)
  into mismatch
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  cross join lateral aclexplode(
    coalesce(procedure.proacl, acldefault('f', procedure.proowner))
  ) as privilege
  where namespace.nspname in ('public', 'private')
    and privilege.grantee = 0
    and privilege.privilege_type = 'EXECUTE';

  if mismatch is not null then
    raise exception '0025 found direct PUBLIC function EXECUTE: %', mismatch;
  end if;

  select string_agg(procedure.oid::regprocedure::text, ', '
                    order by procedure.oid::regprocedure::text)
  into mismatch
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname in ('public', 'private')
    and not exists (
      select 1
      from marketo_security_0025_functions as function_inventory
      where to_regprocedure(function_inventory.signature) = procedure.oid
    );

  if mismatch is not null then
    raise exception '0025 postflight found unreviewed public/private function(s): %', mismatch;
  end if;

  select string_agg(expected_contract.signature, ', ' order by expected_contract.signature)
  into mismatch
  from marketo_security_0025_function_contracts as expected_contract
  left join marketo_security_0025_actual_function_contracts as actual_contract
    on actual_contract.signature = expected_contract.signature
  where actual_contract.signature is null
     or actual_contract.function_result is distinct from expected_contract.function_result
     or actual_contract.fingerprint is distinct from expected_contract.canonical_fingerprint;

  if mismatch is not null then
    raise exception '0025 postflight callable function contract mismatch: %', mismatch;
  end if;

  select string_agg(expected_table.table_name, ', ' order by expected_table.table_name)
  into mismatch
  from (
    values
      ('profiles'),
      ('listings'),
      ('listing_attribute_values'),
      ('listing_attribute_option_values'),
      ('listing_images')
  ) as expected_table(table_name)
  left join pg_namespace as namespace on namespace.nspname = 'public'
  left join pg_class as relation
    on relation.relnamespace = namespace.oid
   and relation.relname = expected_table.table_name
   and relation.relkind = 'r'
  where relation.oid is null or not relation.relrowsecurity;

  if mismatch is not null then
    raise exception '0025 RLS is disabled or table is missing: %', mismatch;
  end if;

  select string_agg(policy_inventory.table_name || '.' || policy_inventory.policy_name, ', '
                    order by policy_inventory.table_name, policy_inventory.policy_name)
  into mismatch
  from marketo_security_0025_policies as policy_inventory
  where not exists (
    select 1
    from pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = policy_inventory.table_name
      and policy.policyname = policy_inventory.policy_name
  );

  if mismatch is not null then
    raise exception '0025 postflight missing RLS policy/policies: %', mismatch;
  end if;

  select string_agg(policy.tablename || '.' || policy.policyname, ', '
                    order by policy.tablename, policy.policyname)
  into mismatch
  from pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename in (
      'profiles',
      'listings',
      'listing_attribute_values',
      'listing_attribute_option_values',
      'listing_images'
    )
    and not exists (
      select 1
      from marketo_security_0025_policies as policy_inventory
      where policy_inventory.table_name = policy.tablename
        and policy_inventory.policy_name = policy.policyname
    );

  if mismatch is not null then
    raise exception '0025 postflight found unreviewed RLS policy/policies: %', mismatch;
  end if;

  select string_agg(policy.tablename || '.' || policy.policyname, ', '
                    order by policy.tablename, policy.policyname)
  into mismatch
  from pg_policies as policy
  join marketo_security_0025_policies as policy_inventory
    on policy_inventory.table_name = policy.tablename
   and policy_inventory.policy_name = policy.policyname
  where policy.schemaname = 'public'
    and (
      policy.cmd <> policy_inventory.expected_cmd
      or policy.permissive <> 'PERMISSIVE'
      or policy.roles <> array[policy_inventory.expected_role]::name[]
      or (
        policy_inventory.moderation_guarded
        and (
          coalesce(policy.qual, '') not ilike '%private.has_any_role%'
          or coalesce(policy.qual, '') not ilike '%moderator%'
          or coalesce(policy.qual, '') not ilike '%admin%'
          or coalesce(policy.qual, '') ilike '%support%'
        )
      )
    );

  if mismatch is not null then
    raise exception '0025 canonical RLS policy metadata mismatch: %', mismatch;
  end if;

  if not coalesce((
    select procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']::text[]
      and pg_get_functiondef(procedure.oid) ilike '%join public.profiles%'
      and pg_get_functiondef(procedure.oid) ilike '%profile.status = ''active''%'
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('private.has_any_role(text[])')
  ), false) then
    raise exception '0025 active-staff function postflight failed';
  end if;

  if not coalesce((
    select procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']::text[]
      and pg_get_functiondef(procedure.oid) ilike '%private.has_any_role%'
      and pg_get_functiondef(procedure.oid) ilike '%invalid moderation reason_code%'
      and pg_get_functiondef(procedure.oid) ilike '%moderation note is too long%'
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.moderate_listing(uuid,text,text,text)')
  ), false) then
    raise exception '0025 moderation function postflight failed';
  end if;

  if not coalesce((
    select not procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']::text[]
      and procedure.provolatile = 'v'
      and pg_get_functiondef(procedure.oid) ilike '%active profile required%'
      and pg_get_functiondef(procedure.oid) ilike '%an active leaf category is required%'
      and pg_get_functiondef(procedure.oid) ilike '%delete from public.listing_attribute_option_values%'
      and pg_get_functiondef(procedure.oid) ilike '%return query select target_listing_id, current_slug, current_status%'
    from pg_proc as procedure
    where procedure.oid = to_regprocedure(
      'public.update_listing_draft(uuid,uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb)'
    )
  ), false) then
    raise exception '0025 owner draft RPC postflight failed';
  end if;

  if not coalesce((
    select procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']::text[]
      and procedure.provolatile = 's'
      and pg_get_functiondef(procedure.oid) ilike '%listing.owner_id = (select auth.uid())%'
      and pg_get_functiondef(procedure.oid) ilike '%action.action = ''reject''%'
      and pg_get_functiondef(procedure.oid) not ilike '%moderator_id%'
      and pg_get_functiondef(procedure.oid) not ilike '%action.note%'
      and pg_get_functiondef(procedure.oid) not ilike '%action.metadata%'
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.get_my_listing_moderation_feedback(uuid)')
  ), false) then
    raise exception '0025 owner feedback RPC postflight failed';
  end if;
end;
$marketo_security_0025_postflight$;

commit;
