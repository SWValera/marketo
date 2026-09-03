import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import { normalizePageSize, normalizePositivePage, pageWindow } from "@/lib/data/pagination";
import type { ChatSummary, Conversation, PageResult } from "@/lib/data/types";
import type { Locale } from "@/lib/i18n/messages";
import { publicMediaUrl } from "@/lib/media/public-url";

const MAX_CONVERSATION_PAGE_SIZE = 50;
const MAX_CONVERSATION_MESSAGES = 100;

export class ChatDataError extends Error {
  constructor(
    public readonly code: "LIST_UNAVAILABLE" | "DETAIL_UNAVAILABLE" | "MESSAGE_FAILED",
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = "ChatDataError";
  }
}

type ConversationRow = {
  id: string;
  listing_id: string | null;
  participant_low_id: string | null;
  participant_high_id: string | null;
  last_message_at: string | null;
};

function peerId(row: ConversationRow, userId: string) {
  if (row.participant_low_id === userId) return row.participant_high_id;
  if (row.participant_high_id === userId) return row.participant_low_id;
  return null;
}

function safeDisplayName(value: string | null | undefined, locale: Locale) {
  return value?.trim() || (locale === "kk" ? "Пайдаланушы" : "Пользователь");
}

export async function getOrCreateListingConversation(client: MarketoSupabaseClient, listingId: string) {
  const { data, error } = await client.rpc("get_or_create_listing_conversation", { target_listing_id: listingId });
  if (error) throw new ChatDataError("MESSAGE_FAILED", { cause: error });
  return data;
}

export async function listUserConversations(
  client: MarketoSupabaseClient,
  userId: string,
  options: { page?: number; pageSize?: number; locale?: Locale } = {},
): Promise<PageResult<ChatSummary>> {
  const page = normalizePositivePage(options.page);
  const pageSize = normalizePageSize(options.pageSize, 20, MAX_CONVERSATION_PAGE_SIZE);
  const locale = options.locale ?? "ru";
  const countResult = await client.from("conversations").select("id", { count: "exact", head: true });
  if (countResult.error || countResult.count === null) {
    throw new ChatDataError("LIST_UNAVAILABLE", { cause: countResult.error });
  }
  const window = pageWindow(countResult.count, page, pageSize);
  if (window.offset === null || window.rangeEnd === null) {
    return { items: [], total: countResult.count, nextCursor: null };
  }
  const offset = window.offset;
  const conversationsResult = await client
    .from("conversations")
    .select("id, listing_id, participant_low_id, participant_high_id, last_message_at")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(offset, window.rangeEnd);
  if (conversationsResult.error) throw new ChatDataError("LIST_UNAVAILABLE", { cause: conversationsResult.error });
  const rows = (conversationsResult.data ?? []) as ConversationRow[];
  const peerIds = [...new Set(rows.map((row) => peerId(row, userId)).filter((id): id is string => Boolean(id)))];
  const listingIds = [...new Set(rows.map((row) => row.listing_id).filter((id): id is string => Boolean(id)))];
  const [profilesResult, listingsResult] = await Promise.all([
    peerIds.length
      ? client.from("profiles").select("id, display_name, avatar_path").in("id", peerIds)
      : Promise.resolve({ data: [], error: null }),
    listingIds.length
      ? client.from("listings").select("id, title").in("id", listingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error || listingsResult.error) {
    throw new ChatDataError("LIST_UNAVAILABLE", {
      cause: profilesResult.error ?? listingsResult.error,
    });
  }
  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const listings = new Map((listingsResult.data ?? []).map((listing) => [listing.id, listing.title]));

  return {
    items: rows.map((row) => {
      const resolvedPeerId = peerId(row, userId);
      const profile = resolvedPeerId ? profiles.get(resolvedPeerId) : null;
      return {
        id: row.id,
        peerName: safeDisplayName(profile?.display_name, locale),
        peerAvatarUrl: publicMediaUrl(profile?.avatar_path ?? null),
        listingId: row.listing_id,
        listingTitle: row.listing_id ? listings.get(row.listing_id) ?? null : null,
        // An exact latest-message/unread aggregate needs a bounded SQL view or
        // RPC. Do not fan one public page out into 2*N PostgREST requests.
        lastMessage: null,
        lastMessageAt: row.last_message_at,
        unreadCount: null,
      };
    }),
    total: countResult.count,
    nextCursor: offset + rows.length < countResult.count ? String(page + 1) : null,
  };
}

export async function listConversationMessages(client: MarketoSupabaseClient, conversationId: string, limit = 50) {
  const { data, error } = await client.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(Math.min(limit, 100));
  if (error) throw new ChatDataError("DETAIL_UNAVAILABLE", { cause: error });
  return data;
}

export async function getConversation(
  client: MarketoSupabaseClient,
  conversationId: string,
  userId: string,
  locale: Locale = "ru",
): Promise<Conversation | null> {
  const conversationResult = await client
    .from("conversations")
    .select("id, listing_id, participant_low_id, participant_high_id, last_message_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversationResult.error) throw new ChatDataError("DETAIL_UNAVAILABLE", { cause: conversationResult.error });
  if (!conversationResult.data) return null;
  const row = conversationResult.data as ConversationRow;
  const resolvedPeerId = peerId(row, userId);
  if (!resolvedPeerId) return null;
  const [profileResult, listingResult, messagesResult, peerMarkerResult] = await Promise.all([
    client.from("profiles").select("id, display_name, avatar_path").eq("id", resolvedPeerId).maybeSingle(),
    row.listing_id
      ? client.from("listings").select("id, title").eq("id", row.listing_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from("messages")
      .select("id, body, sender_id, created_at")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_CONVERSATION_MESSAGES),
    client
      .from("conversation_participants")
      .select("last_read_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", resolvedPeerId)
      .maybeSingle(),
  ]);
  if (profileResult.error || listingResult.error || messagesResult.error || peerMarkerResult.error) {
    throw new ChatDataError("DETAIL_UNAVAILABLE", {
      cause: profileResult.error ?? listingResult.error ?? messagesResult.error ?? peerMarkerResult.error,
    });
  }
  const peer = profileResult.data;
  const peerReadAt = peerMarkerResult.data?.last_read_at ?? null;
  const orderedMessages = (messagesResult.data ?? []).slice().reverse();
  const latest = orderedMessages.at(-1);
  return {
    id: row.id,
    peerName: safeDisplayName(peer?.display_name, locale),
    peerAvatarUrl: publicMediaUrl(peer?.avatar_path ?? null),
    listingId: row.listing_id,
    listingTitle: listingResult.data?.title ?? null,
    lastMessage: latest?.body ?? null,
    lastMessageAt: latest?.created_at ?? row.last_message_at,
    // The detail query deliberately loads a bounded message window, so it
    // cannot prove an exact conversation-wide unread aggregate.
    unreadCount: null,
    messages: orderedMessages.map((message) => ({
      id: message.id,
      body: message.body,
      sentAt: message.created_at,
      own: message.sender_id === userId,
      read: message.sender_id === userId && Boolean(peerReadAt && peerReadAt >= message.created_at),
    })),
  };
}

export async function sendTextMessage(client: MarketoSupabaseClient, conversationId: string, senderId: string, body: string) {
  const cleanBody = body.trim();
  if (!cleanBody || Array.from(cleanBody).length > 4000) throw new ChatDataError("MESSAGE_FAILED");
  const { data, error } = await client.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    body: cleanBody,
    message_type: "text",
  }).select("*").single();
  if (error) throw new ChatDataError("MESSAGE_FAILED", { cause: error });
  return data;
}

export async function markConversationRead(client: MarketoSupabaseClient, conversationId: string, userId: string) {
  const { error } = await client.from("conversation_participants").update({
    last_read_at: new Date().toISOString(),
  }).eq("conversation_id", conversationId).eq("user_id", userId);
  if (error) throw new ChatDataError("MESSAGE_FAILED", { cause: error });
}
