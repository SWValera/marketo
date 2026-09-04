import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import { normalizePageSize, normalizePositivePage, pageWindow } from "../pagination.ts";
import type { Json, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

export type ListingQuery = {
  categoryIds?: string[];
  settlementId?: string;
  query?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  attributeFilters?: Record<string, string>;
  sort?: "new" | "cheap" | "expensive";
  page?: number;
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

function catalogSearchArguments(filters: ListingQuery) {
  return {
    p_category_ids: filters.categoryIds?.length ? filters.categoryIds : null,
    p_settlement_id: filters.settlementId ?? null,
    p_query: filters.query?.trim() || null,
    p_min_price_minor: filters.minPriceMinor ?? null,
    p_max_price_minor: filters.maxPriceMinor ?? null,
    p_attribute_filters: (filters.attributeFilters ?? {}) as Json,
  };
}

function orderedCatalogRequest(
  client: MarketoSupabaseClient,
  filters: ListingQuery,
  options?: { count: "exact" },
) {
  let request = client.rpc("search_catalog_listing_cards", catalogSearchArguments(filters), options);
  if (filters.sort === "cheap") {
    request = request.order("price_minor", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "expensive") {
    request = request.order("price_minor", { ascending: false, nullsFirst: false });
  } else {
    request = request.order("published_at", { ascending: false });
  }
  return request.order("id", { ascending: false });
}

export async function listPublishedListingCards(client: MarketoSupabaseClient, filters: ListingQuery = {}) {
  const pageSize = normalizePageSize(filters.limit, 24, 60);
  const page = normalizePositivePage(filters.page);
  if (page === 1) {
    const response = await orderedCatalogRequest(client, filters, { count: "exact" }).range(0, pageSize - 1);
    if (response.error) throw response.error;
    if (!Number.isSafeInteger(response.count) || (response.count ?? -1) < 0) {
      throw new Error("catalog_listing_count_unavailable");
    }
    if (!Array.isArray(response.data)) throw new Error("catalog_listing_page_invalid");
    const total = response.count as number;
    const expectedLength = Math.min(pageSize, total);
    if (response.data.length !== expectedLength) throw new Error("catalog_listing_page_inconsistent");
    return {
      items: response.data,
      total,
      page,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      nextPage: total > pageSize ? 2 : null,
      state: total === 0 ? "empty" as const : "ready" as const,
    };
  }
  const countResponse = await client.rpc(
    "search_catalog_listing_cards",
    catalogSearchArguments(filters),
    { count: "exact", head: true },
  );
  if (countResponse.error) throw countResponse.error;
  if (!Number.isSafeInteger(countResponse.count) || (countResponse.count ?? -1) < 0) {
    throw new Error("catalog_listing_count_unavailable");
  }
  const total = countResponse.count as number;
  const window = pageWindow(total, page, pageSize);
  if (window.offset === null || window.rangeEnd === null) {
    return {
      items: [],
      total,
      page,
      totalPages: window.totalPages,
      nextPage: null,
      state: window.outOfRange ? "out_of_range" as const : "empty" as const,
    };
  }
  const { data, error } = await orderedCatalogRequest(client, filters).range(window.offset, window.rangeEnd);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("catalog_listing_page_invalid");
  return {
    items: data,
    total,
    page,
    totalPages: window.totalPages,
    nextPage: page < window.totalPages ? page + 1 : null,
    state: "ready" as const,
  };
}

export async function listPublishedListingPreview(
  client: MarketoSupabaseClient,
  filters: Omit<ListingQuery, "page"> = {},
) {
  const limit = normalizePageSize(filters.limit, 12, 24);
  const { data, error } = await orderedCatalogRequest(client, filters).range(0, limit - 1);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("catalog_listing_preview_invalid");
  return data;
}

type SellerListingCardRow = {
  id: string;
  slug: string;
  title: string;
  price_minor: number | null;
  currency_code: string | null;
  category_id: string;
  settlement_id: string;
  published_at: string;
  promoted_until: string | null;
  categories: { slug: string } | null;
  settlements: { id: string; name_ru: string; name_kk: string } | null;
  listing_images: Array<{ storage_key: string; sort_order: number }>;
};

const MAX_SELLER_LISTINGS_PAGE_SIZE = 60;
const MAX_SELLER_LISTING_PAGE_RETRIES = 1;
const SELLER_LISTING_CARD_COLUMNS =
  "id, slug, title, price_minor, currency_code, category_id, settlement_id, published_at, promoted_until, categories(slug), settlements(id, name_ru, name_kk), listing_images(storage_key, sort_order)";

export type SellerListingsPageInput = number | string | string[] | undefined;

export function resolveSellerListingsPage(value: SellerListingsPageInput) {
  const hasMultipleValues = Array.isArray(value);
  const candidate = hasMultipleValues ? value[0] : value;

  if (candidate === undefined) return { page: 1, isCanonical: !hasMultipleValues };
  if (typeof candidate === "number") {
    const valid = Number.isSafeInteger(candidate) && candidate > 0;
    return { page: valid ? candidate : 1, isCanonical: valid && !hasMultipleValues };
  }
  if (!/^[1-9]\d*$/.test(candidate)) return { page: 1, isCanonical: false };

  const parsed = Number(candidate);
  const valid = Number.isSafeInteger(parsed);
  return {
    page: valid ? parsed : 1,
    isCanonical: valid && parsed !== 1 && !hasMultipleValues,
  };
}

export function normalizeSellerListingsPage(value: SellerListingsPageInput) {
  return resolveSellerListingsPage(value).page;
}

async function countPublishedListingsBySeller(client: MarketoSupabaseClient, sellerId: string) {
  const response = await client
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", sellerId)
    .eq("status", "active")
    .not("published_at", "is", null)
    .is("deleted_at", null);
  if (response.error) throw response.error;
  if (!Number.isSafeInteger(response.count) || (response.count ?? -1) < 0) {
    throw new Error("seller_listing_count_unavailable");
  }
  return response.count as number;
}

function requestPublishedListingsBySeller(
  client: MarketoSupabaseClient,
  sellerId: string,
  offset: number,
  rangeEnd: number,
) {
  return client
    .from("listings")
    .select(SELLER_LISTING_CARD_COLUMNS, { count: "exact" })
    .eq("owner_id", sellerId)
    .eq("status", "active")
    .not("published_at", "is", null)
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .order("sort_order", { referencedTable: "listing_images" })
    .limit(1, { referencedTable: "listing_images" })
    .range(offset, rangeEnd);
}

function sellerListingsTerminalState(total: number, page: number, pageSize: number) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  if (total === 0) {
    return {
      items: [],
      total,
      page,
      totalPages,
      nextPage: null,
      state: page === 1 ? "empty" as const : "out_of_range" as const,
    };
  }
  if (page > totalPages) {
    return { items: [], total, page, totalPages, nextPage: null, state: "out_of_range" as const };
  }
  return null;
}

function isUnsatisfiedSellerListingRange(response: {
  error: { code?: string } | null;
  status: number;
}) {
  return response.status === 416 && response.error?.code === "PGRST103";
}

export async function listPublishedListingCardsBySeller(
  client: MarketoSupabaseClient,
  sellerId: string,
  options: { page?: number; pageSize?: number } = {},
) {
  const requestedPageSize = Math.trunc(options.pageSize ?? 24);
  const pageSize = Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, MAX_SELLER_LISTINGS_PAGE_SIZE)
    : 24;
  const page = normalizeSellerListingsPage(options.page);
  const preflightTotal = await countPublishedListingsBySeller(client, sellerId);
  const preflightTerminalState = sellerListingsTerminalState(preflightTotal, page, pageSize);
  if (preflightTerminalState) return preflightTerminalState;

  const offset = (page - 1) * pageSize;
  const rangeEnd = offset > Number.MAX_SAFE_INTEGER - (pageSize - 1)
    ? Number.MAX_SAFE_INTEGER
    : offset + pageSize - 1;
  let response = await requestPublishedListingsBySeller(client, sellerId, offset, rangeEnd);
  let retryCount = 0;

  while (isUnsatisfiedSellerListingRange(response)) {
    const reconciledTotal = await countPublishedListingsBySeller(client, sellerId);
    const reconciledTerminalState = sellerListingsTerminalState(reconciledTotal, page, pageSize);
    if (reconciledTerminalState) return reconciledTerminalState;
    if (retryCount >= MAX_SELLER_LISTING_PAGE_RETRIES) {
      throw new Error("seller_listing_page_unstable");
    }
    retryCount += 1;
    response = await requestPublishedListingsBySeller(client, sellerId, offset, rangeEnd);
  }

  if (response.error) throw response.error;
  if (!Number.isSafeInteger(response.count) || (response.count ?? -1) < 0) {
    throw new Error("seller_listing_count_unavailable");
  }
  const total = response.count as number;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const terminalState = sellerListingsTerminalState(total, page, pageSize);
  if (terminalState) {
    if (!Array.isArray(response.data) || response.data.length !== 0) {
      throw new Error("seller_listing_page_inconsistent");
    }
    return terminalState;
  }

  const pageLength = Math.min(pageSize, total - offset);
  if (!Array.isArray(response.data) || response.data.length !== pageLength) {
    throw new Error("seller_listing_page_inconsistent");
  }

  const rows = response.data as unknown as SellerListingCardRow[];
  return {
    items: rows.map((row) => {
      if (!row.id || !row.slug || !row.title || !row.category_id || !row.settlement_id || !row.published_at
        || !row.categories?.slug || !Array.isArray(row.listing_images)) {
        throw new Error("seller_listing_row_invalid");
      }
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        price_minor: row.price_minor,
        currency_code: row.currency_code,
        category_id: row.category_id,
        category_slug: row.categories.slug,
        settlement_id: row.settlements?.id ?? row.settlement_id,
        location_name_ru: row.settlements?.name_ru ?? null,
        location_name_kk: row.settlements?.name_kk ?? null,
        published_at: row.published_at,
        promoted: Boolean(row.promoted_until && new Date(row.promoted_until) > new Date()),
        primary_image_storage_key: row.listing_images[0]?.storage_key ?? null,
      };
    }),
    total,
    page,
    totalPages,
    nextPage: page < totalPages ? page + 1 : null,
    state: "ready" as const,
  };
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
    .select("*, categories(id, slug, name_ru, name_kk, search_placeholder_ru, search_placeholder_kk), settlements(id, name_ru, name_kk), listing_images(storage_key, sort_order)")
    .order("sort_order", { referencedTable: "listing_images" })
    .limit(1, { referencedTable: "listing_images" });
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
      ? client.from("category_attributes").select("id, key, label_ru, label_kk, data_type, unit_ru, unit_kk, is_active, is_visible, sort_order").in("id", attributeIds)
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
