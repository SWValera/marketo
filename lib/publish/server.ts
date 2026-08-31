import "server-only";

import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import { getCategoryAttributes } from "@/lib/data/supabase/categories";
import { getMyListingDraftBundle } from "@/lib/data/supabase/my-listings";
import {
  isPublishValueMissing,
  normalizeE164Phone,
  parsePublishDraftPayload,
  validatePublishDraft,
  type PublishDraftInput,
  type PublishFieldErrors,
} from "@/lib/publish/contract";
import { getAttributeValidation, isAttributeVisible } from "@/lib/reference-data/attributes";
import type {
  CategoryPriceMode,
  ReferenceCategoryAttribute,
} from "@/lib/reference-data/types";
import type { Json } from "@/lib/supabase/database.types";

export class PublishReferenceError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("PUBLISH_REFERENCE_UNAVAILABLE", options);
    this.name = "PublishReferenceError";
  }
}

export type PreparedPublishDraft = {
  input: PublishDraftInput & { contactPhone: string };
  priceMode: CategoryPriceMode;
  attributes: ReferenceCategoryAttribute[];
  rpcAttributes: Json;
};

function addError(errors: PublishFieldErrors, field: string, code: "required" | "invalid") {
  errors[field] = [...new Set([...(errors[field] ?? []), code])];
}

function mapAttributes(
  rows: Awaited<ReturnType<typeof getCategoryAttributes>>,
  optionRows: Array<{
    id: string;
    attribute_id: string;
    parent_option_id: string | null;
    value: string;
    label_ru: string;
    label_kk: string;
    sort_order: number;
  }>,
): ReferenceCategoryAttribute[] {
  const optionsByAttribute = new Map<string, ReferenceCategoryAttribute["options"]>();
  for (const option of optionRows) {
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
  return rows.map((attribute) => ({
    id: attribute.id,
    categoryId: attribute.category_id,
    key: attribute.key,
    label: { ru: attribute.label_ru, kk: attribute.label_kk },
    dataType: attribute.data_type as ReferenceCategoryAttribute["dataType"],
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
  }));
}

function selectedOptionRequests(input: PublishDraftInput, attributes: Awaited<ReturnType<typeof getCategoryAttributes>>) {
  const requests: Array<{ attributeId: string; value: string }> = [];
  const byKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));
  for (const [key, value] of Object.entries(input.attributes)) {
    const attribute = byKey.get(key);
    if (!attribute || (attribute.data_type !== "select" && attribute.data_type !== "multiselect")) continue;
    const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    for (const selected of values) requests.push({ attributeId: attribute.id, value: selected });
  }
  return requests;
}

function buildRpcAttributes(input: PublishDraftInput, attributes: ReferenceCategoryAttribute[]) {
  const result: Array<Record<string, unknown>> = [];
  for (const attribute of [...attributes].sort((left, right) => left.sortOrder - right.sortOrder)) {
    const value = input.attributes[attribute.key];
    if (!isAttributeVisible(attribute, input.attributes) || isPublishValueMissing(value)) continue;
    if (attribute.dataType === "select" || attribute.dataType === "multiselect") {
      const selected = Array.isArray(value) ? value : [String(value)];
      const optionIds = selected.map((item) => attribute.options.find((option) => option.value === item)?.id);
      result.push({
        attribute_id: attribute.id,
        data_type: attribute.dataType,
        option_ids: optionIds,
      });
    } else if (attribute.dataType === "range" && value && typeof value === "object" && !Array.isArray(value)) {
      result.push({ attribute_id: attribute.id, data_type: attribute.dataType, min: value.min, max: value.max });
    } else {
      result.push({
        attribute_id: attribute.id,
        data_type: attribute.dataType,
        value: typeof value === "string" && attribute.dataType === "text" ? value.trim() : value,
      });
    }
  }
  return result as Json;
}

export async function preparePublishDraft(
  client: MarketoSupabaseClient,
  raw: unknown,
  options: { requirePhotos?: boolean; photoCount?: number } = {},
): Promise<
  | { success: true; value: PreparedPublishDraft }
  | { success: false; errors: PublishFieldErrors }
> {
  const parsed = parsePublishDraftPayload(raw);
  if (!parsed.success) return parsed;
  const input = parsed.data;

  const [categoryResult, childResult, settlementResult, attributeRows] = await Promise.all([
    client.from("categories").select("id, is_active, price_mode").eq("id", input.categoryId).maybeSingle(),
    client.from("categories").select("id").eq("parent_id", input.categoryId).eq("is_active", true).limit(1),
    client.from("settlements").select("id, is_active, is_selectable").eq("id", input.settlementId).maybeSingle(),
    getCategoryAttributes(client, input.categoryId),
  ]).catch((cause) => {
    throw new PublishReferenceError({ cause });
  });
  if (categoryResult.error || childResult.error || settlementResult.error) {
    throw new PublishReferenceError({ cause: categoryResult.error ?? childResult.error ?? settlementResult.error });
  }

  const selectedRequests = selectedOptionRequests(input, attributeRows);
  const attributeIds = [...new Set(selectedRequests.map((item) => item.attributeId))];
  const values = [...new Set(selectedRequests.map((item) => item.value))];
  const optionsResult = attributeIds.length > 0 && values.length > 0
    ? await client
        .from("category_attribute_options")
        .select("id, attribute_id, parent_option_id, value, label_ru, label_kk, sort_order")
        .in("attribute_id", attributeIds)
        .in("value", values)
        .eq("is_active", true)
    : { data: [], error: null };
  if (optionsResult.error) throw new PublishReferenceError({ cause: optionsResult.error });

  const attributes = mapAttributes(attributeRows, optionsResult.data ?? []);
  const priceMode = (categoryResult.data?.price_mode ?? "price") as CategoryPriceMode;
  const errors = validatePublishDraft(input, {
    priceMode,
    attributes,
    requirePhotos: options.requirePhotos,
    photoCount: options.photoCount,
    strictOptions: true,
  });
  if (!categoryResult.data?.is_active || childResult.data.length > 0) addError(errors, "category", "invalid");
  if (!settlementResult.data?.is_active || !settlementResult.data.is_selectable) addError(errors, "city", "invalid");
  const phone = normalizeE164Phone(input.contactPhone);
  if (!phone) addError(errors, "contactPhone", "invalid");
  if (Object.keys(errors).length > 0) return { success: false, errors };

  const normalized: PreparedPublishDraft["input"] = {
    ...input,
    title: input.title.trim(),
    description: input.description.trim(),
    contactName: input.contactName.trim(),
    contactPhone: phone!,
  };
  return {
    success: true,
    value: {
      input: normalized,
      priceMode,
      attributes,
      rpcAttributes: buildRpcAttributes(normalized, attributes),
    },
  };
}

export async function validateStoredListingForSubmit(client: MarketoSupabaseClient, listingId: string) {
  const draft = await getMyListingDraftBundle(client, listingId);
  if (!draft) return { status: "not_found" as const };
  const prepared = await preparePublishDraft(client, {
    categoryId: draft.categoryId,
    settlementId: draft.settlementId,
    title: draft.title,
    description: draft.description,
    price: draft.price,
    currencyCode: draft.currencyCode,
    contactName: draft.contactName,
    contactPhone: draft.contactPhone,
    allowMessages: draft.allowMessages,
    attributes: draft.attributes,
  }, { requirePhotos: true, photoCount: draft.images.length });
  return prepared.success
    ? { status: "ready" as const, draft, prepared: prepared.value }
    : { status: "invalid" as const, errors: prepared.errors };
}

export function attributeValidationForResponse(attribute: ReferenceCategoryAttribute) {
  return getAttributeValidation(attribute);
}

