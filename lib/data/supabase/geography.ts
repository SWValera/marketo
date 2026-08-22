import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";

export async function listActiveCountries(client: MarketoSupabaseClient) {
  const { data, error } = await client
    .from("countries")
    .select("id, code, slug, name_ru, name_kk, currency_code, currency_symbol, currency_exponent, phone_code, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("code");
  if (error) throw error;
  return data;
}

export async function listActiveRegions(client: MarketoSupabaseClient, countryId?: string) {
  let request = client
    .from("regions")
    .select("id, country_id, code, slug, name_ru, name_kk, kind, sort_order")
    .eq("is_active", true);
  if (countryId) request = request.eq("country_id", countryId);
  const { data, error } = await request.order("sort_order").order("name_ru");
  if (error) throw error;
  return data;
}

export async function listSelectableSettlements(client: MarketoSupabaseClient) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("settlements")
      .select("id, region_id, parent_id, kato_code, slug, name_ru, name_kk, kind, sort_order")
      .eq("is_active", true)
      .eq("is_selectable", true)
      .order("sort_order")
      .order("name_ru")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export async function searchSelectableSettlements(client: MarketoSupabaseClient, query: string, regionId?: string, limit = 30) {
  let request = client
    .from("settlements")
    .select("id, region_id, parent_id, kato_code, slug, name_ru, name_kk, kind, sort_order")
    .eq("is_active", true)
    .eq("is_selectable", true)
    .limit(Math.min(limit, 50));
  if (regionId) request = request.eq("region_id", regionId);
  const normalized = query.normalize("NFKC").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  if (normalized) request = request.or(`name_ru.ilike.%${normalized}%,name_kk.ilike.%${normalized}%`);
  const { data, error } = await request.order("sort_order").order("name_ru");
  if (error) throw error;
  return data;
}
