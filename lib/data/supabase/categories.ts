import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { CategoryPriceMode, CategoryReferenceData } from "@/lib/reference-data/types";

const CATEGORY_COLUMNS = "id, parent_id, slug, name_ru, name_kk, icon_key, tone_key, search_placeholder_ru, search_placeholder_kk, title_placeholder_ru, title_placeholder_kk, description_hint_ru, description_hint_kk, price_mode, sort_order" as const;
const CATEGORY_REFERENCE_PAGE_SIZE = 1000;
const CATEGORY_REFERENCE_PAGE_CONCURRENCY = 2;

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

function isUnsatisfiedPositiveRange(error: unknown, from: number) {
  return from > 0
    && typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "PGRST103";
}

async function collectCategoryReferencePages<Row>(
  loadPage: (from: number, to: number) => Promise<Row[]>,
): Promise<Row[]> {
  const rows: Row[] = [];
  const batchSize = CATEGORY_REFERENCE_PAGE_SIZE * CATEGORY_REFERENCE_PAGE_CONCURRENCY;

  for (let batchStart = 0; ; batchStart += batchSize) {
    const pages = await Promise.all(
      Array.from({ length: CATEGORY_REFERENCE_PAGE_CONCURRENCY }, (_, index) => {
        const from = batchStart + index * CATEGORY_REFERENCE_PAGE_SIZE;
        return loadPage(from, from + CATEGORY_REFERENCE_PAGE_SIZE - 1);
      }),
    );

    const firstIncompletePage = pages.findIndex((page) => page.length < CATEGORY_REFERENCE_PAGE_SIZE);
    if (firstIncompletePage >= 0) {
      const hasRowsAfterGap = pages.slice(firstIncompletePage + 1).some((page) => page.length > 0);
      if (hasRowsAfterGap) throw new Error("category_reference_pagination_inconsistent");
      rows.push(...pages.slice(0, firstIncompletePage + 1).flat());
      return rows;
    }

    rows.push(...pages.flat());
  }
}

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
  return collectCategoryReferencePages(async (from, to) => {
    const { data, error } = await client
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .eq("is_active", true)
      .order("sort_order")
      .order("name_ru")
      .order("id")
      .range(from, to);
    if (error) {
      if (isUnsatisfiedPositiveRange(error, from)) return [];
      throw error;
    }
    return data;
  });
}

async function listActiveCategoryParents(client: MarketoSupabaseClient) {
  return collectCategoryReferencePages(async (from, to) => {
    const { data, error } = await client
      .from("categories")
      .select("id, parent_id")
      .eq("is_active", true)
      .order("id")
      .range(from, to);
    if (error) {
      if (isUnsatisfiedPositiveRange(error, from)) return [];
      throw error;
    }
    return data;
  });
}

/**
 * The Home page needs full root presentation rows and immediate child counts.
 * A compact id/parent hierarchy is loaded beside the roots in the same network
 * wave, avoiding both full leaf presentation payloads and a serial child query.
 */
export async function listHomeCategories(client: MarketoSupabaseClient): Promise<HomeCategoryReferenceRow[]> {
  const [roots, hierarchy] = await Promise.all([
    listCategoryLevel(client, null),
    listActiveCategoryParents(client),
  ]);
  if (roots.length === 0) return [];

  const rootIds = new Set(roots.map((category) => category.id));
  const childCounts = new Map<string, number>();
  for (const category of hierarchy) {
    if (category.parent_id && rootIds.has(category.parent_id)) {
      childCounts.set(category.parent_id, (childCounts.get(category.parent_id) ?? 0) + 1);
    }
  }
  return roots.map((category) => ({
    ...category,
    child_count: childCounts.get(category.id) ?? 0,
  }));
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
