-- Marketo v1.0: city-scoped Premium Showcase capacity and active placements.

begin;

create table public.city_premium_settings (
  settlement_id uuid primary key references public.settlements(id) on delete cascade,
  capacity smallint not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint city_premium_settings_capacity_check check (capacity between 1 and 50)
);

create table public.city_premium_placements (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  status text not null default 'active',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint city_premium_placements_status_check check (status in ('active', 'cancelled')),
  constraint city_premium_placements_window_check check (ends_at > starts_at),
  constraint city_premium_placements_listing_unique unique (settlement_id, listing_id)
);

create index city_premium_placements_active_window_idx
on public.city_premium_placements (settlement_id, status, starts_at, ends_at, id);

create or replace function private.ensure_city_premium_setting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_selectable then
    insert into public.city_premium_settings (settlement_id)
    values (new.id)
    on conflict (settlement_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger settlements_ensure_city_premium_setting
after insert or update of is_selectable on public.settlements
for each row execute function private.ensure_city_premium_setting();

insert into public.city_premium_settings (settlement_id)
select settlement.id
from public.settlements as settlement
where settlement.is_selectable
on conflict (settlement_id) do nothing;

create or replace function private.validate_city_premium_placement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  listing_settlement_id uuid;
  city_capacity integer;
  overlapping_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.settlement_id::text, 1729));

  select listing.settlement_id into listing_settlement_id
  from public.listings as listing
  where listing.id = new.listing_id and listing.deleted_at is null;

  if listing_settlement_id is null or listing_settlement_id <> new.settlement_id then
    raise exception 'premium placement must match the listing city';
  end if;

  insert into public.city_premium_settings (settlement_id)
  values (new.settlement_id)
  on conflict (settlement_id) do nothing;

  select setting.capacity into strict city_capacity
  from public.city_premium_settings as setting
  where setting.settlement_id = new.settlement_id;

  if new.status = 'active' then
    select count(*)::integer into overlapping_count
    from public.city_premium_placements as placement
    where placement.settlement_id = new.settlement_id
      and placement.status = 'active'
      and placement.id <> new.id
      and tstzrange(placement.starts_at, placement.ends_at, '[)')
        && tstzrange(new.starts_at, new.ends_at, '[)');

    if overlapping_count >= city_capacity then
      raise exception 'city premium capacity exceeded' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger city_premium_placements_validate
before insert or update on public.city_premium_placements
for each row execute function private.validate_city_premium_placement();

create trigger city_premium_settings_set_updated_at
before update on public.city_premium_settings
for each row execute function private.set_updated_at();

create trigger city_premium_placements_set_updated_at
before update on public.city_premium_placements
for each row execute function private.set_updated_at();

alter table public.city_premium_settings enable row level security;
alter table public.city_premium_placements enable row level security;

create policy city_premium_settings_public_read
on public.city_premium_settings for select to anon, authenticated
using (
  exists (
    select 1 from public.settlements as settlement
    where settlement.id = city_premium_settings.settlement_id
      and settlement.is_active
      and settlement.is_selectable
  )
);

create policy city_premium_placements_public_active_read
on public.city_premium_placements for select to anon, authenticated
using (
  status = 'active'
  and starts_at <= current_timestamp
  and ends_at > current_timestamp
  and exists (
    select 1 from public.listings as listing
    where listing.id = city_premium_placements.listing_id
      and listing.status = 'active'
      and listing.published_at is not null
      and listing.deleted_at is null
      and listing.settlement_id = city_premium_placements.settlement_id
  )
);

create or replace function public.get_city_premium_placements(
  p_settlement_id uuid,
  p_limit integer default 15
)
returns table (
  placement_id uuid,
  listing_id uuid,
  slug text,
  title text,
  price_minor bigint,
  currency_code char(3),
  settlement_id uuid,
  location_name_ru text,
  location_name_kk text,
  primary_image_storage_key text,
  published_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    placement.id,
    listing.id,
    listing.slug,
    listing.title,
    listing.price_minor,
    listing.currency_code,
    listing.settlement_id,
    settlement.name_ru,
    settlement.name_kk,
    image.storage_key,
    listing.published_at,
    placement.starts_at,
    placement.ends_at
  from public.city_premium_placements as placement
  join public.listings as listing on listing.id = placement.listing_id
  join public.settlements as settlement on settlement.id = placement.settlement_id
  left join lateral (
    select listing_image.storage_key
    from public.listing_images as listing_image
    where listing_image.listing_id = listing.id
    order by listing_image.sort_order, listing_image.id
    limit 1
  ) as image on true
  where placement.settlement_id = p_settlement_id
    and placement.status = 'active'
    and placement.starts_at <= current_timestamp
    and placement.ends_at > current_timestamp
    and listing.status = 'active'
    and listing.published_at is not null
    and listing.deleted_at is null
    and listing.settlement_id = placement.settlement_id
  order by md5(p_settlement_id::text || ':' || placement.id::text), placement.id
  limit least(greatest(coalesce(p_limit, 15), 1), 15);
$$;

revoke all on table public.city_premium_settings, public.city_premium_placements from anon, authenticated;
grant select on table public.city_premium_settings, public.city_premium_placements to anon, authenticated;
grant all on table public.city_premium_settings, public.city_premium_placements to service_role;
revoke all on function public.get_city_premium_placements(uuid, integer) from public;
grant execute on function public.get_city_premium_placements(uuid, integer) to anon, authenticated, service_role;

commit;

