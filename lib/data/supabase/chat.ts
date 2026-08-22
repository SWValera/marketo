import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";

export async function getOrCreateListingConversation(client: MarketoSupabaseClient, listingId: string) {
  const { data, error } = await client.rpc("get_or_create_listing_conversation", { target_listing_id: listingId });
  if (error) throw error;
  return data;
}

export async function listUserConversations(client: MarketoSupabaseClient) {
  const { data, error } = await client.from("conversations").select("*, conversation_participants(*), listings(id, title, slug)").order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function listConversationMessages(client: MarketoSupabaseClient, conversationId: string, limit = 50) {
  const { data, error } = await client.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(Math.min(limit, 100));
  if (error) throw error;
  return data;
}

export async function sendTextMessage(client: MarketoSupabaseClient, conversationId: string, senderId: string, body: string) {
  const { data, error } = await client.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    body: body.trim(),
    message_type: "text",
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function markConversationRead(client: MarketoSupabaseClient, conversationId: string, userId: string) {
  const { error } = await client.from("conversation_participants").update({
    last_read_at: new Date().toISOString(),
  }).eq("conversation_id", conversationId).eq("user_id", userId);
  if (error) throw error;
}
