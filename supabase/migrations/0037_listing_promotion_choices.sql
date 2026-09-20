-- Unactivated promotion preference only. No entitlements, capacity or ranking changes.
begin;
create table public.listing_promotion_choices (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  promotion_type text not null check (promotion_type in ('basic','accelerated','maximum','city_premium')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.listing_promotion_choices enable row level security;
revoke all on public.listing_promotion_choices from public, anon, authenticated;
grant select on public.listing_promotion_choices to authenticated;
create policy listing_promotion_choices_owner_read on public.listing_promotion_choices
  for select to authenticated using (
    (select private.current_profile_is_active()) and exists (
      select 1 from public.listings l where l.id=listing_id
        and l.owner_id=(select auth.uid()) and l.deleted_at is null
    )
  );

create function public.set_listing_promotion_choice(target_listing_id uuid, promotion_choice text)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.listings%rowtype; account_status text;
begin
  select p.status into account_status from public.profiles p where p.id=(select auth.uid()) for share;
  if not found or account_status <> 'active' then
    raise exception 'active owner required' using errcode='42501';
  end if;
  select * into item from public.listings where id=target_listing_id for update;
  if not found or item.owner_id is distinct from (select auth.uid()) or item.deleted_at is not null
    or item.status not in ('draft','pending','active','rejected') then
    raise exception 'listing unavailable' using errcode='42501';
  end if;
  if promotion_choice is not null and promotion_choice not in ('basic','accelerated','maximum','city_premium') then
    raise exception 'invalid promotion choice' using errcode='22023';
  end if;
  if promotion_choice is null then
    delete from public.listing_promotion_choices where listing_id=target_listing_id;
  else
    insert into public.listing_promotion_choices(listing_id,promotion_type)
      values(target_listing_id,promotion_choice)
      on conflict(listing_id) do update set promotion_type=excluded.promotion_type, updated_at=now();
  end if;
end;
$$;

-- Existing moderation, same transaction: neither part can commit alone.
-- Legacy submit_listing callers retain their existing behavior.
create function public.submit_listing_with_promotion_choice(target_listing_id uuid, promotion_choice text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.submit_listing(target_listing_id);
  perform public.set_listing_promotion_choice(target_listing_id,promotion_choice);
end;
$$;
revoke all on function public.set_listing_promotion_choice(uuid,text) from public, anon;
revoke all on function public.submit_listing_with_promotion_choice(uuid,text) from public, anon;
grant execute on function public.set_listing_promotion_choice(uuid,text) to authenticated;
grant execute on function public.submit_listing_with_promotion_choice(uuid,text) to authenticated;
comment on table public.listing_promotion_choices is 'Owner-selected promotion intent; does not activate any promotion.';
notify pgrst, 'reload schema';
commit;
