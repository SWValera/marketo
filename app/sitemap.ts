import type { MetadataRoute } from "next";
import { createCategoryCatalogView, getCategoryDepth } from "@/lib/reference-data/catalog";
import { getCategoryReferences } from "@/lib/reference-data/server";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

const MAX_SITEMAP_URLS = 50_000;
const LISTING_PAGE_SIZE = 1_000;

async function getListingEntries(base: string, availableUrls: number): Promise<MetadataRoute.Sitemap> {
  const client = createSupabasePublicServerClient();
  const countResult = await client
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if (countResult.error || countResult.count === null) {
    throw countResult.error ?? new Error("Published listing count is unavailable for sitemap generation.");
  }
  if (countResult.count > availableUrls) {
    throw new Error("Published listing count exceeds the single-sitemap capacity; partitioning is required.");
  }

  const entries: MetadataRoute.Sitemap = [];
  for (let from = 0; from < countResult.count; from += LISTING_PAGE_SIZE) {
    const { data, error } = await client
      .from("listings")
      .select("id, slug, updated_at")
      .eq("status", "active")
      .order("id")
      .range(from, Math.min(from + LISTING_PAGE_SIZE - 1, countResult.count - 1));
    if (error) throw error;
    if (data.length !== Math.min(LISTING_PAGE_SIZE, countResult.count - from)) {
      throw new Error("Published listing rows changed while the sitemap was generated.");
    }
    entries.push(...data.map((listing) => ({
      url: `${base}/listing/${listing.id}-${listing.slug}`,
      lastModified: listing.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })));
  }
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://marketo.kz";
  const catalog = await getCategoryReferences();
  if (catalog.status !== "ready") throw new Error("Category references are unavailable for sitemap generation.");
  const view = createCategoryCatalogView(catalog.data);
  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.9 },
    ...view.items.map((category) => ({ url: `${base}/category/${category.slug}`, changeFrequency: "daily" as const, priority: getCategoryDepth(view, category) === 0 ? 0.8 : 0.7 })),
  ];
  const listingEntries = await getListingEntries(base, MAX_SITEMAP_URLS - staticEntries.length);
  return [...staticEntries, ...listingEntries];
}
