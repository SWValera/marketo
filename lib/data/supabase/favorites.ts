import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import type { ListingSummary, PageResult } from "@/lib/data/types";
import { normalizePageSize, normalizePositivePage, pageWindow } from "@/lib/data/pagination";
import { localeTag } from "@/lib/i18n/config";
import type { Locale } from "@/lib/i18n/messages";
import { publicMediaUrl } from "@/lib/media/public-url";

const MAX_FAVORITES_PAGE_SIZE = 50;

export class FavoriteDataError extends Error {
  constructor(
    public readonly code: "AUTHENTICATION_REQUIRED" | "LIST_UNAVAILABLE" | "MUTATION_FAILED",
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = "FavoriteDataError";
  }
}

function singleRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}

function safeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function priceLabel(value: unknown, currencyCode: string, locale: Locale) {
  const price = safeNumber(value);
  if (price === null) return locale === "kk" ? "Келісімді" : "Договорная";
  const exponent = currencyCode === "KZT" ? 0 : 2;
  const amount = price / (10 ** exponent);
  const symbol = currencyCode === "KZT" ? "₸" : currencyCode;
  return `${amount.toLocaleString(localeTag(locale), { maximumFractionDigits: exponent })} ${symbol}`;
}

function dateLabel(value: string | null, locale: Locale) {
  if (!value) return "";
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

type FavoriteListingRow = {
  id: string;
  slug: string;
  title: string;
  price_minor: number | string | null;
  currency_code: string;
  published_at: string | null;
  promoted_until: string | null;
  categories: unknown;
  settlements: unknown;
  listing_images: unknown;
};

export async function listFavoriteListingIds(client: MarketoSupabaseClient, userId: string) {
  const { data, error } = await client.from("favorites").select("listing_id, created_at").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listFavoriteListings(
  client: MarketoSupabaseClient,
  userId: string,
  options: { page?: number; pageSize?: number; locale?: Locale } = {},
): Promise<PageResult<ListingSummary>> {
  const page = normalizePositivePage(options.page);
  const pageSize = normalizePageSize(options.pageSize, 24, MAX_FAVORITES_PAGE_SIZE);
  const locale = options.locale ?? "ru";
  const countResult = await client
    .from("favorites")
    .select("listing_id, listings!inner(id)", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countResult.error || countResult.count === null) {
    throw new FavoriteDataError("LIST_UNAVAILABLE", { cause: countResult.error });
  }
  const window = pageWindow(countResult.count, page, pageSize);
  if (window.offset === null || window.rangeEnd === null) {
    return { items: [], total: countResult.count, nextCursor: null };
  }
  const offset = window.offset;
  const favoritesResult = await client
    .from("favorites")
    .select("listing_id, created_at, listings!inner(id)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("listing_id", { ascending: false })
    .range(offset, window.rangeEnd);
  if (favoritesResult.error) throw new FavoriteDataError("LIST_UNAVAILABLE", { cause: favoritesResult.error });
  const listingIds = (favoritesResult.data ?? []).map((row) => row.listing_id);
  if (listingIds.length === 0) return { items: [], total: countResult.count, nextCursor: null };

  const listingsResult = await client
    .from("listings")
    .select("id, slug, title, price_minor, currency_code, published_at, promoted_until, categories(slug), settlements(id, name_ru, name_kk), listing_images(storage_key, sort_order)")
    .in("id", listingIds)
    .eq("status", "active")
    .is("deleted_at", null);
  if (listingsResult.error) throw new FavoriteDataError("LIST_UNAVAILABLE", { cause: listingsResult.error });
  const rowsById = new Map(
    ((listingsResult.data ?? []) as unknown as FavoriteListingRow[]).map((row) => [row.id, row]),
  );
  const items = listingIds.flatMap((id) => {
    const row = rowsById.get(id);
    if (!row) return [];
    const category = singleRelation<{ slug?: string }>(row.categories);
    const settlement = singleRelation<{ id?: string; name_ru?: string | null; name_kk?: string | null }>(row.settlements);
    const images = (Array.isArray(row.listing_images) ? row.listing_images : []) as Array<{ storage_key: string; sort_order: number }>;
    if (!category?.slug || !settlement?.id) return [];
    images.sort((left, right) => left.sort_order - right.sort_order);
    const numericPrice = safeNumber(row.price_minor);
    return [{
      id: row.id,
      slug: row.slug,
      title: row.title,
      priceLabel: priceLabel(row.price_minor, row.currency_code, locale),
      priceAmount: numericPrice === null ? null : numericPrice / (row.currency_code === "KZT" ? 1 : 100),
      locationLabel: locale === "kk"
        ? settlement.name_kk ?? settlement.name_ru ?? ""
        : settlement.name_ru ?? settlement.name_kk ?? "",
      publishedLabel: dateLabel(row.published_at, locale),
      imageUrl: publicMediaUrl(images[0]?.storage_key ?? null),
      categorySlug: category.slug,
      cityId: settlement.id,
      promoted: Boolean(row.promoted_until && new Date(row.promoted_until) > new Date()),
    } satisfies ListingSummary];
  });

  return {
    items,
    total: countResult.count,
    nextCursor: offset + listingIds.length < countResult.count ? String(page + 1) : null,
  };
}

export async function addFavorite(client: MarketoSupabaseClient, userId: string, listingId: string) {
  const { error } = await client.from("favorites").upsert(
    { user_id: userId, listing_id: listingId },
    { onConflict: "user_id,listing_id", ignoreDuplicates: true },
  );
  if (error) throw new FavoriteDataError("MUTATION_FAILED", { cause: error });
}

export async function removeFavorite(client: MarketoSupabaseClient, userId: string, listingId: string) {
  const { error } = await client.from("favorites").delete().eq("user_id", userId).eq("listing_id", listingId);
  if (error) throw new FavoriteDataError("MUTATION_FAILED", { cause: error });
}
