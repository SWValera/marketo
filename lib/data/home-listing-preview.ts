import type { ListingSummary } from "@/lib/data/types";

type PreviewFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isListingSummary(value: unknown): value is ListingSummary {
  if (!value || typeof value !== "object") return false;
  const listing = value as Partial<ListingSummary>;
  return typeof listing.id === "string"
    && typeof listing.slug === "string"
    && typeof listing.title === "string"
    && typeof listing.priceLabel === "string"
    && (listing.priceAmount === null || typeof listing.priceAmount === "number")
    && typeof listing.locationLabel === "string"
    && typeof listing.publishedLabel === "string"
    && (listing.imageUrl === null || typeof listing.imageUrl === "string")
    && typeof listing.categorySlug === "string"
    && typeof listing.cityId === "string"
    && typeof listing.promoted === "boolean";
}

export async function fetchHomeListingPreview(
  signal?: AbortSignal,
  fetcher: PreviewFetch = fetch,
): Promise<ListingSummary[]> {
  const response = await fetcher("/api/listings?view=home-preview", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const body = await response.json().catch(() => null) as { items?: unknown } | null;
  if (!response.ok || !Array.isArray(body?.items) || !body.items.every(isListingSummary)) {
    throw new Error("home_listing_preview_failed");
  }
  return body.items;
}
