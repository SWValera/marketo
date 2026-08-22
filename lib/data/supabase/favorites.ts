import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";

export async function listFavoriteListingIds(client: MarketoSupabaseClient, userId: string) {
  const { data, error } = await client.from("favorites").select("listing_id, created_at").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addFavorite(client: MarketoSupabaseClient, userId: string, listingId: string) {
  const { error } = await client.from("favorites").insert({ user_id: userId, listing_id: listingId });
  if (error) throw error;
}

export async function removeFavorite(client: MarketoSupabaseClient, userId: string, listingId: string) {
  const { error } = await client.from("favorites").delete().eq("user_id", userId).eq("listing_id", listingId);
  if (error) throw error;
}
