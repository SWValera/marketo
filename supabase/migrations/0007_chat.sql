-- Marketo v1.0: direct listing conversations with per-participant read state.

begin;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  participant_low_id uuid references public.profiles(id) on delete set null,
  participant_high_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_status_check check (status in ('active', 'closed', 'blocked')),
  constraint conversations_distinct_pair check (
    participant_low_id is null or participant_high_id is null or participant_low_id <> participant_high_id
  ),
  constraint conversations_listing_pair_unique unique (listing_id, participant_low_id, participant_high_id)
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  participant_role text not null default 'member',
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  constraint conversation_participants_role_check check (participant_role in ('buyer', 'seller', 'member'))
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null,
  message_type text not null default 'text',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint messages_body_length check (char_length(body) between 1 and 4000),
  constraint messages_body_content check (btrim(body) <> ''),
  constraint messages_type_check check (message_type in ('text', 'image', 'system')),
  constraint messages_edit_time check (edited_at is null or edited_at >= created_at),
  constraint messages_delete_time check (deleted_at is null or deleted_at >= created_at)
);

create or replace function private.is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.conversation_participants as participant
      where participant.conversation_id = target_conversation_id
        and participant.user_id = (select auth.uid())
    ),
    false
  );
$$;

revoke all on function private.is_conversation_participant(uuid) from public;

create or replace function public.get_or_create_listing_conversation(target_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  buyer_id uuid := (select auth.uid());
  seller_id uuid;
  low_id uuid;
  high_id uuid;
  created_conversation_id uuid;
begin
  if buyer_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles where id = buyer_id and status = 'active'
  ) then
    raise exception 'active profile required' using errcode = '42501';
  end if;

  select listing.owner_id into seller_id
  from public.listings as listing
  where listing.id = target_listing_id
    and listing.status = 'active'
    and listing.deleted_at is null;

  if seller_id is null then
    raise exception 'listing is unavailable';
  end if;
  if seller_id = buyer_id then
    raise exception 'owner cannot create a buyer conversation';
  end if;

  if buyer_id::text < seller_id::text then
    low_id := buyer_id;
    high_id := seller_id;
  else
    low_id := seller_id;
    high_id := buyer_id;
  end if;

  insert into public.conversations (
    listing_id, created_by, participant_low_id, participant_high_id
  ) values (
    target_listing_id, buyer_id, low_id, high_id
  )
  on conflict (listing_id, participant_low_id, participant_high_id) do nothing
  returning id into created_conversation_id;

  if created_conversation_id is null then
    select conversation.id into strict created_conversation_id
    from public.conversations as conversation
    where conversation.listing_id = target_listing_id
      and conversation.participant_low_id = low_id
      and conversation.participant_high_id = high_id;
  end if;

  insert into public.conversation_participants (conversation_id, user_id, participant_role)
  values
    (created_conversation_id, buyer_id, 'buyer'),
    (created_conversation_id, seller_id, 'seller')
  on conflict (conversation_id, user_id) do nothing;

  return created_conversation_id;
end;
$$;

revoke all on function public.get_or_create_listing_conversation(uuid) from public;

create or replace function private.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function private.touch_conversation_after_message() from public;

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function private.set_updated_at();

create trigger messages_touch_conversation
after insert on public.messages
for each row execute function private.touch_conversation_after_message();

commit;
