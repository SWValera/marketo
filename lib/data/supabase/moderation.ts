import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";

export async function listModerationQueue(client: MarketoSupabaseClient, limit = 40) {
  const { data, error } = await client.from("listings").select("id, title, status, owner_id, category_id, settlement_id, created_at").eq("status", "pending").order("created_at").limit(Math.min(limit, 100));
  if (error) throw error;
  return data;
}

export async function moderateListing(client: MarketoSupabaseClient, listingId: string, decision: "approve" | "reject" | "hide" | "restore", reasonCode?: string, note?: string) {
  const { error } = await client.rpc("moderate_listing", {
    target_listing_id: listingId,
    decision,
    reason_code: reasonCode ?? null,
    note: note ?? null,
  });
  if (error) throw error;
}

export async function createReport(
  client: MarketoSupabaseClient,
  input: { reporterId: string; listingId?: string; reportedUserId?: string; reasonCode: string; details?: string },
) {
  const { data, error } = await client.from("reports").insert({
    reporter_id: input.reporterId,
    listing_id: input.listingId ?? null,
    reported_user_id: input.reportedUserId ?? null,
    reason_code: input.reasonCode,
    details: input.details ?? null,
  }).select("*").single();
  if (error) throw error;
  return data;
}
