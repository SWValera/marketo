import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { GeographyReferenceData } from "@/lib/reference-data/types";

type CountryReferenceRow = Pick<
  Database["public"]["Tables"]["countries"]["Row"],
  "id" | "code" | "slug" | "name_ru" | "name_kk" | "currency_code" | "currency_symbol" | "currency_exponent" | "phone_code" | "sort_order"
>;
type RegionReferenceRow = Pick<
  Database["public"]["Tables"]["regions"]["Row"],
  "id" | "country_id" | "code" | "slug" | "name_ru" | "name_kk" | "kind" | "sort_order"
>;
type SettlementReferenceRow = Pick<
  Database["public"]["Tables"]["settlements"]["Row"],
  "id" | "region_id" | "parent_id" | "kato_code" | "slug" | "name_ru" | "name_kk" | "kind" | "sort_order"
>;

export function mapGeographyReferenceRows(
  countries: readonly CountryReferenceRow[],
  regions: readonly RegionReferenceRow[],
  settlements: readonly SettlementReferenceRow[],
): GeographyReferenceData {
  return {
    countries: countries.map((country) => ({
      id: country.id,
      code: country.code,
      slug: country.slug,
      name: { ru: country.name_ru, kk: country.name_kk },
      currencyCode: country.currency_code,
      currencySymbol: country.currency_symbol,
      currencyExponent: country.currency_exponent,
      phoneCode: country.phone_code,
      sortOrder: country.sort_order,
    })),
    regions: regions.map((region) => ({
      id: region.id,
      countryId: region.country_id,
      code: region.code,
      slug: region.slug,
      name: { ru: region.name_ru, kk: region.name_kk },
      kind: region.kind as GeographyReferenceData["regions"][number]["kind"],
      sortOrder: region.sort_order,
    })),
    settlements: settlements.map((settlement) => ({
      id: settlement.id,
      regionId: settlement.region_id,
      parentId: settlement.parent_id,
      katoCode: settlement.kato_code,
      slug: settlement.slug,
      name: { ru: settlement.name_ru, kk: settlement.name_kk },
      kind: settlement.kind as GeographyReferenceData["settlements"][number]["kind"],
      sortOrder: settlement.sort_order,
    })),
  };
}

export async function listActiveCountries(client: MarketoSupabaseClient) {
  const { data, error } = await client
    .from("countries")
    .select("id, code, slug, name_ru, name_kk, currency_code, currency_symbol, currency_exponent, phone_code, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("code")
    .order("id");
  if (error) throw error;
  return data;
}

export async function listActiveRegions(client: MarketoSupabaseClient, countryId?: string) {
  let request = client
    .from("regions")
    .select("id, country_id, code, slug, name_ru, name_kk, kind, sort_order")
    .eq("is_active", true);
  if (countryId) request = request.eq("country_id", countryId);
  const { data, error } = await request.order("sort_order").order("name_ru").order("id");
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
      .order("id")
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
  const { data, error } = await request.order("sort_order").order("name_ru").order("id");
  if (error) throw error;
  return data;
}
