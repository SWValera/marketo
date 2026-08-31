import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import type { Json, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

export type ListingCursor = { publishedAt: string; id: string };
export type ListingQuery = {
  categoryIds?: string[];
  settlementId?: string;
  query?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  attributeFilters?: Record<string, string | boolean>;
  sort?: "new" | "cheap" | "expensive";
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
  let request = client.rpc("search_catalog_listing_cards", {
    p_category_ids: filters.categoryIds?.length ? filters.categoryIds : null,
    p_settlement_id: filters.settlementId ?? null,
    p_query: filters.query?.trim() || null,
    p_min_price_minor: filters.minPriceMinor ?? null,
    p_max_price_minor: filters.maxPriceMinor ?? null,
    p_attribute_filters: (filters.attributeFilters ?? {}) as Json,
  });
  if (filters.cursor && (filters.sort ?? "new") === "new") {
    request = request.or(
      `published_at.lt.${filters.cursor.publishedAt},and(published_at.eq.${filters.cursor.publishedAt},id.lt.${filters.cursor.id})`,
    );
  }
  if (filters.sort === "cheap") {
    request = request.order("price_minor", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "expensive") {
    request = request.order("price_minor", { ascending: false, nullsFirst: false });
  } else {
    request = request.order("published_at", { ascending: false });
  }
  const { data, error } = await request.order("id", { ascending: false }).limit(limit + 1);
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

export async function getListingAttributeRecords(client: MarketoSupabaseClient, listingIds: string[]) {
  if (listingIds.length === 0) return { scalarValues: [], optionValues: [], attributes: [], options: [] };
  const [scalarResult, optionResult] = await Promise.all([
    client.from("listing_attribute_values").select("listing_id, attribute_id, text_value, number_value, boolean_value, date_value, number_min_value, number_max_value").in("listing_id", listingIds),
    client.from("listing_attribute_option_values").select("listing_id, attribute_id, option_id").in("listing_id", listingIds),
  ]);
  if (scalarResult.error) throw scalarResult.error;
  if (optionResult.error) throw optionResult.error;
  const attributeIds = [...new Set([...scalarResult.data, ...optionResult.data].map((row) => row.attribute_id))];
  const optionIds = [...new Set(optionResult.data.map((row) => row.option_id))];
  const [attributeResult, optionsResult] = await Promise.all([
    attributeIds.length
      ? client.from("category_attributes").select("id, key, label_ru, label_kk, data_type, unit_ru, unit_kk, sort_order").in("id", attributeIds)
      : Promise.resolve({ data: [], error: null }),
    optionIds.length
      ? client.from("category_attribute_options").select("id, value, label_ru, label_kk").in("id", optionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (attributeResult.error) throw attributeResult.error;
  if (optionsResult.error) throw optionsResult.error;
  return {
    scalarValues: scalarResult.data,
    optionValues: optionResult.data,
    attributes: attributeResult.data,
    options: optionsResult.data,
  };
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
