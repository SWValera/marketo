-- Marketo v1.0: reports, immutable moderation history and controlled admin RPCs.

begin;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reason_code text not null,
  details text,
  status text not null default 'open',
  moderator_id uuid references public.profiles(id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_target_present check (listing_id is not null or reported_user_id is not null),
  constraint reports_reason_format check (reason_code ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  constraint reports_details_length check (details is null or char_length(details) <= 4000),
  constraint reports_status_check check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  constraint reports_resolution_time check (
    (status in ('resolved', 'dismissed') and resolved_at is not null)
    or (status in ('open', 'in_review') and resolved_at is null)
  )
);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  moderator_id uuid references public.profiles(id) on delete set null,
  action text not null,
  previous_status text,
  new_status text,
  reason_code text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint moderation_actions_action_check check (action in ('approve', 'reject', 'hide', 'restore')),
  constraint moderation_actions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_log_action_format check (action ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  constraint admin_audit_log_entity_format check (entity_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  constraint admin_audit_log_metadata_object check (jsonb_typeof(metadata) = 'object')
);

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
begin
  if actor_id is null or not private.has_any_role(array['moderator', 'admin']) then
    raise exception 'moderator role required' using errcode = '42501';
  end if;
  if decision not in ('approve', 'reject', 'hide', 'restore') then
    raise exception 'invalid moderation decision';
  end if;

  if decision in ('reject', 'hide') and nullif(btrim(reason_code), '') is null then
    raise exception 'reason_code is required for reject and hide decisions';
  end if;

  select status into old_status
  from public.listings
  where id = target_listing_id
    and deleted_at is null
  for update;

  if old_status is null then
    raise exception 'listing is unavailable for moderation' using errcode = '22023';
  end if;

  -- Explicit moderation state machine. A moderator cannot revive drafts,
  -- rejected/sold/expired/deleted listings by choosing an arbitrary action.
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
    target_listing_id, actor_id, decision, old_status, next_status, reason_code, note
  );

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'listing.' || decision,
    'listing',
    target_listing_id::text,
    jsonb_build_object('previous_status', old_status, 'new_status', next_status, 'reason_code', reason_code)
  );
end;
$$;

create or replace function public.resolve_report(
  target_report_id uuid,
  resolution text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not private.has_any_role(array['moderator', 'admin']) then
    raise exception 'moderator role required' using errcode = '42501';
  end if;
  if resolution not in ('resolved', 'dismissed') then
    raise exception 'invalid report resolution';
  end if;

  update public.reports
  set status = resolution,
      moderator_id = actor_id,
      resolution_note = note,
      resolved_at = now()
  where id = target_report_id
    and status in ('open', 'in_review');

  if not found then
    raise exception 'report is unavailable or already closed';
  end if;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id)
  values (actor_id, 'report.' || resolution, 'report', target_report_id::text);
end;
$$;

create or replace function public.assign_user_role(
  target_user_id uuid,
  target_role text,
  enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not private.has_any_role(array['admin']) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if target_role not in ('support', 'moderator', 'admin') then
    raise exception 'invalid role';
  end if;

  if enabled then
    insert into public.user_roles (user_id, role, assigned_by)
    values (target_user_id, target_role, actor_id)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles
    where user_id = target_user_id and role = target_role;
  end if;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    case when enabled then 'role.assign' else 'role.revoke' end,
    'profile',
    target_user_id::text,
    jsonb_build_object('role', target_role)
  );
end;
$$;

revoke all on function public.moderate_listing(uuid, text, text, text) from public;
revoke all on function public.resolve_report(uuid, text, text) from public;
revoke all on function public.assign_user_role(uuid, text, boolean) from public;

create trigger reports_set_updated_at
before update on public.reports
for each row execute function private.set_updated_at();

commit;
