-- Marketo: listing contact consent and participant messaging.
-- Forward-only. No existing phone numbers are enabled or copied.
begin;

create or replace function public.save_listing_draft_with_contacts(
  p_category_id uuid, p_settlement_id uuid, p_title text, p_description text,
  p_price_minor bigint, p_currency_code char(3), p_contact_name text,
  p_contact_phone_e164 text, p_allow_messages boolean default true,
  p_attributes jsonb default '[]'::jsonb, p_allow_phone boolean default false,
  p_listing_id uuid default null
) returns table(listing_id uuid, listing_slug text, listing_status text)
language plpgsql security invoker set search_path = '' as $$
declare saved record;
begin
  if not (select private.current_profile_is_active()) then
    raise exception 'active profile required' using errcode = '42501';
  end if;
  if p_listing_id is null then
    select * into saved from public.create_listing_draft(
      p_category_id, p_settlement_id, p_title, p_description, p_price_minor,
      p_currency_code, p_contact_name, p_contact_phone_e164, p_allow_messages, p_attributes);
    listing_status := 'draft';
  else
    select * into saved from public.update_listing_draft(
      p_listing_id, p_category_id, p_settlement_id, p_title, p_description, p_price_minor,
      p_currency_code, p_contact_name, p_contact_phone_e164, p_allow_messages, p_attributes);
    listing_status := saved.listing_status;
  end if;
  update public.listing_contacts as contact
    set allow_phone = coalesce(p_allow_phone, false)
    where contact.listing_id = saved.listing_id;
  if not found then raise exception 'contact save failed' using errcode = '42501'; end if;
  listing_id := saved.listing_id;
  listing_slug := saved.listing_slug;
  return next;
end;
$$;
revoke all on function public.save_listing_draft_with_contacts(uuid,uuid,text,text,bigint,char(3),text,text,boolean,jsonb,boolean,uuid) from public, anon, authenticated;
grant execute on function public.save_listing_draft_with_contacts(uuid,uuid,text,text,bigint,char(3),text,text,boolean,jsonb,boolean,uuid) to authenticated;

-- Narrow, consent-filtered contact projection. Raw contacts and profile_private
-- keep their owner-only RLS. Private account phones are NEVER a fallback.
create or replace function public.get_listing_contact_options(target_listing_id uuid)
returns table(allow_messages boolean, allow_phone boolean, phone text)
language sql stable security definer set search_path = '' as $$
  select contact.allow_messages, contact.allow_phone,
    case when contact.allow_phone then contact.contact_phone_e164 else null end
  from public.listings as listing
  join public.listing_contacts as contact on contact.listing_id = listing.id
  join public.profiles as seller on seller.id = listing.owner_id and seller.status = 'active'
  where listing.id = target_listing_id and listing.status = 'active'
    and listing.published_at is not null and listing.expires_at > statement_timestamp()
    and listing.deleted_at is null;
$$;
revoke all on function public.get_listing_contact_options(uuid) from public, anon, authenticated;
grant execute on function public.get_listing_contact_options(uuid) to anon, authenticated;

create or replace function public.get_or_create_listing_conversation(target_listing_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  buyer_id uuid := (select auth.uid());
  seller_id uuid; low_id uuid; high_id uuid; result_id uuid; result_status text;
begin
  if buyer_id is null or not exists (select 1 from public.profiles where id = buyer_id and status = 'active') then
    raise exception 'active profile required' using errcode = '42501';
  end if;
  select listing.owner_id into seller_id from public.listings as listing
  join public.listing_contacts as contact on contact.listing_id = listing.id and contact.allow_messages
  join public.profiles as seller on seller.id = listing.owner_id and seller.status = 'active'
  where listing.id = target_listing_id and listing.status = 'active'
    and listing.published_at is not null and listing.expires_at > statement_timestamp()
    and listing.deleted_at is null;
  if seller_id is null then raise exception 'listing or messages unavailable' using errcode = '42501'; end if;
  if seller_id = buyer_id then raise exception 'cannot message yourself' using errcode = '22023'; end if;
  low_id := least(buyer_id, seller_id); high_id := greatest(buyer_id, seller_id);
  insert into public.conversations(listing_id,created_by,participant_low_id,participant_high_id)
    values(target_listing_id,buyer_id,low_id,high_id)
    on conflict (listing_id,participant_low_id,participant_high_id) do nothing;
  select id,status into result_id,result_status from public.conversations
    where listing_id = target_listing_id and participant_low_id = low_id and participant_high_id = high_id;
  if result_status is distinct from 'active' then
    raise exception 'conversation unavailable' using errcode = '42501';
  end if;
  insert into public.conversation_participants(conversation_id,user_id,participant_role)
    values(result_id,buyer_id,'buyer'),(result_id,seller_id,'seller')
    on conflict (conversation_id,user_id) do nothing;
  return result_id;
end;
$$;
revoke all on function public.get_or_create_listing_conversation(uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_listing_conversation(uuid) to authenticated;

-- Membership-only predicate also protects the existing direct insert API.
create or replace function private.can_send_listing_message(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations as conversation
    join public.conversation_participants as member on member.conversation_id = conversation.id
      and member.user_id = (select auth.uid())
    join public.profiles as sender on sender.id = member.user_id and sender.status = 'active'
    join public.profiles as peer on peer.id =
      case when conversation.participant_low_id = member.user_id
        then conversation.participant_high_id else conversation.participant_low_id end
      and peer.status = 'active'
    left join public.listing_contacts as contact on contact.listing_id = conversation.listing_id
    where conversation.id = target_conversation_id and conversation.status = 'active'
      and member.user_id in (conversation.participant_low_id,conversation.participant_high_id)
      and coalesce(contact.allow_messages, true)
  );
$$;
revoke all on function private.can_send_listing_message(uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_send_listing_message(uuid) to authenticated;

drop policy messages_participant_insert on public.messages;
create policy messages_participant_insert on public.messages for insert to authenticated
with check(sender_id = (select auth.uid()) and message_type = 'text'
  and (select private.can_send_listing_message(conversation_id)));

-- Client-generated message ID makes retry after a lost response idempotent.
create or replace function public.send_listing_message(
  target_conversation_id uuid, client_message_id uuid, message_body text
) returns table(id uuid, body text, sender_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); clean_body text := btrim(message_body, E' \n\r\t');
begin
  if actor is null or not (select private.current_profile_is_active())
    or not (select private.is_conversation_participant(target_conversation_id)) then
    raise exception 'conversation unavailable' using errcode = '42501';
  end if;
  if client_message_id is null or clean_body is null or char_length(clean_body) not between 1 and 4000 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  if not exists(select 1 from public.messages as message where message.id = client_message_id) then
    if not (select private.can_send_listing_message(target_conversation_id)) then
      raise exception 'conversation unavailable' using errcode = '42501';
    end if;
    insert into public.messages(id,conversation_id,sender_id,body,message_type)
      values(client_message_id,target_conversation_id,actor,clean_body,'text')
      on conflict on constraint messages_pkey do nothing;
  end if;
  return query select message.id,message.body,message.sender_id,message.created_at
    from public.messages as message where message.id = client_message_id
      and message.conversation_id = target_conversation_id and message.sender_id = actor
      and message.body = clean_body and message.deleted_at is null;
  if not found then raise exception 'message retry conflict' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.send_listing_message(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.send_listing_message(uuid,uuid,text) to authenticated;

-- A read receipt acknowledges an actually displayed message, not a client clock.
-- Only the receipt RPC may write the marker; legacy direct updates accept any date.
revoke update (last_read_at) on public.conversation_participants from authenticated;
create or replace function public.mark_listing_conversation_read(
  target_conversation_id uuid, through_message_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare seen_at timestamptz;
begin
  if not (select private.current_profile_is_active())
    or not (select private.is_conversation_participant(target_conversation_id)) then
    raise exception 'conversation unavailable' using errcode = '42501';
  end if;
  select created_at into seen_at from public.messages
    where id = through_message_id and conversation_id = target_conversation_id and deleted_at is null;
  if seen_at is null then raise exception 'message unavailable' using errcode = '22023'; end if;
  update public.conversation_participants
    set last_read_at = greatest(
      case when last_read_at <= statement_timestamp() then last_read_at end,
      least(seen_at, statement_timestamp()))
    where conversation_id = target_conversation_id and user_id = (select auth.uid());
end;
$$;
revoke all on function public.mark_listing_conversation_read(uuid,uuid) from public, anon, authenticated;
grant execute on function public.mark_listing_conversation_read(uuid,uuid) to authenticated;

-- One bounded inbox query; even staff only see their own personal conversations.
create or replace function public.get_my_conversation_inbox(p_page integer default 1, p_page_size integer default 20)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare actor uuid := (select auth.uid()); total_count bigint; items jsonb; offset_count bigint;
  page_size integer := least(greatest(coalesce(p_page_size,20),1),50);
begin
  if actor is null or not (select private.current_profile_is_active()) then
    raise exception 'active profile required' using errcode = '42501';
  end if;
  select count(*) into total_count from public.conversations as conversation
    where actor in (conversation.participant_low_id,conversation.participant_high_id);
  offset_count := (greatest(coalesce(p_page,1),1)::bigint - 1) * page_size;
  if offset_count >= total_count then return jsonb_build_object('items','[]'::jsonb,'total',total_count); end if;
  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb) into items from (
    select conversation.id, conversation.listing_id, listing.title as listing_title,
      peer.display_name as peer_name, peer.avatar_path as peer_avatar_path,
      latest.body as last_message, coalesce(latest.created_at,conversation.last_message_at) as last_message_at,
      (select count(*) from public.messages as unread
        where unread.conversation_id = conversation.id and unread.sender_id <> actor
          and unread.deleted_at is null
          and (member.last_read_at is null or unread.created_at > member.last_read_at)) as unread_count
    from (select * from public.conversations
      where actor in (participant_low_id,participant_high_id)
      order by last_message_at desc nulls last,id desc limit page_size offset offset_count) as conversation
    join public.conversation_participants as member on member.conversation_id = conversation.id and member.user_id = actor
    left join public.profiles as peer on peer.id = case when conversation.participant_low_id = actor
      then conversation.participant_high_id else conversation.participant_low_id end
    left join public.listings as listing on listing.id = conversation.listing_id
    left join lateral (select body,created_at from public.messages where conversation_id = conversation.id
      and deleted_at is null order by created_at desc,id desc limit 1) as latest on true
    order by conversation.last_message_at desc nulls last,conversation.id desc
  ) as item;
  return jsonb_build_object('items',items,'total',total_count);
end;
$$;
revoke all on function public.get_my_conversation_inbox(integer,integer) from public, anon, authenticated;
grant execute on function public.get_my_conversation_inbox(integer,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
