-- Marketo v1.0: localized-at-render notification events.

begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_format check (type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  constraint notifications_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint notifications_read_time check (read_at is null or read_at >= created_at)
);

commit;
