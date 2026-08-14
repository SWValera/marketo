import type { MetadataRoute } from "next";
import { categoryOptions } from "@/lib/catalog-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://marketo.kz";
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.9 },
    ...categoryOptions.map((category) => ({ url: `${base}/category/${category.slug}`, changeFrequency: "daily" as const, priority: category.depth === 0 ? 0.8 : 0.7 })),
  ];
}
