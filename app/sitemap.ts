import type { MetadataRoute } from "next";
import { categories, listings } from "@/lib/mock-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://marketo.kz";
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    ...categories.map((category) => ({ url: `${base}/category/${category.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...listings.map((listing) => ({ url: `${base}/listing/${listing.id}-${listing.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
