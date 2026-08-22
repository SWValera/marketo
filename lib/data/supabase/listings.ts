import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

export type ListingCursor = { publishedAt: string; id: string };
export type ListingQuery = {
  categoryIds?: string[];
  settlementId?: string;
  query?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  cursor?: ListingCursor;
  limit?: number;
};

export type ListingDraftInput = Pick<
  TablesInsert<"listings">,
  "owner_id" | "category_id" | "settlement_id" | "slug" | "title" | "description" | "price_minor" | "currency_code"
>;

export type ListingDraftPatch = Pick<
  TablesUpdate<"listings">,
  "category_id" | "settlement_id" | "slug" | "title" | "description" | "price_minor" | "currency_code"
>;

export async function listPublishedListingCards(client: MarketoSupabaseClient, filters: ListingQuery = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 60);
  let request = client.from("catalog_listing_cards").select("*");
  if (filters.categoryIds?.length) request = request.in("category_id", filters.categoryIds);
  if (filters.settlementId) request = request.eq("settlement_id", filters.settlementId);
  if (filters.query?.trim()) request = request.ilike("title", `%${filters.query.trim()}%`);
  if (filters.minPriceMinor !== undefined) request = request.gte("price_minor", filters.minPriceMinor);
  if (filters.maxPriceMinor !== undefined) request = request.lte("price_minor", filters.maxPriceMinor);
  if (filters.cursor) {
    request = request.or(
      `published_at.lt.${filters.cursor.publishedAt},and(published_at.eq.${filters.cursor.publishedAt},id.lt.${filters.cursor.id})`,
    );
  }
  const { data, error } = await request.order("published_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (error) throw error;
  return { items: data.slice(0, limit), hasMore: data.length > limit };
}

export async function getListingDetail(client: MarketoSupabaseClient, listingId: string) {
  const { data, error } = await client
    .from("listings")
    .select("*, categories(*), settlements(*), listing_images(*), listing_attribute_values(*), listing_attribute_option_values(*)")
    .eq("id", listingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getListingDetailByRouteKey(client: MarketoSupabaseClient, routeKey: string) {
  const uuidPrefix = routeKey.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:-|$)/i)?.[0].slice(0, 36);
  let request = client
    .from("listings")
    .select("*, categories(*), settlements(*), listing_images(*), listing_attribute_values(*), listing_attribute_option_values(*)");
  request = uuidPrefix ? request.eq("id", uuidPrefix) : request.eq("slug", routeKey);
  const { data, error } = await request.maybeSingle();
  if (error) throw error;
  return data;
}

export async function createListingDraft(client: MarketoSupabaseClient, input: ListingDraftInput) {
  const { data, error } = await client.from("listings").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateListingDraft(client: MarketoSupabaseClient, listingId: string, patch: ListingDraftPatch) {
  const { data, error } = await client.from("listings").update(patch).eq("id", listingId).select("*").single();
  if (error) throw error;
  return data;
}

export async function saveListingContact(client: MarketoSupabaseClient, contact: TablesInsert<"listing_contacts">) {
  const { data, error } = await client.from("listing_contacts").upsert(contact, { onConflict: "listing_id" }).select("*").single();
  if (error) throw error;
  return data;
}

/** Server route only: call after R2 confirms the object and media metadata. */
export async function addVerifiedListingImageMetadata(client: MarketoSupabaseClient, image: TablesInsert<"listing_images">) {
  const { data, error } = await client.from("listing_images").insert(image).select("*").single();
  if (error) throw error;
  return data;
}

export async function upsertListingScalarAttribute(client: MarketoSupabaseClient, value: TablesInsert<"listing_attribute_values">) {
  const { data, error } = await client.from("listing_attribute_values").upsert(value, { onConflict: "listing_id,attribute_id" }).select("*").single();
  if (error) throw error;
  return data;
}

export async function submitListing(client: MarketoSupabaseClient, listingId: string) {
  const { error } = await client.rpc("submit_listing", { target_listing_id: listingId });
  if (error) throw error;
}

export async function archiveOwnListing(client: MarketoSupabaseClient, listingId: string) {
  const { error } = await client.rpc("archive_own_listing", { target_listing_id: listingId });
  if (error) throw error;
}

export async function markOwnListingSold(client: MarketoSupabaseClient, listingId: string) {
  const { error } = await client.rpc("mark_own_listing_sold", { target_listing_id: listingId });
  if (error) throw error;
}
