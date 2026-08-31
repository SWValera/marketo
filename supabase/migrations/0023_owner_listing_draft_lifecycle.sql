-- Marketo v1.0 Stage 3: owner listing lifecycle and atomic draft replacement.
-- Forward-only: migrations 0001-0022 and the deterministic reference seed stay immutable.

begin;

create index if not exists listings_owner_updated_idx
  on public.listings (owner_id, updated_at desc, id desc)
  where status <> 'deleted';

-- Replaces the complete editable aggregate in one transaction. The function is
-- SECURITY INVOKER so the existing owner RLS policies remain the write boundary.
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

revoke all on function public.update_listing_draft(uuid, uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb)
from public, anon, service_role;
grant execute on function public.update_listing_draft(uuid, uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb)
to authenticated;

comment on function public.update_listing_draft(uuid, uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb)
is 'Atomically replaces an active owner draft/rejected listing aggregate without changing its slug or status.';

-- Owners receive only the latest safe rejection code and timestamp. Staff IDs,
-- notes, metadata and the remaining moderation history never leave this RPC.
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

revoke all on function public.get_my_listing_moderation_feedback(uuid)
from public, anon, service_role;
grant execute on function public.get_my_listing_moderation_feedback(uuid)
to authenticated;

comment on function public.get_my_listing_moderation_feedback(uuid)
is 'Returns only the current owner latest rejection reason code and timestamp; no moderator identity, note or metadata.';

commit;
