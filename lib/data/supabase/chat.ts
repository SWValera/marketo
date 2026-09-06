import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import { normalizePageSize, normalizePositivePage } from "@/lib/data/pagination";
import type { ChatSummary, Conversation, PageResult } from "@/lib/data/types";
import type { Locale } from "@/lib/i18n/messages";
import { publicMediaUrl } from "@/lib/media/public-url";

export class ChatDataError extends Error {
  constructor(public readonly code: "LIST_UNAVAILABLE" | "DETAIL_UNAVAILABLE" | "MESSAGE_FAILED", options?: { cause?: unknown }) {
    super(code, options); this.name = "ChatDataError";
  }
}
export type MessageRow = { id: string; body: string; sender_id: string | null; created_at: string };
export type MessageCursor = { id: string; sentAt: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function safeDisplayName(value: string | null | undefined, locale: Locale) {
  return value?.trim() || (locale === "kk" ? "Пайдаланушы" : "Пользователь");
}
export async function getOrCreateListingConversation(client: MarketoSupabaseClient, listingId: string) {
  const { data, error } = await client.rpc("get_or_create_listing_conversation", { target_listing_id: listingId });
  if (error || !data || !UUID.test(data)) throw new ChatDataError("MESSAGE_FAILED", { cause: error });
  return data;
}
export async function listUserConversations(client: MarketoSupabaseClient, userId: string,
  options: { page?: number; pageSize?: number; locale?: Locale; signal?: AbortSignal } = {}): Promise<PageResult<ChatSummary>> {
  if (!userId) throw new ChatDataError("LIST_UNAVAILABLE");
  const page = normalizePositivePage(options.page);
  const pageSize = normalizePageSize(options.pageSize, 20, 50);
  const locale = options.locale ?? "ru";
  let query = client.rpc("get_my_conversation_inbox", { p_page: page, p_page_size: pageSize });
  if (options.signal) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new ChatDataError("LIST_UNAVAILABLE", { cause: error });
  const result = data as { total: number; items: Array<{ id: string; peer_name: string | null; peer_avatar_path: string | null; listing_id: string | null; listing_title: string | null; last_message: string | null; last_message_at: string | null; unread_count: number }> };
  if (!Number.isSafeInteger(result.total) || result.total < 0 || !Array.isArray(result.items)) throw new ChatDataError("LIST_UNAVAILABLE");
  return {
    items: result.items.map(row => ({
      id: row.id, peerName: safeDisplayName(row.peer_name, locale), peerAvatarUrl: publicMediaUrl(row.peer_avatar_path),
      listingId: row.listing_id, listingTitle: row.listing_title, lastMessage: row.last_message,
      lastMessageAt: row.last_message_at, unreadCount: row.unread_count,
    })),
    total: result.total, nextCursor: page * pageSize < result.total ? String(page + 1) : null,
  };
}
export async function readMessagePage(client: MarketoSupabaseClient, conversationId: string,
  options: { after?: MessageCursor; before?: MessageCursor; signal?: AbortSignal } = {}) {
  const cursor = options.after ?? options.before;
  if (cursor && (!UUID.test(cursor.id) || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.sentAt) || !Number.isFinite(Date.parse(cursor.sentAt)))) throw new ChatDataError("DETAIL_UNAVAILABLE");
  const ascending = Boolean(options.after);
  let query = client.from("messages").select("id, body, sender_id, created_at")
    .eq("conversation_id", conversationId).is("deleted_at", null)
    .order("created_at", { ascending }).order("id", { ascending }).limit(101);
  if (cursor) {
    const op = ascending ? "gt" : "lt";
    query = query.or("created_at." + op + "." + cursor.sentAt + ",and(created_at.eq." + cursor.sentAt + ",id." + op + "." + cursor.id + ")");
  }
  if (options.signal) query = query.abortSignal(options.signal);
  const { data, error } = await query;
  if (error) throw new ChatDataError("DETAIL_UNAVAILABLE", { cause: error });
  const rows = (data ?? []).slice(0, 100) as MessageRow[];
  return { rows: ascending ? rows : rows.reverse(), hasMore: (data?.length ?? 0) > 100 };
}
export async function listConversationMessages(client: MarketoSupabaseClient, conversationId: string, limit = 50) {
  const page = await readMessagePage(client, conversationId);
  return page.rows.slice(-Math.min(Math.max(Math.trunc(limit) || 50, 1), 100));
}
export async function getConversation(client: MarketoSupabaseClient, conversationId: string, userId: string, locale: Locale = "ru"): Promise<Conversation | null> {
  const conversationResult = await client.from("conversations")
    .select("id, listing_id, participant_low_id, participant_high_id, last_message_at, status")
    .eq("id", conversationId).maybeSingle();
  if (conversationResult.error) throw new ChatDataError("DETAIL_UNAVAILABLE", { cause: conversationResult.error });
  const row = conversationResult.data;
  if (!row) return null;
  const peerId = row.participant_low_id === userId ? row.participant_high_id
    : row.participant_high_id === userId ? row.participant_low_id : null;
  if (!peerId) return null;
  const [profile, listing, page, marker] = await Promise.all([
    client.from("profiles").select("id, display_name, avatar_path").eq("id", peerId).maybeSingle(),
    row.listing_id ? client.from("listings").select("id, title").eq("id", row.listing_id).maybeSingle() : Promise.resolve({data:null,error:null}),
    readMessagePage(client, conversationId),
    client.from("conversation_participants").select("last_read_at").eq("conversation_id", conversationId).eq("user_id", peerId).maybeSingle(),
  ]);
  if (profile.error || listing.error || marker.error) throw new ChatDataError("DETAIL_UNAVAILABLE", { cause: profile.error ?? listing.error ?? marker.error });
  const readAt = marker.data?.last_read_at;
  const latest = page.rows.at(-1);
  return {
    id: row.id, peerId, canSend: row.status === "active", hasOlderMessages: page.hasMore,
    peerName: safeDisplayName(profile.data?.display_name, locale), peerAvatarUrl: publicMediaUrl(profile.data?.avatar_path ?? null),
    listingId: row.listing_id, listingTitle: listing.data?.title ?? null,
    lastMessage: latest?.body ?? null, lastMessageAt: latest?.created_at ?? row.last_message_at, unreadCount: null,
    messages: page.rows.map(message => ({ id:message.id, body:message.body, sentAt:message.created_at,
      own:message.sender_id === userId, read:message.sender_id === userId && Boolean(readAt && readAt >= message.created_at) })),
  };
}
export async function sendTextMessage(client: MarketoSupabaseClient, conversationId: string, senderId: string, body: string, messageId: string) {
  const cleanBody = body.trim();
  if (!cleanBody || Array.from(cleanBody).length > 4000 || !UUID.test(messageId)) throw new ChatDataError("MESSAGE_FAILED");
  const { data, error } = await client.rpc("send_listing_message", {
    target_conversation_id: conversationId, client_message_id: messageId, message_body: cleanBody,
  }).abortSignal(AbortSignal.timeout(15000));
  const row = data?.[0];
  if (error || !row || row.sender_id !== senderId) throw new ChatDataError("MESSAGE_FAILED", { cause: error });
  return row;
}
export async function markConversationRead(client: MarketoSupabaseClient, conversationId: string, throughMessageId: string) {
  const { error } = await client.rpc("mark_listing_conversation_read", {
    target_conversation_id: conversationId, through_message_id: throughMessageId,
  }).abortSignal(AbortSignal.timeout(10000));
  if (error) throw new ChatDataError("MESSAGE_FAILED", { cause: error });
}
