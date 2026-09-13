-- Message actions use existing timestamps. No direct client UPDATE/DELETE grants.
begin;

create or replace function public.edit_listing_message(
  target_conversation_id uuid, target_message_id uuid, message_body text,
  expected_edited_at timestamptz default null
) returns setof public.messages
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); item public.messages; clean_body text := regexp_replace(message_body, '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if actor is null or not (select private.current_profile_is_active())
    or not private.is_conversation_participant(target_conversation_id) then
    raise exception 'message unavailable' using errcode = '42501';
  end if;
  if clean_body is null or char_length(clean_body) not between 1 and 4000 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  select * into item from public.messages where id = target_message_id
    and conversation_id = target_conversation_id and sender_id = actor and message_type = 'text' for update;
  if not found or item.deleted_at is not null then
    raise exception 'message unavailable' using errcode = '42501';
  end if;
  -- Same-body retries are idempotent. A stale device cannot overwrite a newer edit.
  if item.body = clean_body then return next item; return; end if;
  if item.edited_at is distinct from expected_edited_at then
    raise exception 'message changed; reload before editing' using errcode = '40001';
  end if;
  return query update public.messages set body = clean_body,
    edited_at = greatest(clock_timestamp(), item.created_at, coalesce(item.edited_at, item.created_at) + interval '1 microsecond')
    where id = item.id returning *;
end;
$$;

create or replace function public.delete_listing_message(target_conversation_id uuid, target_message_id uuid)
returns setof public.messages language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); item public.messages;
begin
  if actor is null or not (select private.current_profile_is_active())
    or not private.is_conversation_participant(target_conversation_id) then
    raise exception 'message unavailable' using errcode = '42501';
  end if;
  select * into item from public.messages where id = target_message_id
    and conversation_id = target_conversation_id and sender_id = actor and message_type = 'text' for update;
  if not found then raise exception 'message unavailable' using errcode = '42501'; end if;
  if item.deleted_at is not null then return next item; return; end if;
  -- Retain the record/relations/order, but never expose deleted text via SELECT or Realtime.
  return query update public.messages set body = '[deleted]',
    deleted_at = greatest(clock_timestamp(), item.created_at, coalesce(item.edited_at, item.created_at))
    where id = item.id returning *;
end;
$$;

-- Reconcile only changed records from a bounded window of already loaded IDs.
-- This catches missed Realtime events without client-clock watermarks or full body refetches.
create or replace function public.sync_listing_message_changes(target_conversation_id uuid, known_messages jsonb)
returns setof public.messages language plpgsql stable security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null or not (select private.current_profile_is_active())
    or not private.is_conversation_participant(target_conversation_id) then
    raise exception 'conversation unavailable' using errcode = '42501';
  end if;
  if jsonb_typeof(known_messages) is distinct from 'array' then
    raise exception 'invalid message window' using errcode = '22023';
  end if;
  if jsonb_array_length(known_messages) > 100 then
    raise exception 'message window too large' using errcode = '22023';
  end if;
  return query select m.* from public.messages m
    join jsonb_to_recordset(known_messages) as known(id uuid, edited_at timestamptz, deleted_at timestamptz) on known.id = m.id
    where m.conversation_id = target_conversation_id
      and (m.edited_at is distinct from known.edited_at or m.deleted_at is distinct from known.deleted_at);
end;
$$;

revoke all on function public.edit_listing_message(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.delete_listing_message(uuid,uuid) from public, anon, authenticated;
revoke all on function public.sync_listing_message_changes(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.edit_listing_message(uuid,uuid,text,timestamptz) to authenticated;
grant execute on function public.delete_listing_message(uuid,uuid) to authenticated;
grant execute on function public.sync_listing_message_changes(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
