-- Extend the existing placement ledger; preserve commercial orders and analytics IDs.
begin;
create table public.promotion_products (
  code text primary key check (code in ('CITY_PREMIUM','VIP','TOP','BUMP','HIGHLIGHT')),
  name_ru text not null, name_kk text not null,
  enabled boolean not null default false,
  duration_seconds integer not null check (duration_seconds > 0),
  capacity integer check (capacity > 0),
  constraint city_premium_capacity_required check (code <> 'CITY_PREMIUM' or capacity is not null),
  price_amount bigint not null check (price_amount >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now()
);
insert into public.promotion_products(code,name_ru,name_kk,enabled,duration_seconds,capacity,price_amount,currency)
values ('CITY_PREMIUM','Городская премиум-витрина','Қалалық премиум-витрина',true,604800,15,0,'KZT');
create trigger promotion_products_updated before update on public.promotion_products
for each row execute function private.set_updated_at();
alter table public.promotion_products enable row level security;
create policy promotion_products_read on public.promotion_products for select to anon, authenticated using (code='CITY_PREMIUM');
revoke all on public.promotion_products from public, anon, authenticated;
grant select on public.promotion_products to anon, authenticated;
grant all on public.promotion_products to service_role;

-- Keep the historical table name to avoid duplicating placements or breaking FKs.
alter table public.city_premium_placements
  add column promotion_type text not null default 'CITY_PREMIUM' references public.promotion_products(code),
  add column user_id uuid references public.profiles(id) on delete set null,
  add column price_amount bigint not null default 0 check (price_amount >= 0),
  add column currency char(3) not null default 'KZT' check (currency ~ '^[A-Z]{3}$'),
  add column payment_status text not null default 'not_required'
    check (payment_status in ('not_required','pending','authorized','paid','failed','refunded','cancelled')),
  add column payment_reference text,
  add column reservation_expires_at timestamptz,
  alter column starts_at drop not null,
  alter column ends_at drop not null,
  drop constraint city_premium_placements_listing_unique,
  drop constraint city_premium_placements_status_check,
  add constraint city_premium_placements_status_check check (status in ('reserved','active','expired','cancelled','paused','completed')),
  add constraint city_premium_reservation_window check (status <> 'reserved' or reservation_expires_at is not null),
  add constraint city_premium_active_window check (status <> 'active' or (starts_at is not null and ends_at is not null));
alter table public.city_premium_placements disable trigger city_premium_placements_validate;
-- A historical owner can be NULL after account erasure. New activations always derive auth.uid().
update public.city_premium_placements p set user_id=l.owner_id from public.listings l where l.id=p.listing_id;
update public.city_premium_placements p set price_amount=coalesce(o.amount_minor,0),currency=o.currency_code,
  payment_reference=o.external_payment_reference,
  payment_status=case when o.payment_status='settled' then 'paid' when o.payment_status='authorized' then 'authorized'
    when o.payment_status='refunded' then 'refunded' when o.payment_status='failed' then 'failed'
    when coalesce(o.amount_minor,0)>0 then 'pending' else 'not_required' end
from public.city_premium_orders o where o.id=p.order_id;
alter table public.city_premium_placements enable trigger city_premium_placements_validate;
create index promotion_owner_history_idx on public.city_premium_placements(user_id,listing_id,promotion_type,created_at desc);
create index promotion_city_window_idx on public.city_premium_placements(settlement_id,promotion_type,status,ends_at,reservation_expires_at);
create policy promotion_owner_read on public.city_premium_placements for select to authenticated using (user_id=(select auth.uid()));

create or replace function private.validate_city_premium_placement()
returns trigger language plpgsql set search_path = '' as $$
declare item public.listings; product public.promotion_products; occupied integer; instant timestamptz;
begin
  -- Cleanup changes only status; do not revalidate listings that have since disappeared.
  if new.status not in ('active','reserved') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.settlement_id::text,1729));
  -- Updating the existing city row also makes stale Repeatable Read transactions
  -- fail with a serialization error instead of counting from an old snapshot.
  insert into public.city_premium_settings(settlement_id,capacity)
    select new.settlement_id,capacity from public.promotion_products where code='CITY_PREMIUM'
    on conflict(settlement_id) do update set updated_at=clock_timestamp();
  instant := clock_timestamp();
  select * into strict product from public.promotion_products where code=new.promotion_type for share;
  select * into item from public.listings where id=new.listing_id;
  if not found or item.deleted_at is not null or item.settlement_id<>new.settlement_id then
    raise exception 'premium placement must match the listing city' using errcode='23514';
  end if;
  if new.user_id is null then new.user_id:=item.owner_id; end if;
  if new.user_id is distinct from item.owner_id then raise exception 'promotion owner mismatch' using errcode='42501'; end if;
  -- Expired historical records do not consume capacity or prevent renewal.
  if (new.status='active' and new.ends_at<=instant) or (new.status='reserved' and new.reservation_expires_at<=instant) then return new; end if;
  if exists(select 1 from public.city_premium_placements p where p.id<>new.id and p.listing_id=new.listing_id and p.promotion_type=new.promotion_type
    and ((p.status='active' and p.ends_at>instant and (new.status='reserved' or tstzrange(p.starts_at,p.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')))
      or (p.status='reserved' and p.reservation_expires_at>instant))) then
    raise exception 'promotion already active' using errcode='23505';
  end if;
  select count(*) into occupied from public.city_premium_placements p
    join public.listings l on l.id=p.listing_id
    where p.id<>new.id and p.settlement_id=new.settlement_id and p.promotion_type=new.promotion_type
      and l.status='active' and l.deleted_at is null and l.published_at is not null and l.expires_at>instant and l.settlement_id=p.settlement_id
      and ((p.status='active' and p.ends_at>instant and (new.status='reserved' or tstzrange(p.starts_at,p.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')))
        or (p.status='reserved' and p.reservation_expires_at>instant));
  if product.capacity is not null and occupied>=product.capacity then
    raise exception 'city premium capacity exceeded' using errcode='23514';
  end if;
  return new;
end;
$$;

create function public.get_city_premium_availability(p_settlement_id uuid)
returns table(enabled boolean,duration_seconds integer,capacity integer,available integer,price_amount bigint,currency char(3),city_ru text,city_kk text)
language sql stable security definer set search_path = '' as $$
  select product.enabled, product.duration_seconds,product.capacity,
    greatest(0,product.capacity-(select count(*)::integer from public.city_premium_placements p join public.listings l on l.id=p.listing_id
      where p.settlement_id=p_settlement_id and p.promotion_type=product.code
        and l.status='active' and l.deleted_at is null and l.published_at is not null and l.expires_at>statement_timestamp() and l.settlement_id=p.settlement_id
        and ((p.status='active' and p.starts_at<=statement_timestamp() and p.ends_at>statement_timestamp())
          or (p.status='reserved' and p.reservation_expires_at>statement_timestamp())))),
    product.price_amount,product.currency,city.name_ru,city.name_kk
  from public.promotion_products product join public.settlements city on city.id=p_settlement_id
  where product.code='CITY_PREMIUM' and city.is_active and city.is_selectable;
$$;

create function public.get_city_premium_offer(target_listing_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare item public.listings; offer jsonb; placement jsonb;
begin
  if (select auth.uid()) is null or not (select private.current_profile_accepts_account_writes()) then raise exception 'authentication required' using errcode='42501'; end if;
  select * into item from public.listings where id=target_listing_id and owner_id=(select auth.uid()) and deleted_at is null;
  if not found then raise exception 'listing unavailable' using errcode='42501'; end if;
  select to_jsonb(a) into offer from public.get_city_premium_availability(item.settlement_id) a;
  select jsonb_build_object('id',p.id,'status',case when (p.status='active' and p.ends_at<=statement_timestamp()) or (p.status='reserved' and p.reservation_expires_at<=statement_timestamp()) then 'expired' else p.status end,
      'ends_at',p.ends_at,'price_amount',p.price_amount,'currency',p.currency) into placement
    from public.city_premium_placements p where p.listing_id=item.id and p.promotion_type='CITY_PREMIUM'
    order by (p.status='active' and p.starts_at<=statement_timestamp() and p.ends_at>statement_timestamp()) desc nulls last,p.created_at desc,p.id desc limit 1;
  return jsonb_build_object('product',offer,'placement',placement,'listing_active',item.status='active' and item.published_at is not null and item.expires_at>statement_timestamp());
end;
$$;

create function public.activate_city_premium(target_listing_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare item public.listings; product public.promotion_products; actor uuid:=(select auth.uid()); instant timestamptz; placement_id uuid;
begin
  if actor is null or not (select private.current_profile_accepts_account_writes()) then raise exception 'authentication required' using errcode='42501'; end if;
  select * into item from public.listings where id=target_listing_id and owner_id=actor for update;
  if not found then raise exception 'listing unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(item.settlement_id::text,1729));
  instant:=clock_timestamp();
  if item.status<>'active' or item.deleted_at is not null or item.published_at is null or item.expires_at is null or item.expires_at<=instant
    or not exists(select 1 from public.settlements where id=item.settlement_id and is_active and is_selectable) then
    raise exception 'listing not active' using errcode='22023';
  end if;
  -- Retry of the same successful activation returns the original placement, without extending it.
  select id into placement_id from public.city_premium_placements where listing_id=item.id and promotion_type='CITY_PREMIUM'
    and status='active' and starts_at<=instant and ends_at>instant order by created_at desc limit 1;
  if placement_id is not null then return placement_id; end if;
  select * into strict product from public.promotion_products where code='CITY_PREMIUM' for share;
  if not product.enabled then raise exception 'promotion disabled' using errcode='22023'; end if;
  -- A future nonzero price cannot be bypassed using today's free activation RPC.
  if product.price_amount<>0 then raise exception 'payment required' using errcode='22023'; end if;
  insert into public.city_premium_placements(listing_id,user_id,settlement_id,promotion_type,status,starts_at,ends_at,price_amount,currency,payment_status)
    values(item.id,actor,item.settlement_id,product.code,'active',instant,instant+product.duration_seconds*interval '1 second',product.price_amount,product.currency,'not_required') returning id into placement_id;
  return placement_id;
end;
$$;

create function public.expire_listing_promotions()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  with due as (select id from public.city_premium_placements
    where (status='active' and ends_at<=statement_timestamp()) or (status='reserved' and reservation_expires_at<=statement_timestamp())
    order by coalesce(ends_at,reservation_expires_at),id limit 2000 for update skip locked)
  update public.city_premium_placements p set status='expired' from due where p.id=due.id;
  get diagnostics affected=row_count; return affected;
end;
$$;

-- Reuse the existing pg_cron entry point; keep ordinary listing expiry behavior intact.
create or replace function public.archive_expired_listings()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  with due as (
    select id from public.listings where status = 'active' and deleted_at is null
      and (published_at is null or expires_at is null or expires_at <= statement_timestamp())
    order by expires_at nulls first, id limit 2000 for update skip locked
  ) update public.listings as listing set status = 'archived', promoted_until = null
    from due where listing.id = due.id;
  get diagnostics affected = row_count;
  perform public.expire_listing_promotions();
  return affected;
end;
$$;
revoke all on function public.archive_expired_listings() from public, anon, authenticated;
grant execute on function public.archive_expired_listings() to service_role;


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
    least(placement.ends_at, listing.expires_at)
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
    and placement.promotion_type = 'CITY_PREMIUM'
    and placement.status = 'active'
    and placement.starts_at <= current_timestamp
    and placement.ends_at > current_timestamp
    and listing.status = 'active'
    and listing.expires_at > statement_timestamp()
    and listing.published_at is not null
    and listing.deleted_at is null
    and listing.settlement_id = placement.settlement_id
  order by md5(p_settlement_id::text || ':' || placement.id::text), placement.id
  limit least(greatest(coalesce(p_limit, (select capacity from public.promotion_products where code='CITY_PREMIUM')), 1), (select capacity from public.promotion_products where code='CITY_PREMIUM'));
$$;


revoke all on function public.get_city_premium_availability(uuid),public.get_city_premium_offer(uuid),public.activate_city_premium(uuid),public.expire_listing_promotions() from public,anon,authenticated;
grant execute on function public.get_city_premium_availability(uuid) to anon,authenticated,service_role;
grant execute on function public.get_city_premium_offer(uuid),public.activate_city_premium(uuid) to authenticated;
grant execute on function public.expire_listing_promotions() to service_role;
-- New owner/payment fields are not added to the existing public SELECT surface.
revoke select on public.city_premium_placements from anon,authenticated;
grant select(id,settlement_id,listing_id,status,starts_at,ends_at,created_at,updated_at,account_id,order_id,priority,rotation_weight,rotation_metadata,promotion_type)
  on public.city_premium_placements to anon,authenticated;
-- All critical values come from the RPC.
notify pgrst,'reload schema';
commit;
