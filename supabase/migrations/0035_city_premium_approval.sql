-- A moderation intent is not a capacity reservation and has no running term.
begin;
alter table public.city_premium_placements
  add column failure_reason text check (failure_reason in ('capacity_full','moderation_rejected','listing_unavailable','activation_failed')),
  drop constraint city_premium_placements_status_check,
  add constraint city_premium_placements_status_check check (status in ('pending_approval','reserved','active','expired','cancelled','paused','completed')),
  add constraint city_premium_pending_no_window check (status<>'pending_approval' or
    (starts_at is null and ends_at is null and reservation_expires_at is null and failure_reason is null));
create unique index promotion_pending_listing_unique on public.city_premium_placements(listing_id,promotion_type)
  where status='pending_approval';

-- Share the 0034 allocation path, unchanged capacity trigger, city lock and payment gate.
create function private.activate_city_premium_for_owner(target_listing_id uuid, target_owner_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare item public.listings; product public.promotion_products; actor uuid:=target_owner_id; instant timestamptz; placement_id uuid;
begin
  -- Called after owner authentication or by the locked moderation transition.
  perform 1 from public.profiles where id=actor and status<>'deleted' for share;
  if not found then raise exception 'authentication required' using errcode='42501'; end if;
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
  -- The selected intent starts its term and consumes capacity only at this update.
  update public.city_premium_placements set status='active',starts_at=instant,
      ends_at=instant+product.duration_seconds*interval '1 second',
      price_amount=product.price_amount,currency=product.currency,payment_status='not_required',failure_reason=null
    where listing_id=item.id and user_id=actor and settlement_id=item.settlement_id
      and promotion_type=product.code and status='pending_approval'
    returning id into placement_id;
  if placement_id is not null then return placement_id; end if;
  insert into public.city_premium_placements(listing_id,user_id,settlement_id,promotion_type,status,starts_at,ends_at,price_amount,currency,payment_status)
    values(item.id,actor,item.settlement_id,product.code,'active',instant,instant+product.duration_seconds*interval '1 second',product.price_amount,product.currency,'not_required') returning id into placement_id;
  return placement_id;
end;
$$;

create or replace function public.activate_city_premium(target_listing_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare item public.listings; actor uuid:=(select auth.uid()); product public.promotion_products; placement_id uuid;
begin
  if actor is null or not (select private.current_profile_accepts_account_writes()) then raise exception 'authentication required' using errcode='42501'; end if;
  -- Serialize selection with repeated clicks and the moderator's decision.
  select * into item from public.listings where id=target_listing_id and owner_id=actor for update;
  if not found then raise exception 'listing unavailable' using errcode='42501'; end if;
  if item.status<>'pending' then return private.activate_city_premium_for_owner(item.id,actor); end if;
  if item.deleted_at is not null or not exists(select 1 from public.settlements where id=item.settlement_id and is_active and is_selectable) then
    raise exception 'listing unavailable' using errcode='22023';
  end if;
  select id into placement_id from public.city_premium_placements
    where listing_id=item.id and promotion_type='CITY_PREMIUM' and status='pending_approval';
  if placement_id is not null then return placement_id; end if;
  select * into strict product from public.promotion_products where code='CITY_PREMIUM' for share;
  if not product.enabled then raise exception 'promotion disabled' using errcode='22023'; end if;
  if product.price_amount<>0 then raise exception 'payment required' using errcode='22023'; end if;
  -- Selection is not a promise of a place at approval.
  if not exists(select 1 from public.get_city_premium_availability(item.settlement_id) where available>0) then
    raise exception 'city premium capacity exceeded' using errcode='23514';
  end if;
  insert into public.city_premium_placements(listing_id,user_id,settlement_id,promotion_type,status,starts_at,ends_at,price_amount,currency,payment_status)
    values(item.id,actor,item.settlement_id,product.code,'pending_approval',null,null,product.price_amount,product.currency,'not_required')
    returning id into placement_id;
  return placement_id;
end;
$$;

create function private.resolve_city_premium_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare intent public.city_premium_placements; reason text;
begin
  select * into intent from public.city_premium_placements
    where listing_id=new.id and promotion_type='CITY_PREMIUM' and status='pending_approval' for update;
  if not found then return new; end if;
  if new.status='active' and new.deleted_at is null
      and new.owner_id=intent.user_id and new.settlement_id=intent.settlement_id then
    -- Isolate ONLY the optional promotion. A refusal must not undo moderation.
    begin
      perform private.activate_city_premium_for_owner(new.id,intent.user_id);
      -- An already-active placement is idempotent; an obsolete intent must not linger.
      update public.city_premium_placements set status='cancelled' where id=intent.id and status='pending_approval';
      return new;
    exception when others then
      reason:=case when sqlstate='23514' and sqlerrm='city premium capacity exceeded' then 'capacity_full' else 'activation_failed' end;
    end;
  else
    reason:=case when new.status='rejected' then 'moderation_rejected' else 'listing_unavailable' end;
  end if;
  update public.city_premium_placements set status='cancelled',failure_reason=reason where id=intent.id;
  return new;
end;
$$;
create trigger listings_resolve_city_premium_approval
after update of status on public.listings for each row
when (old.status='pending' and new.status<>'pending')
execute function private.resolve_city_premium_approval();

create or replace function public.get_city_premium_offer(target_listing_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare item public.listings; offer jsonb; placement jsonb;
begin
  if (select auth.uid()) is null or not (select private.current_profile_accepts_account_writes()) then raise exception 'authentication required' using errcode='42501'; end if;
  select * into item from public.listings where id=target_listing_id and owner_id=(select auth.uid()) and deleted_at is null;
  if not found then raise exception 'listing unavailable' using errcode='42501'; end if;
  select to_jsonb(a) into offer from public.get_city_premium_availability(item.settlement_id) a;
  select jsonb_build_object('id',p.id,'status',case when (p.status='active' and p.ends_at<=statement_timestamp()) or (p.status='reserved' and p.reservation_expires_at<=statement_timestamp()) then 'expired' else p.status end,
      'failure_reason',p.failure_reason,'ends_at',p.ends_at,'price_amount',p.price_amount,'currency',p.currency) into placement
    from public.city_premium_placements p where p.listing_id=item.id and p.promotion_type='CITY_PREMIUM'
    order by (p.status='active' and p.starts_at<=statement_timestamp() and p.ends_at>statement_timestamp()) desc nulls last,p.created_at desc,p.id desc limit 1;
  return jsonb_build_object('product',offer,'placement',placement,'listing_pending',item.status='pending','listing_active',item.status='active' and item.published_at is not null and item.expires_at>statement_timestamp());
end;
$$;

-- Private helper never accepts caller-supplied identity over the API.
revoke all on function private.activate_city_premium_for_owner(uuid,uuid),private.resolve_city_premium_approval() from public,anon,authenticated,service_role;
revoke all on function public.activate_city_premium(uuid),public.get_city_premium_offer(uuid) from public,anon;
grant execute on function public.activate_city_premium(uuid),public.get_city_premium_offer(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
