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
import { mapGeographyReferenceRows } from "@/lib/data/supabase/geography";
import { createSingleFlightTtlCache } from "@/lib/reference-data/cache";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import { tryGetServerSupabasePublicConfig } from "@/lib/supabase/server-env";

const REFERENCE_CACHE_TTL_MS = 5 * 60 * 1000;
const REFERENCE_ERROR_CACHE_TTL_MS = 10 * 1000;
const ATTRIBUTE_CACHE_MAX_ENTRIES = 128;
const OPTION_CACHE_MAX_ENTRIES = 256;

function unavailable<T>(data: T): ReferenceDataEnvelope<T> {
  return { status: "unconfigured", data, reason: "missing_configuration" };
}

function failed<T>(data: T): ReferenceDataEnvelope<T> {
  return { status: "error", data, reason: "query_failed" };
}

function ready<T>(data: T): ReferenceDataEnvelope<T> {
  return { status: "ready", data };
}

function envelopeTtl<T>(value: ReferenceDataEnvelope<T>) {
  return value.status === "ready" ? REFERENCE_CACHE_TTL_MS : REFERENCE_ERROR_CACHE_TTL_MS;
}

const geographyCache = createSingleFlightTtlCache<string, ReferenceDataEnvelope<GeographyReferenceData>>({
  maxEntries: 1,
  ttlMilliseconds: envelopeTtl,
});
const categoryCache = createSingleFlightTtlCache<string, ReferenceDataEnvelope<CategoryReferenceData>>({
  maxEntries: 1,
  ttlMilliseconds: envelopeTtl,
});
const attributeCache = createSingleFlightTtlCache<string, ReferenceDataEnvelope<CategoryAttributeReferenceData>>({
  maxEntries: ATTRIBUTE_CACHE_MAX_ENTRIES,
  ttlMilliseconds: envelopeTtl,
});
const optionCache = createSingleFlightTtlCache<string, ReferenceDataEnvelope<ReferenceAttributeOption[]>>({
  maxEntries: OPTION_CACHE_MAX_ENTRIES,
  ttlMilliseconds: envelopeTtl,
});

export async function getGeographyReferences(): Promise<ReferenceDataEnvelope<GeographyReferenceData>> {
  return geographyCache.getOrLoad("geography", async () => {
    if (!tryGetServerSupabasePublicConfig()) return unavailable(EMPTY_GEOGRAPHY);
    try {
      const client = createSupabasePublicServerClient();
      const [countries, regions, settlements] = await Promise.all([
        listActiveCountries(client),
        listActiveRegions(client),
        listSelectableSettlements(client),
      ]);
      return ready(mapGeographyReferenceRows(countries, regions, settlements));
    } catch {
      return failed(EMPTY_GEOGRAPHY);
    }
  });
}

export async function getCategoryReferences(): Promise<ReferenceDataEnvelope<CategoryReferenceData>> {
  return categoryCache.getOrLoad("categories", async () => {
    if (!tryGetServerSupabasePublicConfig()) return unavailable(EMPTY_CATEGORIES);
    try {
      const rows = await listActiveCategories(createSupabasePublicServerClient());
      return ready(mapCategoryReferenceRows(rows));
    } catch {
      return failed(EMPTY_CATEGORIES);
    }
  });
}

export async function getCategoryAttributeReferences(
  categoryId: string,
): Promise<ReferenceDataEnvelope<CategoryAttributeReferenceData>> {
  return attributeCache.getOrLoad(categoryId, async () => {
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

      return ready<CategoryAttributeReferenceData>({
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
    } catch {
      return failed(emptyCategoryAttributes(categoryId));
    }
  });
}

export async function getCategoryAttributeOptionReferences(
  attributeId: string,
  parentOptionId?: string,
  query = "",
): Promise<ReferenceDataEnvelope<ReferenceAttributeOption[]>> {
  const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase("ru");
  const cacheKey = `${attributeId}:${parentOptionId ?? "root"}:${normalizedQuery}`;
  return optionCache.getOrLoad(cacheKey, async () => {
    if (!tryGetServerSupabasePublicConfig()) return unavailable([]);
    try {
      const rows = await listAttributeOptions(createSupabasePublicServerClient(), [attributeId], {
        parentOptionId,
        query: normalizedQuery,
        limit: 300,
      });
      return ready<ReferenceAttributeOption[]>(rows.map((option) => ({
        id: option.id,
        attributeId: option.attribute_id,
        parentOptionId: option.parent_option_id,
        value: option.value,
        label: { ru: option.label_ru, kk: option.label_kk },
        sortOrder: option.sort_order,
      })));
    } catch {
      return failed([]);
    }
  });
}
