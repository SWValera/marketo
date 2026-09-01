import {
  getCategoryAttributes,
  listActiveCategories,
  listActiveCountries,
  listActiveRegions,
  listAttributeOptions,
  listSelectableSettlements,
} from "@/lib/data/supabase";
import {
  EMPTY_CATEGORIES,
  EMPTY_GEOGRAPHY,
  emptyCategoryAttributes,
  type CategoryAttributeDataType,
  type CategoryAttributeReferenceData,
  type CategoryReferenceData,
  type GeographyReferenceData,
  type ReferenceCategoryAttribute,
  type ReferenceAttributeOption,
  type ReferenceDataEnvelope,
} from "@/lib/reference-data/types";
import { mapCategoryReferenceRows } from "@/lib/data/supabase/categories";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import { tryGetServerSupabasePublicConfig } from "@/lib/supabase/server-env";

const REFERENCE_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = {
  expiresAt: number;
  value: ReferenceDataEnvelope<T>;
};

let geographyCache: CacheEntry<GeographyReferenceData> | undefined;
let categoryCache: CacheEntry<CategoryReferenceData> | undefined;
const attributeCache = new Map<string, CacheEntry<CategoryAttributeReferenceData>>();
const optionCache = new Map<string, CacheEntry<ReferenceAttributeOption[]>>();

function unavailable<T>(data: T): ReferenceDataEnvelope<T> {
  return { status: "unconfigured", data, reason: "missing_configuration" };
}

function failed<T>(data: T): ReferenceDataEnvelope<T> {
  return { status: "error", data, reason: "query_failed" };
}

function ready<T>(data: T): ReferenceDataEnvelope<T> {
  return { status: "ready", data };
}

function cacheIsFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return Boolean(entry && entry.expiresAt > Date.now());
}

export async function getGeographyReferences(): Promise<ReferenceDataEnvelope<GeographyReferenceData>> {
  if (cacheIsFresh(geographyCache)) return geographyCache.value;
  if (!tryGetServerSupabasePublicConfig()) return unavailable(EMPTY_GEOGRAPHY);

  try {
    const client = createSupabasePublicServerClient();
    const [countries, regions, settlements] = await Promise.all([
      listActiveCountries(client),
      listActiveRegions(client),
      listSelectableSettlements(client),
    ]);
    const value = ready<GeographyReferenceData>({
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
    });
    geographyCache = { expiresAt: Date.now() + REFERENCE_CACHE_TTL_MS, value };
    return value;
  } catch {
    return failed(EMPTY_GEOGRAPHY);
  }
}

export async function getCategoryReferences(): Promise<ReferenceDataEnvelope<CategoryReferenceData>> {
  if (cacheIsFresh(categoryCache)) return categoryCache.value;
  if (!tryGetServerSupabasePublicConfig()) return unavailable(EMPTY_CATEGORIES);

  try {
    const rows = await listActiveCategories(createSupabasePublicServerClient());
    const value = ready<CategoryReferenceData>(mapCategoryReferenceRows(rows));
    categoryCache = { expiresAt: Date.now() + REFERENCE_CACHE_TTL_MS, value };
    return value;
  } catch {
    return failed(EMPTY_CATEGORIES);
  }
}

export async function getCategoryAttributeReferences(
  categoryId: string,
): Promise<ReferenceDataEnvelope<CategoryAttributeReferenceData>> {
  const cached = attributeCache.get(categoryId);
  if (cacheIsFresh(cached)) return cached.value;
  if (!tryGetServerSupabasePublicConfig()) return unavailable(emptyCategoryAttributes(categoryId));

  try {
    const client = createSupabasePublicServerClient();
    const attributes = await getCategoryAttributes(client, categoryId);
    const options = await listAttributeOptions(
      client,
      attributes.filter((attribute) => attribute.options_load_mode === "eager").map((attribute) => attribute.id),
    );
    const optionsByAttribute = new Map<string, ReferenceCategoryAttribute["options"]>();
    for (const option of options) {
      const current = optionsByAttribute.get(option.attribute_id) ?? [];
      current.push({
        id: option.id,
        attributeId: option.attribute_id,
        parentOptionId: option.parent_option_id,
        value: option.value,
        label: { ru: option.label_ru, kk: option.label_kk },
        sortOrder: option.sort_order,
      });
      optionsByAttribute.set(option.attribute_id, current);
    }

    const value = ready<CategoryAttributeReferenceData>({
      categoryId,
      attributes: attributes.map((attribute) => ({
        id: attribute.id,
        categoryId: attribute.category_id,
        key: attribute.key,
        label: { ru: attribute.label_ru, kk: attribute.label_kk },
        dataType: attribute.data_type as CategoryAttributeDataType,
        unit: attribute.unit_ru && attribute.unit_kk ? { ru: attribute.unit_ru, kk: attribute.unit_kk } : null,
        required: attribute.is_required,
        filterable: attribute.is_filterable,
        searchable: attribute.is_searchable,
        inheritsToChildren: attribute.inherits_to_children,
        validation: attribute.validation,
        filterMode: attribute.filter_mode as ReferenceCategoryAttribute["filterMode"],
        optionsLoadMode: attribute.options_load_mode as ReferenceCategoryAttribute["optionsLoadMode"],
        dependsOnKey: attribute.depends_on_key,
        visible: attribute.is_visible,
        sortOrder: attribute.sort_order,
        options: (optionsByAttribute.get(attribute.id) ?? []).sort((left, right) => left.sortOrder - right.sortOrder),
      })),
    });
    attributeCache.set(categoryId, { expiresAt: Date.now() + REFERENCE_CACHE_TTL_MS, value });
    return value;
  } catch {
    return failed(emptyCategoryAttributes(categoryId));
  }
}

export async function getCategoryAttributeOptionReferences(
  attributeId: string,
  parentOptionId?: string,
  query = "",
): Promise<ReferenceDataEnvelope<ReferenceAttributeOption[]>> {
  const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase("ru");
  const cacheKey = `${attributeId}:${parentOptionId ?? "root"}:${normalizedQuery}`;
  const cached = optionCache.get(cacheKey);
  if (cacheIsFresh(cached)) return cached.value;
  if (!tryGetServerSupabasePublicConfig()) return unavailable([]);

  try {
    const rows = await listAttributeOptions(createSupabasePublicServerClient(), [attributeId], {
      parentOptionId,
      query: normalizedQuery,
      limit: 300,
    });
    const value = ready<ReferenceAttributeOption[]>(rows.map((option) => ({
      id: option.id,
      attributeId: option.attribute_id,
      parentOptionId: option.parent_option_id,
      value: option.value,
      label: { ru: option.label_ru, kk: option.label_kk },
      sortOrder: option.sort_order,
    })));
    optionCache.set(cacheKey, { expiresAt: Date.now() + REFERENCE_CACHE_TTL_MS, value });
    return value;
  } catch {
    return failed([]);
  }
}
