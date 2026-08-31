-- Marketo v1.0 category normalization release: atomic draft attribute roundtrip.
-- This forward-only migration does not publish or approve listings and does not
-- alter RLS. All writes still execute as the authenticated caller.

begin;

-- Enforce the generic parent-option relationship for every dependent selector,
-- including vehicle, motorcycle and smartphone brand -> model dictionaries.
create or replace function private.validate_listing_option_attribute()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  attribute_type text;
  dependency_key text;
  expected_parent_option_id uuid;
  selected_option_value text;
begin
  if not private.attribute_applies_to_listing(new.listing_id, new.attribute_id) then
    raise exception 'attribute does not apply to listing category';
  end if;

  select attribute.data_type, attribute.depends_on_key
  into strict attribute_type, dependency_key
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
    if expected_parent_option_id is null and selected_option_value <> 'other-model' then
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

-- One transaction creates the draft aggregate. The function is deliberately
-- SECURITY INVOKER: existing authenticated grants and owner RLS policies remain
-- the authorization boundary, while owner_id is derived exclusively from JWT.
create or replace function public.create_listing_draft(
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
returns table(listing_id uuid, listing_slug text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_listing_id uuid;
  new_listing_slug text := pg_catalog.md5(
    pg_catalog.random()::text || pg_catalog.clock_timestamp()::text || actor_id::text
  );
  attribute_item jsonb;
  option_text text;
  target_attribute_id uuid;
  expected_data_type text;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_attributes, '[]'::jsonb)) <> 'array' then
    raise exception 'attributes must be a JSON array';
  end if;

  insert into public.listings (
    owner_id, category_id, settlement_id, slug, title, description, price_minor, currency_code
  ) values (
    actor_id, p_category_id, p_settlement_id, new_listing_slug,
    p_title, p_description, p_price_minor, p_currency_code
  ) returning id into new_listing_id;

  insert into public.listing_contacts (
    listing_id, contact_name, contact_phone_e164, allow_messages, allow_phone
  ) values (
    new_listing_id, p_contact_name, p_contact_phone_e164, coalesce(p_allow_messages, true), false
  );

  for attribute_item in
    select item.value
    from jsonb_array_elements(coalesce(p_attributes, '[]'::jsonb)) with ordinality as item(value, position)
    order by item.position
  loop
    begin
      target_attribute_id := (attribute_item ->> 'attribute_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid attribute identifier';
    end;

    select attribute.data_type
    into expected_data_type
    from public.category_attributes as attribute
    where attribute.id = target_attribute_id
      and attribute.is_active;

    if expected_data_type is null or expected_data_type <> attribute_item ->> 'data_type' then
      raise exception 'attribute type mismatch';
    end if;

    if expected_data_type in ('select', 'multiselect') then
      if jsonb_typeof(coalesce(attribute_item -> 'option_ids', '[]'::jsonb)) <> 'array' then
        raise exception 'option_ids must be a JSON array';
      end if;
      for option_text in
        select jsonb_array_elements_text(coalesce(attribute_item -> 'option_ids', '[]'::jsonb))
      loop
        insert into public.listing_attribute_option_values (listing_id, attribute_id, option_id)
        values (new_listing_id, target_attribute_id, option_text::uuid);
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
        new_listing_id,
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

  return query select new_listing_id, new_listing_slug;
end;
$$;

revoke all on function public.create_listing_draft(uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb) from public, anon;
grant execute on function public.create_listing_draft(uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb) to authenticated, service_role;

comment on function public.create_listing_draft(uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb)
is 'Atomically saves an authenticated owner draft, private contact and validated typed category values.';

commit;
