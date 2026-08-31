import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import { getListingAttributeRecords, getListingDetail } from "@/lib/data/supabase/listings";
import { getProfileForStaff } from "@/lib/data/supabase/profiles";
import type {
  ModerationAttribute,
  ModerationDecision,
  ModerationListingDetail,
  ModerationQueueItem,
  PageResult,
} from "@/lib/data/types";
import { localeTag } from "@/lib/i18n/config";
import type { Locale } from "@/lib/i18n/messages";
import type { ModerationRejectionReason } from "@/lib/moderation/policy";
import {
  ModerationDataError,
  moderationMediaUrl,
  normalizeModerationQueueQueryResult,
} from "./moderation-core.ts";

export { ModerationDataError, moderationMediaUrl, normalizeModerationQueueQueryResult } from "./moderation-core.ts";

const MAX_QUEUE_PAGE_SIZE = 50;

type QueryFailure = { code?: string; message?: string } | null;
type QueueQueryRow = {
  id: string;
  title: string;
  price_minor: number | null;
  currency_code: string;
  status: string;
  owner_id: string | null;
  category_id: string;
  settlement_id: string;
  created_at: string;
  categories: unknown;
  settlements: unknown;
};

type QueueQueryResult = { data: QueueQueryRow[] | null; error: QueryFailure; count: number | null };

function singleRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}

function localizedName(value: { name_ru?: string | null; name_kk?: string | null } | null, locale: Locale) {
  if (!value) return "";
  return locale === "kk" ? value.name_kk ?? value.name_ru ?? "" : value.name_ru ?? value.name_kk ?? "";
}

function priceLabel(priceMinor: number | null, currencyCode: string, locale: Locale) {
  if (priceMinor === null) return locale === "kk" ? "Келісімді" : "Договорная";
  const exponent = currencyCode === "KZT" ? 0 : 2;
  const amount = priceMinor / (10 ** exponent);
  const symbol = currencyCode === "KZT" ? "₸" : currencyCode;
  return `${amount.toLocaleString(localeTag(locale), { maximumFractionDigits: exponent })} ${symbol}`;
}

function dateLabel(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function safeNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export async function listModerationQueue(
  client: MarketoSupabaseClient,
  options: { page?: number; pageSize?: number; locale?: Locale } = {},
): Promise<PageResult<ModerationQueueItem>> {
  const page = Math.max(Math.trunc(options.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 24), 1), MAX_QUEUE_PAGE_SIZE);
  const locale = options.locale ?? "ru";
  const offset = (page - 1) * pageSize;
  const response = await client
    .from("listings")
    .select(
      "id, title, price_minor, currency_code, status, owner_id, category_id, settlement_id, created_at, categories(id, name_ru, name_kk), settlements(id, name_ru, name_kk)",
      { count: "exact" },
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + pageSize - 1);
  const { rows, total } = normalizeModerationQueueQueryResult(response as unknown as QueueQueryResult);
  if (rows.length === 0) return { items: [], total, nextCursor: null };

  const listingIds = rows.map((row) => row.id);
  const ownerIds = [...new Set(rows.map((row) => row.owner_id).filter((id): id is string => Boolean(id)))];
  const [imageResult, sellerResult] = await Promise.all([
    client
      .from("listing_images")
      .select("id, listing_id, storage_key, sort_order")
      .in("listing_id", listingIds)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    ownerIds.length
      ? client.from("profiles").select("id, display_name").in("id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (imageResult.error || sellerResult.error) {
    throw new ModerationDataError("QUEUE_UNAVAILABLE", imageResult.error ?? sellerResult.error);
  }

  const firstImageByListing = new Map<string, string>();
  for (const image of imageResult.data ?? []) {
    if (!firstImageByListing.has(image.listing_id)) firstImageByListing.set(image.listing_id, image.storage_key);
  }
  const sellerById = new Map((sellerResult.data ?? []).map((seller) => [seller.id, seller.display_name]));

  return {
    items: rows.map((row) => {
      const category = singleRelation<{ name_ru: string; name_kk: string }>(row.categories);
      const settlement = singleRelation<{ name_ru: string; name_kk: string }>(row.settlements);
      return {
        id: row.id,
        title: row.title,
        priceLabel: priceLabel(safeNumber(row.price_minor), row.currency_code, locale),
        currencyCode: row.currency_code,
        cityLabel: localizedName(settlement, locale),
        categoryLabel: localizedName(category, locale),
        createdAt: row.created_at,
        createdLabel: dateLabel(row.created_at, locale),
        sellerId: row.owner_id,
        sellerName: row.owner_id
          ? sellerById.get(row.owner_id) ?? (locale === "kk" ? "Сатушы" : "Продавец")
          : (locale === "kk" ? "Профиль жойылған" : "Профиль удалён"),
        imageUrl: moderationMediaUrl(firstImageByListing.get(row.id) ?? null),
        status: "pending" as const,
      };
    }),
    total,
    nextCursor: offset + rows.length < total ? String(page + 1) : null,
  };
}

async function categoryPath(
  client: MarketoSupabaseClient,
  category: { id: string; parent_id: string | null; name_ru: string; name_kk: string },
  locale: Locale,
) {
  const path: string[] = [];
  let current: typeof category | null = category;
  const visited = new Set<string>();
  while (current && !visited.has(current.id) && path.length < 12) {
    visited.add(current.id);
    path.unshift(localizedName(current, locale));
    if (!current.parent_id) break;
    const result = await client
      .from("categories")
      .select("id, parent_id, name_ru, name_kk")
      .eq("id", current.parent_id)
      .maybeSingle() as unknown as { data: typeof category | null; error: QueryFailure };
    if (result.error) throw new ModerationDataError("DETAIL_UNAVAILABLE", result.error);
    current = result.data;
  }
  return path;
}

function scalarValue(row: Record<string, unknown>, locale: Locale) {
  if (row.text_value !== null && row.text_value !== undefined) return String(row.text_value);
  if (row.number_value !== null && row.number_value !== undefined) return String(row.number_value);
  if (row.boolean_value !== null && row.boolean_value !== undefined) {
    return row.boolean_value ? (locale === "kk" ? "Иә" : "Да") : (locale === "kk" ? "Жоқ" : "Нет");
  }
  if (row.date_value !== null && row.date_value !== undefined) return String(row.date_value);
  if (row.number_min_value !== null && row.number_max_value !== null) {
    return `${String(row.number_min_value)}–${String(row.number_max_value)}`;
  }
  return "";
}

function mapModerationAttributes(
  records: Awaited<ReturnType<typeof getListingAttributeRecords>>,
  locale: Locale,
): ModerationAttribute[] {
  const definitions = new Map(records.attributes.map((attribute) => [attribute.id, attribute]));
  const options = new Map(records.options.map((option) => [option.id, option]));
  const values = new Map<string, string[]>();
  for (const row of records.scalarValues) {
    const value = scalarValue(row as unknown as Record<string, unknown>, locale);
    if (value) values.set(row.attribute_id, [value]);
  }
  for (const row of records.optionValues) {
    const option = options.get(row.option_id);
    if (!option) continue;
    const label = locale === "kk" ? option.label_kk : option.label_ru;
    values.set(row.attribute_id, [...(values.get(row.attribute_id) ?? []), label]);
  }
  return [...values.entries()]
    .map(([attributeId, selected]) => {
      const definition = definitions.get(attributeId);
      if (!definition) return null;
      const label = locale === "kk" ? definition.label_kk : definition.label_ru;
      const unit = locale === "kk" ? definition.unit_kk : definition.unit_ru;
      return {
        key: definition.key,
        label,
        value: `${selected.join(", ")}${unit ? ` ${unit}` : ""}`,
        sortOrder: definition.sort_order,
      };
    })
    .filter((attribute): attribute is ModerationAttribute & { sortOrder: number } => Boolean(attribute))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((attribute) => ({ key: attribute.key, label: attribute.label, value: attribute.value }));
}

export async function getModerationListingDetail(
  client: MarketoSupabaseClient,
  listingId: string,
  locale: Locale = "ru",
): Promise<ModerationListingDetail | null> {
  try {
    const row = await getListingDetail(client, listingId);
    if (!row || row.status !== "pending") return null;
    const category = singleRelation<{ id: string; parent_id: string | null; name_ru: string; name_kk: string }>(row.categories);
    const settlement = singleRelation<{ name_ru: string; name_kk: string }>(row.settlements);
    if (!category || !settlement) throw new ModerationDataError("DETAIL_UNAVAILABLE");
    const [attributes, seller, resolvedCategoryPath] = await Promise.all([
      getListingAttributeRecords(client, [row.id]),
      row.owner_id ? getProfileForStaff(client, row.owner_id) : Promise.resolve(null),
      categoryPath(client, category, locale),
    ]);
    const images = (row.listing_images as unknown as Array<{ id: string; storage_key: string; sort_order: number }>)
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id))
      .map((image) => ({ id: image.id, url: moderationMediaUrl(image.storage_key) ?? "", sortOrder: image.sort_order }));
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      priceLabel: priceLabel(safeNumber(row.price_minor), row.currency_code, locale),
      currencyCode: row.currency_code,
      categoryPath: resolvedCategoryPath,
      cityLabel: localizedName(settlement, locale),
      createdAt: row.created_at,
      createdLabel: dateLabel(row.created_at, locale),
      sellerId: row.owner_id,
      sellerName: seller?.display_name ?? (locale === "kk" ? "Сатушы" : "Продавец"),
      status: "pending",
      attributes: mapModerationAttributes(attributes, locale),
      images,
    };
  } catch (error) {
    if (error instanceof ModerationDataError) throw error;
    throw new ModerationDataError("DETAIL_UNAVAILABLE", error);
  }
}

export async function moderateListing(
  client: MarketoSupabaseClient,
  listingId: string,
  decision: ModerationDecision,
  reasonCode?: ModerationRejectionReason,
  note?: string,
) {
  const { error } = await client.rpc("moderate_listing", {
    target_listing_id: listingId,
    decision,
    reason_code: decision === "reject" ? reasonCode ?? null : null,
    note: note?.trim() || null,
  });
  if (error) throw error;
}

export async function createReport(
  client: MarketoSupabaseClient,
  input: { reporterId: string; listingId?: string; reportedUserId?: string; reasonCode: string; details?: string },
) {
  const { data, error } = await client.from("reports").insert({
    reporter_id: input.reporterId,
    listing_id: input.listingId ?? null,
    reported_user_id: input.reportedUserId ?? null,
    reason_code: input.reasonCode,
    details: input.details ?? null,
  }).select("*").single();
  if (error) throw error;
  return data;
}
