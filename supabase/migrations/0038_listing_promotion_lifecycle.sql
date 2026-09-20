-- Real, free promotion entitlements on the existing chooser and CITY_PREMIUM ledger.
-- Historical migrations remain immutable; the existing minute job remains the entry point.
begin;
set local lock_timeout = '5s';

alter table public.listings add column vip_until timestamptz,
  add column x2_until timestamptz, add column bumped_at timestamptz;
alter table public.listing_promotion_choices
  add column status text not null default 'pending_approval' check (status in ('pending_approval','active','expired')),
  add column run_id uuid not null default gen_random_uuid(),
  add column started_at timestamptz,
  add column ends_at timestamptz,
  add constraint listing_promotion_choice_window check (
    (status='pending_approval' and started_at is null and ends_at is null)
    or (status in ('active','expired') and started_at is not null and ends_at>started_at));

create table private.listing_promotion_bumps (
  run_id uuid not null,
  ordinal smallint not null check (ordinal between 1 and 14),
  listing_id uuid not null references public.listings(id) on delete cascade,
  scheduled_at timestamptz not null,
  applied_at timestamptz,
  skipped_at timestamptz,
  primary key (run_id,ordinal),
  check (applied_at is null or skipped_at is null)
);
alter table private.listing_promotion_bumps enable row level security;
revoke all on private.listing_promotion_bumps from public,anon,authenticated,service_role;
create index listing_promotion_bumps_due on private.listing_promotion_bumps(scheduled_at,listing_id)
  where applied_at is null and skipped_at is null;
create index listings_freshness on public.listings((greatest(published_at,bumped_at)) desc,id desc)
  where status='active' and deleted_at is null;

alter table public.city_premium_placements
  add column promotion_run_id uuid,
  drop constraint city_premium_placements_status_check,
  add constraint city_premium_placements_status_check check (status in ('pending_approval','waiting','reserved','active','expired','cancelled','paused','completed')),
  add constraint city_premium_waiting_no_window check (status<>'waiting' or
    (starts_at is null and ends_at is null and reservation_expires_at is null));
create unique index promotion_waiting_listing_unique on public.city_premium_placements(listing_id,promotion_type)
  where status='waiting';
create index city_premium_waiting_order on public.city_premium_placements(settlement_id,created_at,id) where status='waiting';

-- Recover the earliest approved publication from immutable moderation history.
-- Preserve the complete remaining term of an already active showcase.
-- Record previous timestamps in the existing restricted audit log for recovery.
insert into public.admin_audit_log(action,entity_type,entity_id,metadata)
select 'listing.lifetime_normalized','listing',l.id::text,
  jsonb_build_object('migration','0038','previous_published_at',l.published_at,'previous_expires_at',l.expires_at)
from public.listings l where l.deleted_at is null and (l.published_at is not null
  or exists(select 1 from public.moderation_actions a where a.listing_id=l.id and a.action='approve' and a.new_status='active'));
alter table public.listings disable trigger listings_publication_period;
with first_publication as (
  select l.id,least(l.published_at,min(a.created_at)) as first_at
  from public.listings l left join public.moderation_actions a
    on a.listing_id=l.id and a.action='approve' and a.new_status='active'
  where l.deleted_at is null group by l.id,l.published_at
)
update public.listings l set published_at=f.first_at,
  expires_at=greatest(f.first_at+interval '720 hours',
    (select max(p.ends_at) from public.city_premium_placements p where p.listing_id=l.id and p.status='active'))
from first_publication f where l.id=f.id and f.first_at is not null;
alter table public.listings enable trigger listings_publication_period;

create or replace function private.enforce_listing_publication_period()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- These columns have no client INSERT/UPDATE grants. Content-edit and submit
  -- RPCs historically clear dates; keep the first publication through every state.
  if tg_op='UPDATE' and old.published_at is not null then
    new.published_at:=old.published_at;
    new.expires_at:=greatest(old.expires_at,new.expires_at);
  elsif new.status='active' then
    new.published_at:=clock_timestamp();
    new.expires_at:=new.published_at+interval '720 hours';
  else
    new.published_at:=null;
    new.expires_at:=null;
  end if;
  if new.status='active' and new.expires_at<=statement_timestamp()
    and (tg_op='INSERT' or old.status<>'active') then
    raise exception 'publication expired' using errcode='22023';
  end if;
  return new;
end;
$$;

-- Existing capacity protection is retained, including the city advisory lock
-- and settings-row write that protects against stale repeatable-read snapshots.
-- A temporarily edited listing keeps its occupied slot until the original end.

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
      and l.status in ('active','draft','pending','rejected') and l.deleted_at is null and l.published_at is not null and l.expires_at>instant and l.settlement_id=p.settlement_id
      and ((p.status='active' and p.ends_at>instant and (new.status='reserved' or tstzrange(p.starts_at,p.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')))
        or (p.status='reserved' and p.reservation_expires_at>instant));
  if product.capacity is not null and occupied>=product.capacity then
    raise exception 'city premium capacity exceeded' using errcode='23514';
  end if;
  return new;
end;
$$;

create or replace function public.get_city_premium_availability(p_settlement_id uuid)
returns table(enabled boolean,duration_seconds integer,capacity integer,available integer,price_amount bigint,currency char(3),city_ru text,city_kk text)
language sql stable security definer set search_path = '' as $$
  select product.enabled, product.duration_seconds,product.capacity,
    greatest(0,product.capacity-(select count(*)::integer from public.city_premium_placements p join public.listings l on l.id=p.listing_id
      where p.settlement_id=p_settlement_id and p.promotion_type=product.code
        and l.status in ('active','draft','pending','rejected') and l.deleted_at is null and l.published_at is not null and l.expires_at>statement_timestamp() and l.settlement_id=p.settlement_id
        and ((p.status='active' and p.starts_at<=statement_timestamp() and p.ends_at>statement_timestamp())
          or (p.status='reserved' and p.reservation_expires_at>statement_timestamp())))),
    product.price_amount,product.currency,city.name_ru,city.name_kk
  from public.promotion_products product join public.settlements city on city.id=p_settlement_id
  where product.code='CITY_PREMIUM' and city.is_active and city.is_selectable;
$$;

create function private.listing_has_live_promotion(target_listing_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.listing_promotion_choices c where c.listing_id=target_listing_id
    and c.started_at is not null and c.ends_at>statement_timestamp())
    or exists(select 1 from public.city_premium_placements p where p.listing_id=target_listing_id
      and (p.status='waiting' or (p.status='active' and p.ends_at>statement_timestamp())));
$$;

-- Only existing, explicitly selected requests can enter the original placement ledger.
create or replace function private.activate_city_premium_for_owner(target_listing_id uuid,target_owner_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare item public.listings; intent public.city_premium_placements; product public.promotion_products;
  instant timestamptz; finish timestamptz;
begin
  select * into item from public.listings where id=target_listing_id and owner_id=target_owner_id for update;
  if not found or item.status<>'active' or item.deleted_at is not null or item.published_at is null
    or not exists(select 1 from public.profiles where id=target_owner_id and status='active') then
    raise exception 'listing unavailable' using errcode='42501';
  end if;
  select * into intent from public.city_premium_placements where listing_id=item.id
    and promotion_type='CITY_PREMIUM' and status='waiting' for update;
  if not found or intent.user_id is distinct from item.owner_id or intent.settlement_id<>item.settlement_id
    or not exists(select 1 from public.listing_promotion_choices c where c.listing_id=item.id
      and c.promotion_type='city_premium' and c.started_at is not null and c.run_id=intent.promotion_run_id) then
    raise exception 'explicit showcase package required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(item.settlement_id::text,1729));
  select * into strict product from public.promotion_products where code='CITY_PREMIUM' for share;
  if not product.enabled or product.price_amount<>0 then raise exception 'promotion unavailable' using errcode='22023'; end if;
  if not exists(select 1 from public.settlements where id=item.settlement_id and is_active and is_selectable) then
    raise exception 'city unavailable' using errcode='22023';
  end if;
  instant:=clock_timestamp(); finish:=instant+interval '168 hours';
  -- Also revives the read-time visibility of a listing whose term elapsed while
  -- its approved request was waiting. The cron never archives such a request.
  update public.listings set expires_at=greatest(expires_at,finish) where id=item.id;
  update public.city_premium_placements set status='active',starts_at=instant,ends_at=finish,
    reservation_expires_at=null,failure_reason=null where id=intent.id;
  return intent.id;
end;
$$;

create function private.process_city_premium_queue()
returns integer language plpgsql security definer set search_path='' as $$
declare candidate record; affected integer:=0;
begin
  -- Listing -> city is the same lock order as owner activation. SKIP LOCKED
  -- prevents a cron retry from waiting on an owner's in-flight transaction.
  for candidate in
    select l.id,l.owner_id from public.city_premium_placements p join public.listings l on l.id=p.listing_id
    where p.status='waiting' and l.status='active' and l.deleted_at is null
      and exists(select 1 from public.promotion_products product where product.code='CITY_PREMIUM' and product.enabled and product.price_amount=0)
      and exists(select 1 from public.settlements city where city.id=p.settlement_id and city.is_active and city.is_selectable)
      and l.settlement_id=p.settlement_id
      and exists(select 1 from public.profiles a where a.id=l.owner_id and a.status='active')
    order by p.created_at,p.id limit 2000 for update of l skip locked
  loop
    begin
      perform private.activate_city_premium_for_owner(candidate.id,candidate.owner_id);
      affected:=affected+1;
    exception when check_violation then
      if sqlerrm<>'city premium capacity exceeded' then raise; end if;
      -- Keep the same request and all seven promised days; do not consume a slot.
    end;
  end loop;
  return affected;
end;
$$;

create function private.start_listing_promotion(target_listing_id uuid,instant timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare item public.listings; choice public.listing_promotion_choices; finish timestamptz; bump_hours integer[];
begin
  select * into item from public.listings where id=target_listing_id for update;
  select * into choice from public.listing_promotion_choices where listing_id=target_listing_id for update;
  if not found or choice.status<>'pending_approval' then return; end if;
  if item.status<>'active' or item.deleted_at is not null or item.expires_at<=instant
    or not exists(select 1 from public.profiles where id=item.owner_id and status='active') then
    raise exception 'listing unavailable' using errcode='42501';
  end if;
  finish:=instant+case when choice.promotion_type='basic' then interval '72 hours' else interval '168 hours' end;
  bump_hours:=case choice.promotion_type
    when 'accelerated' then array[48,96,144]
    when 'maximum' then array[24,48,72,96,120,144,168]
    when 'city_premium' then array[12,24,36,48,60,72,84,96,108,120,132,144,156,168]
    else array[]::integer[] end;
  update public.listing_promotion_choices set status='active',started_at=instant,ends_at=finish,updated_at=instant where listing_id=item.id;
  update public.listings set vip_until=finish,
    x2_until=case when choice.promotion_type in ('maximum','city_premium') then finish else null end,
    expires_at=greatest(expires_at,finish) where id=item.id;
  insert into private.listing_promotion_bumps(run_id,ordinal,listing_id,scheduled_at)
    select choice.run_id,n::smallint,item.id,instant+h*interval '1 hour'
    from unnest(bump_hours) with ordinality as schedule(h,n) on conflict do nothing;
  if choice.promotion_type='city_premium' then
    update public.city_premium_placements set status='waiting',promotion_run_id=choice.run_id,failure_reason=null
      where listing_id=item.id and promotion_type='CITY_PREMIUM' and status='pending_approval';
    if not found then
      insert into public.city_premium_placements(listing_id,user_id,settlement_id,promotion_type,status,promotion_run_id)
        values(item.id,item.owner_id,item.settlement_id,'CITY_PREMIUM','waiting',choice.run_id);
    end if;
    -- Do not jump ahead of an older eligible request between cron ticks.
    if not exists(select 1 from public.city_premium_placements p join public.listings l on l.id=p.listing_id
      where p.status='waiting' and p.settlement_id=item.settlement_id and p.listing_id<>item.id
        and l.status='active' and l.deleted_at is null and l.settlement_id=p.settlement_id
        and exists(select 1 from public.profiles a where a.id=l.owner_id and a.status='active')) then
      begin
        perform private.activate_city_premium_for_owner(item.id,item.owner_id);
      exception
        when check_violation then
          if sqlerrm<>'city premium capacity exceeded' then raise; end if;
        when invalid_parameter_value then
          if sqlerrm not in ('promotion unavailable','city unavailable') then raise; end if;
      end;
    end if;
  end if;
end;
$$;

create or replace function public.set_listing_promotion_choice(target_listing_id uuid,promotion_choice text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.listings; account_status text; selected_run uuid;
begin
  select status into account_status from public.profiles where id=(select auth.uid()) for share;
  if not found or account_status<>'active' then raise exception 'active owner required' using errcode='42501'; end if;
  select * into item from public.listings where id=target_listing_id for update;
  if not found or item.owner_id is distinct from (select auth.uid()) or item.deleted_at is not null
    or item.status not in ('draft','pending','active','rejected') then
    raise exception 'listing unavailable' using errcode='42501';
  end if;
  if promotion_choice is not null and promotion_choice not in ('basic','accelerated','maximum','city_premium') then
    raise exception 'invalid promotion choice' using errcode='22023';
  end if;
  if private.listing_has_live_promotion(item.id) then raise exception 'promotion already active' using errcode='P0001'; end if;
  if item.published_at is not null and item.expires_at<=clock_timestamp() then
    raise exception 'publication expired' using errcode='22023';
  end if;
  -- Opt-out and changing a not-yet-started choice cannot leave a showcase intent.
  update public.city_premium_placements set status='cancelled'
    where listing_id=item.id and status='pending_approval';
  if promotion_choice is null then
    delete from public.listing_promotion_choices where listing_id=item.id;
    return;
  end if;
  insert into public.listing_promotion_choices(listing_id,promotion_type)
    values(item.id,promotion_choice)
    on conflict(listing_id) do update set promotion_type=excluded.promotion_type,status='pending_approval',
      run_id=gen_random_uuid(),started_at=null,ends_at=null,updated_at=clock_timestamp()
    returning run_id into selected_run;
  if promotion_choice='city_premium' then
    if not exists(select 1 from public.promotion_products where code='CITY_PREMIUM' and enabled and price_amount=0) then
      raise exception 'promotion unavailable' using errcode='22023';
    end if;
    insert into public.city_premium_placements(listing_id,user_id,settlement_id,promotion_type,status,promotion_run_id)
      values(item.id,item.owner_id,item.settlement_id,'CITY_PREMIUM','pending_approval',selected_run);
  end if;
  if item.status='active' then perform private.start_listing_promotion(item.id,clock_timestamp()); end if;
end;
$$;

create or replace function public.submit_listing_with_promotion_choice(target_listing_id uuid,promotion_choice text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if promotion_choice is not null and promotion_choice not in ('basic','accelerated','maximum','city_premium') then
    raise exception 'invalid promotion choice' using errcode='22023';
  end if;
  -- submit_listing retains all existing validation/auth/moderation rules and
  -- obtains the listing lock before inspecting its promotion. Editing an active
  -- package cannot restart, replace or cancel the remaining entitlement.
  perform public.submit_listing(target_listing_id);
  if not private.listing_has_live_promotion(target_listing_id) then
    perform public.set_listing_promotion_choice(target_listing_id,promotion_choice);
  end if;
end;
$$;

-- Reuse the existing approval trigger, now resolving the selected package.
create or replace function private.resolve_city_premium_approval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' then
    perform private.start_listing_promotion(new.id,case when old.published_at is null then new.published_at else clock_timestamp() end);
  end if;
  return new;
end;
$$;

-- Archiving/deleting cancels visibility immediately. Editing/rejection preserves
-- timestamps and the same placement, without creating a free extension.
create function private.cancel_unavailable_listing_promotions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.deleted_at is not null or new.status in ('archived','sold','expired','deleted') then
    update public.city_premium_placements set status='cancelled'
      where listing_id=new.id and status in ('pending_approval','waiting','active','reserved');
    update private.listing_promotion_bumps set skipped_at=clock_timestamp()
      where listing_id=new.id and applied_at is null and skipped_at is null;
    update public.listings set vip_until=null,x2_until=null where id=new.id and (vip_until is not null or x2_until is not null);
    update public.listing_promotion_choices set status='expired',ends_at=greatest(started_at+interval '1 microsecond',least(ends_at,clock_timestamp()))
      where listing_id=new.id and started_at is not null and status='active';
    delete from public.listing_promotion_choices where listing_id=new.id and status='pending_approval';
  end if;
  return new;
end;
$$;
create trigger listings_cancel_unavailable_promotions after update of status,deleted_at on public.listings
  for each row execute function private.cancel_unavailable_listing_promotions();

create function private.process_listing_promotion_bumps()
returns integer language plpgsql security definer set search_path='' as $$
declare item record; last_due timestamptz; affected integer:=0; changed integer;
begin
  for item in select l.id,l.status,l.deleted_at from public.listings l
    where exists(select 1 from private.listing_promotion_bumps b where b.listing_id=l.id
      and b.scheduled_at<=clock_timestamp() and b.applied_at is null and b.skipped_at is null)
    order by l.id limit 2000 for update skip locked
  loop
    -- Catch-up uses the scheduled freshness time, never retry execution time.
    -- Events blocked by moderation remain pending, with their original dates.
    if item.status='active' and item.deleted_at is null then
      with due as (
        update private.listing_promotion_bumps b set applied_at=clock_timestamp()
        where b.listing_id=item.id and b.scheduled_at<=clock_timestamp() and b.applied_at is null and b.skipped_at is null
          and exists(select 1 from public.listing_promotion_choices c
            where c.listing_id=item.id and c.run_id=b.run_id and b.scheduled_at<=c.ends_at)
        returning scheduled_at
      ) select max(scheduled_at),count(*) into last_due,changed from due;
      if last_due is not null then
        update public.listings set bumped_at=greatest(bumped_at,last_due) where id=item.id;
        affected:=affected+changed;
      end if;
    end if;
  end loop;
  return affected;
end;
$$;

create or replace function public.expire_listing_promotions()
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  perform private.process_listing_promotion_bumps();
  with due as (select id from public.city_premium_placements
    where (status='active' and ends_at<=statement_timestamp()) or (status='reserved' and reservation_expires_at<=statement_timestamp())
    order by coalesce(ends_at,reservation_expires_at),id limit 2000 for update skip locked)
  update public.city_premium_placements p set status='expired' from due where p.id=due.id;
  get diagnostics affected=row_count;
  update public.listing_promotion_choices set status='expired',updated_at=clock_timestamp()
    where status='active' and ends_at<=statement_timestamp();
  -- The read projection enforces exact cutoffs even between minute jobs.
  perform private.process_city_premium_queue();
  return affected;
end;
$$;

create or replace function public.archive_expired_listings()
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  -- Final +168-hour bumps are processed before expiry, including retry catch-up.
  perform public.expire_listing_promotions();
  with due as (
    select l.id from public.listings l where l.status='active' and l.deleted_at is null
      and (l.published_at is null or l.expires_at is null or l.expires_at<=statement_timestamp())
      and not exists(select 1 from public.city_premium_placements p
        where p.listing_id=l.id and p.status='waiting' and p.settlement_id=l.settlement_id
          and exists(select 1 from public.profiles a where a.id=l.owner_id and a.status='active'))
    order by l.expires_at nulls first,l.id limit 2000 for update skip locked
  ) update public.listings l set status='archived',promoted_until=null from due where l.id=due.id;
  get diagnostics affected=row_count;
  return affected;
end;
$$;

create function public.get_listing_promotion_state(target_listing_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item public.listings; choice public.listing_promotion_choices; showcase jsonb;
begin
  if not (select private.current_profile_is_active()) then raise exception 'active owner required' using errcode='42501'; end if;
  select * into item from public.listings where id=target_listing_id and owner_id=(select auth.uid()) and deleted_at is null;
  if not found then raise exception 'listing unavailable' using errcode='42501'; end if;
  select * into choice from public.listing_promotion_choices where listing_id=item.id;
  select jsonb_build_object('status',case when p.status='active' and p.ends_at<=statement_timestamp() then 'expired' else p.status end,
    'startsAt',p.starts_at,'endsAt',p.ends_at) into showcase
    from public.city_premium_placements p where p.listing_id=item.id and p.promotion_type='CITY_PREMIUM'
    order by p.created_at desc,p.id desc limit 1;
  return jsonb_build_object('promotionChoice',coalesce(choice.promotion_type,
      case when showcase->>'status' in ('active','waiting') then 'city_premium' end),
    'status',case when choice.listing_id is null then 'none' when choice.ends_at<=statement_timestamp() then 'expired' else choice.status end,
    'startedAt',choice.started_at,'endsAt',choice.ends_at,
    'locked',private.listing_has_live_promotion(item.id),'showcase',showcase);
end;
$$;

create or replace view public.catalog_listing_cards with (security_invoker=true) as
select listing.id,listing.slug,listing.title,listing.price_minor,listing.currency_code,
  listing.category_id,category.slug as category_slug,listing.settlement_id,
  settlement.name_ru as location_name_ru,settlement.name_kk as location_name_kk,
  listing.published_at,(listing.promoted_until is not null and listing.promoted_until>now()) as promoted,
  primary_image.storage_key as primary_image_storage_key,listing.expires_at,
  case when listing.vip_until>statement_timestamp() then listing.vip_until end as vip_until,
  case when listing.x2_until>statement_timestamp() then listing.x2_until end as x2_until,
  greatest(listing.published_at,listing.bumped_at) as sort_at
from public.listings listing
join public.categories category on category.id=listing.category_id
join public.settlements settlement on settlement.id=listing.settlement_id
left join lateral (select image.storage_key from public.listing_images image
  where image.listing_id=listing.id order by image.sort_order,image.id limit 1) primary_image on true
where listing.status='active' and listing.published_at is not null and listing.deleted_at is null
  and listing.expires_at>statement_timestamp();

-- No new public write grants: dates, entitlements, execution records and slots
-- remain unwriteable by browser roles. Disable the legacy standalone bypass.
revoke all on function public.activate_city_premium(uuid),public.connect_city_premium(uuid) from public,anon,authenticated,service_role;
revoke all on function private.listing_has_live_promotion(uuid),
  private.activate_city_premium_for_owner(uuid,uuid),private.process_city_premium_queue(),
  private.start_listing_promotion(uuid,timestamptz),private.cancel_unavailable_listing_promotions(),
  private.process_listing_promotion_bumps(),private.enforce_listing_publication_period(),
  private.resolve_city_premium_approval() from public,anon,authenticated,service_role;
revoke all on function public.get_listing_promotion_state(uuid),public.set_listing_promotion_choice(uuid,text),
  public.submit_listing_with_promotion_choice(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_listing_promotion_state(uuid),public.set_listing_promotion_choice(uuid,text),
  public.submit_listing_with_promotion_choice(uuid,text) to authenticated;
revoke all on function public.archive_expired_listings(),public.expire_listing_promotions() from public,anon,authenticated;
grant execute on function public.archive_expired_listings(),public.expire_listing_promotions() to service_role;
comment on table public.listing_promotion_choices is 'Server-owned package lifecycle. Browser submits only a whitelisted package identifier.';
notify pgrst,'reload schema';
commit;
