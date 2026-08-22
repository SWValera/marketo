-- Marketo v1.0: locales and normalized, country-ready KATO geography.

begin;

create table public.locales (
  code varchar(10) primary key,
  name_ru text not null,
  name_kk text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locales_code_format check (code ~ '^[a-z]{2,3}(-[A-Z]{2})?$')
);

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  code char(2) not null unique,
  slug text not null unique,
  name_ru text not null,
  name_kk text not null,
  currency_code char(3) not null,
  currency_symbol text not null,
  currency_exponent smallint not null default 0 check (currency_exponent between 0 and 4),
  phone_code text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint countries_code_format check (code ~ '^[A-Z]{2}$'),
  constraint countries_currency_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint countries_phone_code_format check (phone_code ~ '^\+[1-9][0-9]{0,3}$'),
  constraint countries_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete restrict,
  code text not null,
  slug text not null,
  name_ru text not null,
  name_kk text not null,
  kind text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  source_code text,
  source_updated_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regions_kind_check check (kind in ('region', 'republican_city', 'territory')),
  constraint regions_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint regions_country_code_unique unique (country_id, code),
  constraint regions_country_slug_unique unique (country_id, slug)
);

-- `settlements` is a unified KATO node table. District nodes may be retained
-- for hierarchy with is_selectable=false; cities, towns and villages are selectable.
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete restrict,
  parent_id uuid references public.settlements(id) on delete restrict,
  kato_code text unique,
  slug text not null,
  name_ru text not null,
  name_kk text not null,
  kind text not null,
  is_selectable boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  source_updated_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlements_kind_check check (kind in ('city', 'town', 'urban_settlement', 'village', 'district', 'city_district', 'other')),
  constraint settlements_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint settlements_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint settlements_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint settlements_not_own_parent check (parent_id is null or parent_id <> id),
  constraint settlements_region_slug_unique unique (region_id, slug)
);

create or replace function private.validate_settlement_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_region_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select settlement.region_id into strict parent_region_id
  from public.settlements as settlement
  where settlement.id = new.parent_id;

  if parent_region_id <> new.region_id then
    raise exception 'settlement parent must belong to the same region';
  end if;

  if exists (
    with recursive ancestors as (
      select settlement.id, settlement.parent_id
      from public.settlements as settlement
      where settlement.id = new.parent_id
      union all
      select parent.id, parent.parent_id
      from public.settlements as parent
      join ancestors on ancestors.parent_id = parent.id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'settlement hierarchy cycle detected';
  end if;

  return new;
end;
$$;

create trigger locales_set_updated_at
before update on public.locales
for each row execute function private.set_updated_at();

create trigger countries_set_updated_at
before update on public.countries
for each row execute function private.set_updated_at();

create trigger regions_set_updated_at
before update on public.regions
for each row execute function private.set_updated_at();

create trigger settlements_set_updated_at
before update on public.settlements
for each row execute function private.set_updated_at();

create trigger settlements_validate_parent
before insert or update of parent_id, region_id on public.settlements
for each row execute function private.validate_settlement_parent();

commit;
