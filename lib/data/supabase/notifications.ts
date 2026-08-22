import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";

export async function listNotifications(client: MarketoSupabaseClient, userId: string, limit = 40) {
  const { data, error } = await client.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(Math.min(limit, 100));
  if (error) throw error;
  return data;
}

export async function markNotificationRead(client: MarketoSupabaseClient, notificationId: string) {
  const { error } = await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId);
  if (error) throw error;
}
