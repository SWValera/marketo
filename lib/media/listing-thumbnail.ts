/** One bounded variant of the existing authenticated media delivery route. */
export const listingThumbnail = { variant: "card", width: 768, height: 576, quality: 78 } as const;

export function listingThumbnailUrl(url: string | null): string | null {
  if (!url) return null;
  if (!url.startsWith("/api/media/listings/")) return url;
  const parsed = new URL(url, "https://media.invalid");
  parsed.searchParams.set("variant", listingThumbnail.variant);
  return parsed.pathname + parsed.search;
}


export const listingDetailImage = { variant: "detail", width: 1024, height: 1024, quality: 80 } as const;

export function listingDetailImageUrl(url: string): string {
  if (!url.startsWith("/api/media/listings/")) return url;
  const parsed = new URL(url, "https://media.invalid");
  parsed.searchParams.set("variant", listingDetailImage.variant);
  return parsed.pathname + parsed.search;
}
