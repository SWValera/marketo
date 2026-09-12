-- Catalog normalization: additive option metadata and new-listing requirements.
-- Existing required flags, authentication, ownership checks, RLS and submit
-- transitions are preserved. No listing values are changed by this migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $preflight$
begin
  if (select md5(replace(prosrc, E'\r\n', E'\n')) from pg_proc where oid = 'public.submit_listing(uuid)'::regprocedure) is distinct from '8526f18ad9e9f87be782be7e044d6e63' then
    raise exception 'Catalog migration: unexpected public.submit_listing(uuid) body';
  end if;
  if (select md5(replace(prosrc, E'\r\n', E'\n')) from pg_proc where oid = 'private.validate_listing_option_attribute()'::regprocedure) is distinct from '9de515169aa3d6e3e598ec8a49a1f486' then
    raise exception 'Catalog migration: unexpected private.validate_listing_option_attribute() body';
  end if;
end;
$preflight$;
alter table public.category_attribute_options
  add column metadata jsonb not null default '{}'::jsonb,
  add constraint category_attribute_options_metadata_object check (jsonb_typeof(metadata) = 'object');
create or replace function private.validate_listing_option_attribute()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  attribute_type text;
  dependency_key text;
  fallback_value text;
  expected_parent_option_id uuid;
  selected_option_value text;
begin
  if not private.attribute_applies_to_listing(new.listing_id, new.attribute_id) then
    raise exception 'attribute does not apply to listing category';
  end if;

  select attribute.data_type, attribute.depends_on_key, attribute.validation ->> 'fallbackOption'
  into strict attribute_type, dependency_key, fallback_value
  from public.category_attributes as attribute
  where attribute.id = new.attribute_id;

  if attribute_type not in ('select', 'multiselect') then
    raise exception 'option values are allowed only for select attributes';
  end if;

  select attribute_option.parent_option_id, attribute_option.value
  into expected_parent_option_id, selected_option_value
  from public.category_attribute_options as attribute_option
  where attribute_option.id = new.option_id
    and attribute_option.attribute_id = new.attribute_id
    and attribute_option.is_active;

  if not found then
    raise exception 'attribute option is inactive or unavailable';
  end if;

  if dependency_key is not null then
    if expected_parent_option_id is null and selected_option_value is distinct from coalesce(fallback_value, 'other-model') then
      raise exception 'dependent option has no parent option';
    end if;

    if expected_parent_option_id is not null and not exists (
      select 1
      from public.listings as listing
      join public.category_attributes as parent_attribute
        on parent_attribute.key = dependency_key
       and parent_attribute.is_active
       and (
         parent_attribute.category_id = listing.category_id
         or (
           parent_attribute.inherits_to_children
           and private.category_is_ancestor(parent_attribute.category_id, listing.category_id)
         )
       )
      join public.listing_attribute_option_values as parent_value
        on parent_value.listing_id = listing.id
       and parent_value.attribute_id = parent_attribute.id
       and parent_value.option_id = expected_parent_option_id
      where listing.id = new.listing_id
    ) then
      raise exception 'dependent option does not match the selected parent option';
    end if;
  end if;

  if attribute_type = 'select' then
    perform pg_advisory_xact_lock(
      hashtextextended(new.listing_id::text || ':' || new.attribute_id::text, 0)
    );
  end if;

  if attribute_type = 'select' and exists (
    select 1
    from public.listing_attribute_option_values as existing
    where existing.listing_id = new.listing_id
      and existing.attribute_id = new.attribute_id
      and existing.option_id <> new.option_id
  ) then
    raise exception 'select attribute accepts one option';
  end if;

  return new;
end;
$$;

create or replace function public.submit_listing(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_category_id uuid;
  target_created_at timestamptz;
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

  select listing.category_id, listing.created_at into target_category_id, target_created_at
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
          attribute.validation ? 'requiredForNewListingsSince'
          and target_created_at >= (attribute.validation ->> 'requiredForNewListingsSince')::timestamptz
        )
        or (
          attribute.validation ? 'requiredWhen'
          and (not (attribute.validation ? 'requiredWhenSince')
            or target_created_at >= (attribute.validation ->> 'requiredWhenSince')::timestamptz)
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

commit;
