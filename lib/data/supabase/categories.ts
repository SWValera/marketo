import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { CategoryPriceMode, CategoryReferenceData } from "@/lib/reference-data/types";

const CATEGORY_COLUMNS = "id, parent_id, slug, name_ru, name_kk, icon_key, tone_key, search_placeholder_ru, search_placeholder_kk, title_placeholder_ru, title_placeholder_kk, description_hint_ru, description_hint_kk, price_mode, sort_order" as const;

type CategoryReferenceRow = Pick<
  Database["public"]["Tables"]["categories"]["Row"],
  | "id"
  | "parent_id"
  | "slug"
  | "name_ru"
  | "name_kk"
  | "icon_key"
  | "tone_key"
  | "search_placeholder_ru"
  | "search_placeholder_kk"
  | "title_placeholder_ru"
  | "title_placeholder_kk"
  | "description_hint_ru"
  | "description_hint_kk"
  | "price_mode"
  | "sort_order"
>;

export type HomeCategoryReferenceRow = CategoryReferenceRow & { child_count: number };

export function mapCategoryReferenceRows(rows: readonly CategoryReferenceRow[]): CategoryReferenceData {
  return {
    categories: rows.map((category) => ({
      id: category.id,
      parentId: category.parent_id,
      slug: category.slug,
      name: { ru: category.name_ru, kk: category.name_kk },
      icon: category.icon_key,
      tone: category.tone_key,
      searchPlaceholder: category.search_placeholder_ru && category.search_placeholder_kk
        ? { ru: category.search_placeholder_ru, kk: category.search_placeholder_kk }
        : null,
      titlePlaceholder: category.title_placeholder_ru && category.title_placeholder_kk
        ? { ru: category.title_placeholder_ru, kk: category.title_placeholder_kk }
        : null,
      descriptionHint: category.description_hint_ru && category.description_hint_kk
        ? { ru: category.description_hint_ru, kk: category.description_hint_kk }
        : null,
      priceMode: category.price_mode as CategoryPriceMode,
      sortOrder: category.sort_order,
    })),
  };
}

export async function listCategoryLevel(client: MarketoSupabaseClient, parentId: string | null) {
  let request = client.from("categories").select(CATEGORY_COLUMNS).eq("is_active", true);
  request = parentId ? request.eq("parent_id", parentId) : request.is("parent_id", null);
  const { data, error } = await request.order("sort_order").order("name_ru").order("id");
  if (error) throw error;
  return data;
}

export async function listActiveCategories(client: MarketoSupabaseClient) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .eq("is_active", true)
      .order("sort_order")
      .order("name_ru")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

/**
 * The Home page needs root tiles and only their immediate child counts. Loading
 * every leaf adds more than a thousand irrelevant rows to its cold path.
 */
export async function listHomeCategories(client: MarketoSupabaseClient): Promise<HomeCategoryReferenceRow[]> {
  const roots = await listCategoryLevel(client, null);
  if (roots.length === 0) return [];

  const children: Array<{ id: string; parent_id: string | null }> = [];
  const pageSize = 1000;
  const rootIds = roots.map((category) => category.id);
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("categories")
      .select("id, parent_id")
      .eq("is_active", true)
      .in("parent_id", rootIds)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    children.push(...data);
    if (data.length < pageSize) {
      const childCounts = new Map<string, number>();
      for (const child of children) {
        if (child.parent_id) childCounts.set(child.parent_id, (childCounts.get(child.parent_id) ?? 0) + 1);
      }
      return roots.map((category) => ({
        ...category,
        child_count: childCounts.get(category.id) ?? 0,
      }));
    }
  }
}

export async function getCategoryAttributes(client: MarketoSupabaseClient, categoryId: string) {
  const { data, error } = await client
    .from("category_attributes")
    .select("id, category_id, key, label_ru, label_kk, data_type, unit_ru, unit_kk, is_required, is_filterable, is_searchable, inherits_to_children, validation, filter_mode, options_load_mode, depends_on_key, is_visible, sort_order")
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .eq("is_visible", true)
    .order("sort_order");
  if (error) throw error;
  return data;
}

export async function listAttributeOptions(
  client: MarketoSupabaseClient,
  attributeIds: string[],
  filters: { parentOptionId?: string; query?: string; limit?: number } = {},
) {
  if (attributeIds.length === 0) return [];
  const rows = [];
  const pageSize = Math.min(Math.max(filters.limit ?? 500, 1), 500);
  for (let from = 0; ; from += pageSize) {
    let request = client
      .from("category_attribute_options")
      .select("id, attribute_id, parent_option_id, value, label_ru, label_kk, sort_order")
      .in("attribute_id", attributeIds)
      .eq("is_active", true);
    if (filters.parentOptionId) {
      request = request.or(`parent_option_id.eq.${filters.parentOptionId},parent_option_id.is.null`);
    } else {
      request = request.is("parent_option_id", null);
    }
    const safeQuery = filters.query?.normalize("NFKC").replace(/[^\p{L}\p{N}\s().+-]/gu, " ").replace(/\s+/g, " ").trim();
    if (safeQuery) request = request.or(`label_ru.ilike.%${safeQuery}%,label_kk.ilike.%${safeQuery}%`);
    const { data, error } = await request
      .order("sort_order")
      .order("label_ru")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (filters.limit && rows.length >= filters.limit) return rows.slice(0, filters.limit);
    if (data.length < pageSize) return rows;
  }
}

export async function searchCategories(client: MarketoSupabaseClient, query: string, limit = 40) {
  const safeQuery = query.normalize("NFKC").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!safeQuery) return [];
  const { data, error } = await client
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("is_active", true)
    .or(`name_ru.ilike.%${safeQuery}%,name_kk.ilike.%${safeQuery}%`)
    .order("sort_order")
    .order("name_ru")
    .order("id")
    .limit(Math.min(limit, 50));
  if (error) throw error;
  return data;
}
