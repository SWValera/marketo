-- Keep the existing bump schedule and idempotency; sort by actual execution.
begin;

create or replace function private.process_listing_promotion_bumps()
returns integer language plpgsql security definer set search_path='' as $$
declare item record; last_applied timestamptz; affected integer:=0; changed integer;
begin
  for item in select l.id,l.status,l.deleted_at from public.listings l
    where exists(select 1 from private.listing_promotion_bumps b where b.listing_id=l.id
      and b.scheduled_at<=clock_timestamp() and b.applied_at is null and b.skipped_at is null)
    order by l.id limit 2000 for update skip locked
  loop
    -- Freshness follows the actual applied event; scheduled_at remains unchanged.
    -- Events blocked by moderation remain pending, with their original dates.
    if item.status='active' and item.deleted_at is null then
      with due as (
        update private.listing_promotion_bumps b set applied_at=clock_timestamp()
        where b.listing_id=item.id and b.scheduled_at<=clock_timestamp() and b.applied_at is null and b.skipped_at is null
          and exists(select 1 from public.listing_promotion_choices c
            where c.listing_id=item.id and c.run_id=b.run_id and b.scheduled_at<=c.ends_at)
        returning applied_at
      ) select max(applied_at),count(*) into last_applied,changed from due;
      if last_applied is not null then
        update public.listings set bumped_at=greatest(bumped_at,last_applied) where id=item.id;
        affected:=affected+changed;
      end if;
    end if;
  end loop;
  return affected;
end;
$$;

revoke all on function private.process_listing_promotion_bumps() from public,anon,authenticated,service_role;
commit;
