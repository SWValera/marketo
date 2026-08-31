-- Marketo v1.0 Stage 2: active-staff enforcement and moderation input hardening.
begin;

create or replace function private.has_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.user_roles as role_row
      join public.profiles as profile on profile.id = role_row.user_id
      where role_row.user_id = (select auth.uid())
        and role_row.role = any(required_roles)
        and profile.status = 'active'
    ),
    false
  );
$$;

revoke execute on function private.has_any_role(text[]) from public, anon;
grant execute on function private.has_any_role(text[]) to authenticated;

-- Support remains a distinct role but cannot read pending listing moderation
-- data. Owners retain access to their own non-public listings.
drop policy if exists listings_authenticated_read on public.listings;
create policy listings_authenticated_read
on public.listings for select to authenticated
using (
  (status = 'active' and published_at is not null and deleted_at is null)
  or owner_id = (select auth.uid())
  or (select private.has_any_role(array['moderator', 'admin']))
);

drop policy if exists listing_attribute_values_authenticated_read on public.listing_attribute_values;
create policy listing_attribute_values_authenticated_read
on public.listing_attribute_values for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and (
        (listings.status = 'active' and listings.published_at is not null and listings.deleted_at is null)
        or listings.owner_id = (select auth.uid())
        or (select private.has_any_role(array['moderator', 'admin']))
      )
  )
);

drop policy if exists listing_attribute_options_authenticated_read on public.listing_attribute_option_values;
create policy listing_attribute_options_authenticated_read
on public.listing_attribute_option_values for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_option_values.listing_id
      and (
        (listings.status = 'active' and listings.published_at is not null and listings.deleted_at is null)
        or listings.owner_id = (select auth.uid())
        or (select private.has_any_role(array['moderator', 'admin']))
      )
  )
);

drop policy if exists listing_images_authenticated_read on public.listing_images;
create policy listing_images_authenticated_read
on public.listing_images for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_images.listing_id
      and (
        (listings.status = 'active' and listings.published_at is not null and listings.deleted_at is null)
        or listings.owner_id = (select auth.uid())
        or (select private.has_any_role(array['moderator', 'admin']))
      )
  )
);

drop policy if exists profiles_moderation_staff_read on public.profiles;
create policy profiles_moderation_staff_read
on public.profiles for select to authenticated
using ((select private.has_any_role(array['moderator', 'admin'])));

create or replace function public.moderate_listing(
  target_listing_id uuid,
  decision text,
  reason_code text default null,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  old_status text;
  next_status text;
  normalized_reason text := nullif(btrim(reason_code), '');
  normalized_note text := nullif(btrim(note), '');
begin
  if actor_id is null or not private.has_any_role(array['moderator', 'admin']) then
    raise exception 'moderator role required' using errcode = '42501';
  end if;

  if decision not in ('approve', 'reject', 'hide', 'restore') then
    raise exception 'invalid moderation decision' using errcode = '22023';
  end if;

  if decision in ('reject', 'hide') and normalized_reason is null then
    raise exception 'reason_code is required for reject and hide decisions' using errcode = '22023';
  end if;

  if normalized_reason is not null and (
    char_length(normalized_reason) > 64
    or normalized_reason !~ '^[a-z][a-z0-9_]{1,63}$'
    or normalized_reason not in (
      'incomplete_information',
      'wrong_category',
      'duplicate',
      'photo_issue',
      'policy_violation',
      'other'
    )
  ) then
    raise exception 'invalid moderation reason_code' using errcode = '22023';
  end if;

  if normalized_note is not null and char_length(normalized_note) > 2000 then
    raise exception 'moderation note is too long' using errcode = '22023';
  end if;

  if decision in ('approve', 'restore') then
    normalized_reason := null;
  end if;

  select status into old_status
  from public.listings
  where id = target_listing_id
    and deleted_at is null
  for update;

  if old_status is null then
    raise exception 'listing is unavailable for moderation' using errcode = 'P0002';
  end if;

  next_status := case
    when decision = 'approve' and old_status = 'pending' then 'active'
    when decision = 'reject' and old_status = 'pending' then 'rejected'
    when decision = 'hide' and old_status = 'active' then 'archived'
    when decision = 'restore' and old_status = 'archived' then 'active'
    else null
  end;

  if next_status is null then
    raise exception 'moderation transition % -> % is not allowed', old_status, decision
      using errcode = '22023';
  end if;

  update public.listings
  set status = next_status,
      published_at = case
        when next_status = 'active' then coalesce(published_at, now())
        else published_at
      end
  where id = target_listing_id;

  insert into public.moderation_actions (
    listing_id, moderator_id, action, previous_status, new_status, reason_code, note
  ) values (
    target_listing_id, actor_id, decision, old_status, next_status, normalized_reason, normalized_note
  );

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'listing.' || decision,
    'listing',
    target_listing_id::text,
    jsonb_build_object(
      'previous_status', old_status,
      'new_status', next_status,
      'reason_code', normalized_reason,
      'note', normalized_note
    )
  );
end;
$$;

revoke execute on function public.moderate_listing(uuid, text, text, text) from public, anon;
grant execute on function public.moderate_listing(uuid, text, text, text) to authenticated;

commit;
