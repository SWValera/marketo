import type { MetadataRoute } from "next";
import { createCategoryCatalogView, getCategoryDepth } from "@/lib/reference-data/catalog";
import { getCategoryReferences } from "@/lib/reference-data/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://marketo.kz";
  const catalog = await getCategoryReferences();
  const view = createCategoryCatalogView(catalog.data);
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.9 },
    ...view.items.map((category) => ({ url: `${base}/category/${category.slug}`, changeFrequency: "daily" as const, priority: getCategoryDepth(view, category) === 0 ? 0.8 : 0.7 })),
  ];
}
