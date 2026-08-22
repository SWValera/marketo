-- Marketo v1.0: unlimited-depth category tree and inherited dynamic attributes.

begin;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  slug text not null unique,
  name_ru text not null,
  name_kk text not null,
  icon_key text,
  tone_key text,
  search_placeholder_ru text,
  search_placeholder_kk text,
  title_placeholder_ru text,
  title_placeholder_kk text,
  description_hint_ru text,
  description_hint_kk text,
  price_mode text not null default 'price',
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint categories_localized_names_present check (
    btrim(name_ru) <> '' and btrim(name_kk) <> ''
  ),
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id),
  constraint categories_price_mode_check check (price_mode in ('price', 'salary', 'free', 'exchange'))
);

create table public.category_attributes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  key text not null,
  label_ru text not null,
  label_kk text not null,
  data_type text not null,
  unit_ru text,
  unit_kk text,
  is_required boolean not null default false,
  is_filterable boolean not null default false,
  is_searchable boolean not null default false,
  inherits_to_children boolean not null default true,
  validation jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_attributes_key_format check (key ~ '^[a-z][A-Za-z0-9_]*$'),
  constraint category_attributes_localized_labels_present check (
    btrim(label_ru) <> '' and btrim(label_kk) <> ''
  ),
  constraint category_attributes_localized_units_consistent check (
    (unit_ru is null and unit_kk is null)
    or (
      unit_ru is not null and unit_kk is not null
      and btrim(unit_ru) <> '' and btrim(unit_kk) <> ''
    )
  ),
  constraint category_attributes_data_type_check check (data_type in ('text', 'number', 'boolean', 'select', 'multiselect', 'range', 'date')),
  constraint category_attributes_validation_object check (jsonb_typeof(validation) = 'object'),
  constraint category_attributes_category_key_unique unique (category_id, key),
  constraint category_attributes_category_sort_unique unique (category_id, sort_order)
);

create table public.category_attribute_options (
  id uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references public.category_attributes(id) on delete cascade,
  value text not null,
  label_ru text not null,
  label_kk text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_attribute_options_value_length check (char_length(value) between 1 and 100),
  constraint category_attribute_options_content_present check (
    btrim(value) <> '' and btrim(label_ru) <> '' and btrim(label_kk) <> ''
  ),
  constraint category_attribute_options_attribute_value_unique unique (attribute_id, value),
  constraint category_attribute_options_attribute_sort_unique unique (attribute_id, sort_order),
  constraint category_attribute_options_attribute_id_id_unique unique (attribute_id, id)
);

create or replace function private.category_is_ancestor(ancestor_id uuid, descendant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  with recursive path as (
    select category.id, category.parent_id
    from public.categories as category
    where category.id = descendant_id
    union all
    select parent.id, parent.parent_id
    from public.categories as parent
    join path on path.parent_id = parent.id
  )
  select exists (select 1 from path where path.id = ancestor_id);
$$;

create or replace function private.check_category_parent_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null
    and private.category_is_ancestor(new.id, new.parent_id)
  then
    raise exception 'category hierarchy cycle detected';
  end if;
  return new;
end;
$$;

create trigger categories_prevent_cycle
before insert or update of parent_id on public.categories
for each row execute function private.check_category_parent_cycle();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();

create trigger category_attributes_set_updated_at
before update on public.category_attributes
for each row execute function private.set_updated_at();

create trigger category_attribute_options_set_updated_at
before update on public.category_attribute_options
for each row execute function private.set_updated_at();

commit;
