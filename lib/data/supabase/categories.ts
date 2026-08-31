import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";

const CATEGORY_COLUMNS = "id, parent_id, slug, name_ru, name_kk, icon_key, tone_key, search_placeholder_ru, search_placeholder_kk, title_placeholder_ru, title_placeholder_kk, description_hint_ru, description_hint_kk, price_mode, sort_order" as const;

export async function listCategoryLevel(client: MarketoSupabaseClient, parentId: string | null) {
  let request = client.from("categories").select(CATEGORY_COLUMNS).eq("is_active", true);
  request = parentId ? request.eq("parent_id", parentId) : request.is("parent_id", null);
  const { data, error } = await request.order("sort_order").order("name_ru");
  if (error) throw error;
  return data;
}

export async function listActiveCategories(client: MarketoSupabaseClient) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .eq("is_active", true)
      .order("sort_order")
      .order("name_ru")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
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
    .limit(Math.min(limit, 50));
  if (error) throw error;
  return data;
}
