-- Marketo v1.0: listings, R2 metadata and typed category values.

begin;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  category_id uuid not null references public.categories(id) on delete restrict,
  settlement_id uuid not null references public.settlements(id) on delete restrict,
  slug text not null unique,
  title text not null,
  description text not null,
  price_minor bigint,
  currency_code char(3) not null default 'KZT',
  status text not null default 'draft',
  promoted_until timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint listings_title_length check (char_length(title) between 3 and 120),
  constraint listings_description_length check (char_length(description) between 10 and 20000),
  constraint listings_price_nonnegative check (price_minor is null or price_minor >= 0),
  constraint listings_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint listings_status_check check (status in ('draft', 'pending', 'active', 'rejected', 'archived', 'sold', 'expired', 'deleted')),
  constraint listings_publication_dates check (expires_at is null or published_at is null or expires_at > published_at),
  constraint listings_deleted_state check (status <> 'deleted' or deleted_at is not null)
);

-- Kept separate so public listing SELECT never leaks a phone number. A server
-- route may reveal it only after applying the product's access/rate-limit rules.
create table public.listing_contacts (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  contact_name text not null,
  contact_phone_e164 text,
  allow_messages boolean not null default true,
  allow_phone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_contacts_name_length check (char_length(contact_name) between 1 and 80),
  constraint listing_contacts_phone_format check (
    contact_phone_e164 is null or contact_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  constraint listing_contacts_visible_phone_present check (not allow_phone or contact_phone_e164 is not null)
);

create table public.listing_attribute_values (
  listing_id uuid not null references public.listings(id) on delete cascade,
  attribute_id uuid not null references public.category_attributes(id) on delete restrict,
  text_value text,
  number_value numeric,
  boolean_value boolean,
  date_value date,
  number_min_value numeric,
  number_max_value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (listing_id, attribute_id),
  constraint listing_attribute_values_range_order check (
    number_min_value is null or number_max_value is null or number_min_value <= number_max_value
  )
);

create table public.listing_attribute_option_values (
  listing_id uuid not null references public.listings(id) on delete cascade,
  attribute_id uuid not null references public.category_attributes(id) on delete restrict,
  option_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (listing_id, attribute_id, option_id),
  constraint listing_attribute_option_values_option_fk
    foreign key (attribute_id, option_id)
    references public.category_attribute_options(attribute_id, id)
    on delete restrict
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_key text not null unique,
  sort_order integer not null default 0 check (sort_order >= 0),
  width integer,
  height integer,
  byte_size bigint,
  mime_type text,
  created_at timestamptz not null default now(),
  constraint listing_images_dimensions_check check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint listing_images_byte_size_check check (byte_size is null or byte_size > 0),
  constraint listing_images_mime_type_check check (
    mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ),
  constraint listing_images_listing_sort_unique unique (listing_id, sort_order)
);

create or replace function private.validate_listing_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_currency char(3);
begin
  select country.currency_code into strict expected_currency
  from public.settlements as settlement
  join public.regions as region on region.id = settlement.region_id
  join public.countries as country on country.id = region.country_id
  where settlement.id = new.settlement_id;

  if new.currency_code <> expected_currency then
    raise exception 'listing currency must match its country';
  end if;
  return new;
end;
$$;

create or replace function private.attribute_applies_to_listing(target_listing_id uuid, target_attribute_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.listings as listing
      join public.category_attributes as attribute on attribute.id = target_attribute_id
      where listing.id = target_listing_id
        and attribute.is_active
        and (
          attribute.category_id = listing.category_id
          or (
            attribute.inherits_to_children
            and private.category_is_ancestor(attribute.category_id, listing.category_id)
          )
        )
    ),
    false
  );
$$;

create or replace function private.validate_listing_scalar_attribute()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  attribute_type text;
begin
  if not private.attribute_applies_to_listing(new.listing_id, new.attribute_id) then
    raise exception 'attribute does not apply to listing category';
  end if;

  select data_type into strict attribute_type
  from public.category_attributes
  where id = new.attribute_id;

  if attribute_type = 'text' and (
    new.text_value is null
    or num_nonnulls(new.number_value, new.boolean_value, new.date_value, new.number_min_value, new.number_max_value) <> 0
  ) then
    raise exception 'text attribute requires exactly text_value';
  elsif attribute_type = 'number' and (new.number_value is null or num_nonnulls(new.text_value, new.boolean_value, new.date_value, new.number_min_value, new.number_max_value) <> 0) then
    raise exception 'number attribute requires exactly number_value';
  elsif attribute_type = 'boolean' and (new.boolean_value is null or num_nonnulls(new.text_value, new.number_value, new.date_value, new.number_min_value, new.number_max_value) <> 0) then
    raise exception 'boolean attribute requires exactly boolean_value';
  elsif attribute_type = 'date' and (new.date_value is null or num_nonnulls(new.text_value, new.number_value, new.boolean_value, new.number_min_value, new.number_max_value) <> 0) then
    raise exception 'date attribute requires exactly date_value';
  elsif attribute_type = 'range' and (
    new.number_min_value is null or new.number_max_value is null
    or num_nonnulls(new.text_value, new.number_value, new.boolean_value, new.date_value) <> 0
  ) then
    raise exception 'range attribute requires number_min_value and number_max_value';
  elsif attribute_type in ('select', 'multiselect') then
    raise exception 'select attributes must use listing_attribute_option_values';
  end if;

  return new;
end;
$$;

create or replace function private.validate_listing_option_attribute()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  attribute_type text;
begin
  if not private.attribute_applies_to_listing(new.listing_id, new.attribute_id) then
    raise exception 'attribute does not apply to listing category';
  end if;

  select data_type into strict attribute_type
  from public.category_attributes
  where id = new.attribute_id;

  if attribute_type not in ('select', 'multiselect') then
    raise exception 'option values are allowed only for select attributes';
  end if;

  if not exists (
    select 1 from public.category_attribute_options as attribute_option
    where attribute_option.id = new.option_id
      and attribute_option.attribute_id = new.attribute_id
      and attribute_option.is_active
  ) then
    raise exception 'attribute option is inactive or unavailable';
  end if;

  if attribute_type = 'select' then
    -- Serialize concurrent writes for one single-select listing/attribute pair.
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

create or replace function private.archive_listings_for_deleted_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.listings
  set status = 'archived'
  where owner_id = old.id and status not in ('deleted', 'sold', 'expired');
  return old;
end;
$$;

create trigger listings_set_updated_at
before update on public.listings
for each row execute function private.set_updated_at();

create trigger listings_validate_currency
before insert or update of settlement_id, currency_code on public.listings
for each row execute function private.validate_listing_currency();

create trigger listing_contacts_set_updated_at
before update on public.listing_contacts
for each row execute function private.set_updated_at();

create trigger listing_attribute_values_set_updated_at
before update on public.listing_attribute_values
for each row execute function private.set_updated_at();

create trigger listing_attribute_values_validate
before insert or update on public.listing_attribute_values
for each row execute function private.validate_listing_scalar_attribute();

create trigger listing_attribute_option_values_validate
before insert or update on public.listing_attribute_option_values
for each row execute function private.validate_listing_option_attribute();

create trigger profiles_archive_listings_before_delete
before delete on public.profiles
for each row execute function private.archive_listings_for_deleted_profile();

-- Owners cannot approve their own listing through a direct table UPDATE.
-- This atomic transition validates the publishable aggregate and moves it only
-- to the moderation queue.
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
      and attribute.is_required
      and (
        attribute.category_id = target_category_id
        or (
          attribute.inherits_to_children
          and private.category_is_ancestor(attribute.category_id, target_category_id)
        )
      )
      and not (
        exists (
          select 1 from public.listing_attribute_values as scalar_value
          where scalar_value.listing_id = target_listing_id
            and scalar_value.attribute_id = attribute.id
        )
        or exists (
          select 1 from public.listing_attribute_option_values as option_value
          where option_value.listing_id = target_listing_id
            and option_value.attribute_id = attribute.id
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

create or replace function public.archive_own_listing(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listings
  set status = 'archived'
  where id = target_listing_id
    and owner_id = (select auth.uid())
    and status in ('draft', 'pending', 'active', 'rejected');

  if not found then
    raise exception 'listing cannot be archived' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.mark_own_listing_sold(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listings
  set status = 'sold'
  where id = target_listing_id
    and owner_id = (select auth.uid())
    and status = 'active';

  if not found then
    raise exception 'listing cannot be marked sold' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.submit_listing(uuid) from public;
revoke all on function public.archive_own_listing(uuid) from public;
revoke all on function public.mark_own_listing_sold(uuid) from public;

commit;
