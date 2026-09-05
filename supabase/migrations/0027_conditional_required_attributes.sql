-- Marketo v1.0: enforce conditional publication requirements in PostgreSQL.
-- Catalog data may declare validation.requiredWhen without requiring a new
-- schema migration for every future dictionary release.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';
set local search_path = pg_catalog, pg_temp, public;

do $marketo_catalog_0027_preflight$
declare
  actual_fingerprint text;
  procedure_owner name;
begin
  if to_regprocedure('public.submit_listing(uuid)') is null then
    raise exception '0027 requires public.submit_listing(uuid)';
  end if;

  select
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
      replace(replace(procedure.prosrc, E'\r\n', E'\n'), E'\r', E'\n')
    ),
    owner.rolname
  into actual_fingerprint, procedure_owner
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  join pg_language as language on language.oid = procedure.prolang
  join pg_roles as owner on owner.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname = 'submit_listing'
    and procedure.oid = 'public.submit_listing(uuid)'::regprocedure;

  if actual_fingerprint is distinct from '48d4072b18a7ceeb1da335c8c6269fc8' then
    raise exception '0027 refuses a drifted submit_listing contract';
  end if;

  if procedure_owner is distinct from current_user then
    raise exception '0027 requires the migration role to own public.submit_listing(uuid)';
  end if;

  if has_function_privilege('anon', 'public.submit_listing(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.submit_listing(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.submit_listing(uuid)', 'EXECUTE') then
    raise exception '0027 refuses unexpected submit_listing grants';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) as privilege
    where procedure.oid = 'public.submit_listing(uuid)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception '0027 refuses direct PUBLIC submit_listing EXECUTE';
  end if;
end;
$marketo_catalog_0027_preflight$;

create or replace function public.submit_listing(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_category_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = actor_id and status = 'active'
  ) then
    raise exception 'active profile required' using errcode = '42501';
  end if;

  select listing.category_id into target_category_id
  from public.listings as listing
  join public.categories as category on category.id = listing.category_id
  join public.settlements as settlement on settlement.id = listing.settlement_id
  where listing.id = target_listing_id
    and listing.owner_id = actor_id
    and listing.status in ('draft', 'rejected')
    and listing.deleted_at is null
    and category.is_active
    and settlement.is_active
    and settlement.is_selectable
  for update of listing;

  if target_category_id is null then
    raise exception 'listing is not publishable' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.categories
    where parent_id = target_category_id and is_active
  ) then
    raise exception 'an exact leaf category is required';
  end if;

  if not exists (select 1 from public.listing_contacts where listing_id = target_listing_id) then
    raise exception 'listing contact is required';
  end if;

  if not exists (select 1 from public.listing_images where listing_id = target_listing_id) then
    raise exception 'at least one listing image is required';
  end if;

  if exists (
    select 1
    from public.category_attributes as attribute
    where attribute.is_active
      and attribute.is_visible
      and private.attribute_applies_to_listing(target_listing_id, attribute.id)
      and attribute.validation ? 'requiredWhen'
      and not (
        jsonb_typeof(attribute.validation -> 'requiredWhen') = 'object'
        and nullif(btrim(attribute.validation #>> '{requiredWhen,key}'), '') is not null
        and case
          when jsonb_typeof(attribute.validation #> '{requiredWhen,values}') = 'array'
            then jsonb_array_length(attribute.validation #> '{requiredWhen,values}') > 0
          else false
        end
        and not exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(attribute.validation #> '{requiredWhen,values}') = 'array'
                then attribute.validation #> '{requiredWhen,values}'
              else '[]'::jsonb
            end
          ) as required_value(value)
          where jsonb_typeof(required_value.value) <> 'string'
             or nullif(btrim(required_value.value #>> '{}'), '') is null
        )
        and exists (
          select 1
          from public.category_attributes as controller
          where controller.is_active
            and controller.key = attribute.validation #>> '{requiredWhen,key}'
            and controller.data_type in ('select', 'multiselect')
            and private.attribute_applies_to_listing(target_listing_id, controller.id)
        )
      )
  ) then
    raise exception 'invalid conditional requirement metadata';
  end if;

  if exists (
    with applicable_attributes as (
      select attribute.*
      from public.category_attributes as attribute
      where attribute.is_active
        and attribute.is_visible
        and private.attribute_applies_to_listing(target_listing_id, attribute.id)
    )
    select 1
    from applicable_attributes as attribute
    where (
        not (attribute.validation ? 'visibleWhen')
        or exists (
          select 1
          from applicable_attributes as visibility_controller
          join public.listing_attribute_option_values as selected_visibility
            on selected_visibility.listing_id = target_listing_id
           and selected_visibility.attribute_id = visibility_controller.id
          join public.category_attribute_options as visibility_option
            on visibility_option.attribute_id = selected_visibility.attribute_id
           and visibility_option.id = selected_visibility.option_id
           and visibility_option.is_active
          where visibility_controller.key = attribute.validation #>> '{visibleWhen,key}'
            and visibility_option.value in (
              select visible_value.value
              from jsonb_array_elements_text(attribute.validation #> '{visibleWhen,values}') as visible_value(value)
            )
        )
      )
      and (
        attribute.is_required
        or (
          attribute.validation ? 'requiredWhen'
          and exists (
            select 1
            from applicable_attributes as requirement_controller
            join public.listing_attribute_option_values as selected_requirement
              on selected_requirement.listing_id = target_listing_id
             and selected_requirement.attribute_id = requirement_controller.id
            join public.category_attribute_options as requirement_option
              on requirement_option.attribute_id = selected_requirement.attribute_id
             and requirement_option.id = selected_requirement.option_id
             and requirement_option.is_active
            where requirement_controller.key = attribute.validation #>> '{requiredWhen,key}'
              and requirement_option.value in (
                select required_value.value
                from jsonb_array_elements_text(attribute.validation #> '{requiredWhen,values}') as required_value(value)
              )
          )
        )
      )
      and not (
        (
          attribute.data_type = 'text'
          and exists (
            select 1 from public.listing_attribute_values as value
            where value.listing_id = target_listing_id
              and value.attribute_id = attribute.id
              and nullif(btrim(value.text_value), '') is not null
          )
        )
        or (
          attribute.data_type = 'number'
          and exists (
            select 1 from public.listing_attribute_values as value
            where value.listing_id = target_listing_id
              and value.attribute_id = attribute.id
              and value.number_value is not null
          )
        )
        or (
          attribute.data_type = 'boolean'
          and exists (
            select 1 from public.listing_attribute_values as value
            where value.listing_id = target_listing_id
              and value.attribute_id = attribute.id
              and value.boolean_value is not null
          )
        )
        or (
          attribute.data_type = 'date'
          and exists (
            select 1 from public.listing_attribute_values as value
            where value.listing_id = target_listing_id
              and value.attribute_id = attribute.id
              and value.date_value is not null
          )
        )
        or (
          attribute.data_type = 'range'
          and exists (
            select 1 from public.listing_attribute_values as value
            where value.listing_id = target_listing_id
              and value.attribute_id = attribute.id
              and value.number_min_value is not null
              and value.number_max_value is not null
          )
        )
        or (
          attribute.data_type in ('select', 'multiselect')
          and exists (
            select 1
            from public.listing_attribute_option_values as selected
            join public.category_attribute_options as attribute_option
              on attribute_option.attribute_id = selected.attribute_id
             and attribute_option.id = selected.option_id
             and attribute_option.is_active
            where selected.listing_id = target_listing_id
              and selected.attribute_id = attribute.id
          )
        )
      )
  ) then
    raise exception 'required category attributes are missing';
  end if;

  update public.listings
  set status = 'pending', published_at = null, expires_at = null
  where id = target_listing_id;
end;
$$;

revoke all on function public.submit_listing(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.submit_listing(uuid)
to authenticated, service_role;

do $marketo_catalog_0027_postflight$
declare
  actual_fingerprint text;
begin
  select md5(
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
    replace(replace(procedure.prosrc, E'\r\n', E'\n'), E'\r', E'\n')
  )
  into actual_fingerprint
  from pg_proc as procedure
  join pg_language as language on language.oid = procedure.prolang
  where procedure.oid = 'public.submit_listing(uuid)'::regprocedure;

  if actual_fingerprint is distinct from '86357b7d7fd5d43a17f7182e40009406' then
    raise exception '0027 submit_listing postflight fingerprint mismatch: %', actual_fingerprint;
  end if;

  if has_function_privilege('anon', 'public.submit_listing(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.submit_listing(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.submit_listing(uuid)', 'EXECUTE') then
    raise exception '0027 submit_listing grant postflight mismatch';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) as privilege
    where procedure.oid = 'public.submit_listing(uuid)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception '0027 left direct PUBLIC submit_listing EXECUTE';
  end if;
end;
$marketo_catalog_0027_postflight$;

commit;
