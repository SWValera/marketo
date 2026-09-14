-- PostgREST runs STABLE RPCs in READ ONLY transactions.
-- Offer reads must not acquire the FOR SHARE lock used by account writes.
begin;
create or replace function public.get_city_premium_offer(target_listing_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare item public.listings; offer jsonb; placement jsonb;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.profiles where id=(select auth.uid()) and status<>'deleted') then raise exception 'authentication required' using errcode='42501'; end if;
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

-- Keep the existing UUID activation RPC backward-compatible. This result adapter
-- delegates all allocation, pending approval, duration and payment rules to it.
create function public.connect_city_premium(target_listing_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare item public.listings; previous_id uuid; chosen_id uuid; chosen_status text; reason text;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('status','LISTING_NOT_ELIGIBLE','reason','authentication_required');
  end if;
  select * into item from public.listings where id=target_listing_id and owner_id=(select auth.uid()) for update;
  if not found then return jsonb_build_object('status','LISTING_NOT_ELIGIBLE','reason','listing_unavailable'); end if;
  -- Same listing lock as activation: concurrent successful retries are distinguishable.
  select id into previous_id from public.city_premium_placements where listing_id=item.id and promotion_type='CITY_PREMIUM'
    and status='active' and starts_at<=clock_timestamp() and ends_at>clock_timestamp() order by created_at desc limit 1;
  begin
    -- A stale intent in an active listing is not a reservation. Matching intents
    -- are activated by the existing helper; incompatible old intents keep history.
    if item.status='active' then
      update public.city_premium_placements set status='cancelled',failure_reason='listing_unavailable'
        where listing_id=item.id and promotion_type='CITY_PREMIUM' and status='pending_approval'
          and (user_id is distinct from item.owner_id or settlement_id is distinct from item.settlement_id);
    end if;
    chosen_id:=public.activate_city_premium(item.id);
  exception
    when check_violation then
      if sqlerrm='city premium capacity exceeded' then return jsonb_build_object('status','NO_SLOTS'); end if;
      raise;
    when unique_violation then
      if sqlerrm='promotion already active' and exists(
        select 1 from public.city_premium_placements where listing_id=item.id and promotion_type='CITY_PREMIUM'
        and ((status='reserved' and reservation_expires_at>clock_timestamp()) or (status='active' and ends_at>clock_timestamp()))
      ) then return jsonb_build_object('status','RESERVED'); end if;
      raise;
    when invalid_parameter_value then
      if sqlerrm='payment required' then return jsonb_build_object('status','PAYMENT_REQUIRED'); end if;
      if sqlerrm='promotion disabled' then return jsonb_build_object('status','DISABLED'); end if;
      if sqlerrm not in ('listing not active','listing unavailable') then raise; end if;
      reason:=case when item.deleted_at is not null then 'listing_deleted'
        when item.status not in ('active','pending') then 'listing_status'
        when item.status='active' and item.published_at is null then 'not_published'
        when item.status='active' and (item.expires_at is null or item.expires_at<=clock_timestamp()) then 'listing_expired'
        else 'city_unavailable' end;
      return jsonb_build_object('status','LISTING_NOT_ELIGIBLE','reason',reason);
    when insufficient_privilege then
      if sqlerrm not in ('authentication required','listing unavailable') then raise; end if;
      return jsonb_build_object('status','LISTING_NOT_ELIGIBLE','reason',case when sqlerrm='authentication required' then 'account_unavailable' else 'listing_unavailable' end);
  end;
  select status into chosen_status from public.city_premium_placements where id=chosen_id;
  return jsonb_build_object('status',case when chosen_status='pending_approval' then 'PENDING_APPROVAL'
    when chosen_id=previous_id then 'ALREADY_ACTIVE' else 'ACTIVE' end,'placement_id',chosen_id);
end;
$$;
revoke all on function public.connect_city_premium(uuid) from public,anon,authenticated;
grant execute on function public.connect_city_premium(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
