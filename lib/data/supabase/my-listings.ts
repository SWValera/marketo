import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import { getListingAttributeRecords } from "@/lib/data/supabase/listings";
import type {
  MyListingSummary,
  OwnerDraftBundle,
  PageResult,
} from "@/lib/data/types";
import { localeTag } from "@/lib/i18n/config";
import type { Locale } from "@/lib/i18n/messages";
import { protectedMediaUrl, publicMediaUrl } from "@/lib/media/public-url";
import type { Json } from "@/lib/supabase/database.types";

const MAX_MY_LISTINGS_PAGE_SIZE = 50;

export class OwnerListingDataError extends Error {
  constructor(
    public readonly code: "AUTHENTICATION_REQUIRED" | "LIST_UNAVAILABLE" | "DETAIL_UNAVAILABLE" | "NOT_EDITABLE",
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = "OwnerListingDataError";
  }
}

function singleRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}

function localizedName(value: { name_ru?: string | null; name_kk?: string | null } | null, locale: Locale) {
  if (!value) return "";
  return locale === "kk" ? value.name_kk ?? value.name_ru ?? "" : value.name_ru ?? value.name_kk ?? "";
}

function safeNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function priceParts(value: unknown, currencyCode: string, locale: Locale) {
  const price = safeNumber(value);
  if (price === null) return { amount: null, label: locale === "kk" ? "Келісімді" : "Договорная" };
  const exponent = currencyCode === "KZT" ? 0 : 2;
  const amount = price / (10 ** exponent);
  const symbol = currencyCode === "KZT" ? "₸" : currencyCode;
  return {
    amount,
    label: `${amount.toLocaleString(localeTag(locale), { maximumFractionDigits: exponent })} ${symbol}`,
  };
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

async function currentUserId(client: MarketoSupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new OwnerListingDataError("AUTHENTICATION_REQUIRED", { cause: error });
  return data.user.id;
}

async function rejectionFeedback(client: MarketoSupabaseClient, listingId: string | null = null) {
  const { data, error } = await client.rpc("get_my_listing_moderation_feedback", {
    p_listing_id: listingId,
  });
  if (error) throw error;
  return data ?? [];
}

type MyListingRow = {
  id: string;
  slug: string;
  title: string;
  price_minor: number | string | null;
  currency_code: string;
  status: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
  categories: unknown;
  settlements: unknown;
};

export async function listMyListings(
  client: MarketoSupabaseClient,
  options: { page?: number; pageSize?: number; locale?: Locale } = {},
): Promise<PageResult<MyListingSummary>> {
  const userId = await currentUserId(client);
  const page = Math.max(Math.trunc(options.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 12), 1), MAX_MY_LISTINGS_PAGE_SIZE);
  const locale = options.locale ?? "ru";
  const offset = (page - 1) * pageSize;
  const response = await client
    .from("listings")
    .select(
      "id, slug, title, price_minor, currency_code, status, created_at, updated_at, published_at, deleted_at, categories(id, name_ru, name_kk), settlements(id, name_ru, name_kk)",
      { count: "exact" },
    )
    .eq("owner_id", userId)
    .neq("status", "deleted")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (response.error || response.count === null) {
    throw new OwnerListingDataError("LIST_UNAVAILABLE", { cause: response.error });
  }
  const rows = (response.data ?? []) as unknown as MyListingRow[];
  if (rows.length === 0) return { items: [], total: response.count, nextCursor: null };

  const listingIds = rows.map((row) => row.id);
  const [imagesResult, feedback] = await Promise.all([
    client
      .from("listing_images")
      .select("id, listing_id, storage_key, sort_order")
      .in("listing_id", listingIds)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    rejectionFeedback(client),
  ]);
  if (imagesResult.error) throw new OwnerListingDataError("LIST_UNAVAILABLE", { cause: imagesResult.error });
  const firstImage = new Map<string, string>();
  for (const image of imagesResult.data ?? []) {
    if (!firstImage.has(image.listing_id)) firstImage.set(image.listing_id, image.storage_key);
  }
  const feedbackByListing = new Map(feedback.map((row) => [row.listing_id, row]));

  return {
    items: rows.map((row) => {
      const price = priceParts(row.price_minor, row.currency_code, locale);
      const category = singleRelation<{ name_ru: string; name_kk: string }>(row.categories);
      const settlement = singleRelation<{ name_ru: string; name_kk: string }>(row.settlements);
      const storageKey = firstImage.get(row.id) ?? null;
      const isPublic = row.status === "active" && Boolean(row.published_at) && !row.deleted_at;
      const safeStatus = row.status as MyListingSummary["status"];
      const safeFeedback = safeStatus === "rejected" ? feedbackByListing.get(row.id) : undefined;
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        priceLabel: price.label,
        priceAmount: price.amount,
        currencyCode: row.currency_code,
        cityLabel: localizedName(settlement, locale),
        categoryLabel: localizedName(category, locale),
        status: safeStatus,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        updatedLabel: dateLabel(row.updated_at, locale),
        publishedAt: row.published_at,
        imageUrl: isPublic ? publicMediaUrl(storageKey) : protectedMediaUrl(storageKey),
        rejectionReasonCode: safeFeedback?.reason_code ?? null,
        rejectedAt: safeFeedback?.rejected_at ?? null,
      };
    }),
    total: response.count,
    nextCursor: offset + rows.length < response.count ? String(page + 1) : null,
  };
}

function scalarAttributeValue(row: {
  text_value: string | null;
  number_value: string | number | null;
  boolean_value: boolean | null;
  date_value: string | null;
  number_min_value: string | number | null;
  number_max_value: string | number | null;
}) {
  if (row.text_value !== null) return row.text_value;
  if (row.number_value !== null) return String(row.number_value);
  if (row.boolean_value !== null) return row.boolean_value;
  if (row.date_value !== null) return row.date_value;
  if (row.number_min_value !== null && row.number_max_value !== null) {
    return { min: String(row.number_min_value), max: String(row.number_max_value) };
  }
  return undefined;
}

export async function getMyListingDraftBundle(
  client: MarketoSupabaseClient,
  listingId: string,
): Promise<OwnerDraftBundle | null> {
  const userId = await currentUserId(client);
  const result = await client
    .from("listings")
    .select("id, slug, category_id, settlement_id, title, description, price_minor, currency_code, status, updated_at, owner_id, categories(id, slug), listing_contacts(*), listing_images(id, storage_key, sort_order)")
    .eq("id", listingId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) throw new OwnerListingDataError("DETAIL_UNAVAILABLE", { cause: result.error });
  if (!result.data) return null;
  const row = result.data as unknown as {
    id: string;
    slug: string;
    category_id: string;
    settlement_id: string;
    title: string;
    description: string;
    price_minor: number | string | null;
    currency_code: string;
    status: string;
    updated_at: string;
    categories: unknown;
    listing_contacts: unknown;
    listing_images: unknown;
  };
  if (row.status !== "draft" && row.status !== "rejected") {
    throw new OwnerListingDataError("NOT_EDITABLE");
  }
  const category = singleRelation<{ id: string; slug: string }>(row.categories);
  const contact = singleRelation<{
    contact_name: string;
    contact_phone_e164: string | null;
    allow_messages: boolean;
  }>(row.listing_contacts);
  if (!category || !contact) throw new OwnerListingDataError("DETAIL_UNAVAILABLE");

  const [records, feedback] = await Promise.all([
    getListingAttributeRecords(client, [row.id]),
    row.status === "rejected" ? rejectionFeedback(client, row.id) : Promise.resolve([]),
  ]);
  const definitions = new Map(records.attributes.map((attribute) => [attribute.id, attribute]));
  const options = new Map(records.options.map((option) => [option.id, option]));
  const attributes: OwnerDraftBundle["attributes"] = {};
  for (const value of records.scalarValues) {
    const definition = definitions.get(value.attribute_id);
    const normalized = scalarAttributeValue(value);
    if (definition && normalized !== undefined) attributes[definition.key] = normalized;
  }
  for (const value of records.optionValues) {
    const definition = definitions.get(value.attribute_id);
    const option = options.get(value.option_id);
    if (!definition || !option) continue;
    if (definition.data_type === "multiselect") {
      const current = attributes[definition.key];
      attributes[definition.key] = [...(Array.isArray(current) ? current : []), option.value];
    } else {
      attributes[definition.key] = option.value;
    }
  }

  const images = (Array.isArray(row.listing_images) ? row.listing_images : []) as Array<{
    id: string;
    storage_key: string;
    sort_order: number;
  }>;
  const latestFeedback = feedback[0];
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    categoryId: row.category_id,
    categorySlug: category.slug,
    settlementId: row.settlement_id,
    title: row.title,
    description: row.description,
    price: safeNumber(row.price_minor),
    currencyCode: row.currency_code === "KZT" ? "KZT" : "KZT",
    contactName: contact.contact_name,
    contactPhone: contact.contact_phone_e164 ?? "",
    allowMessages: contact.allow_messages,
    attributes,
    images: images
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id))
      .map((image) => ({ id: image.id, url: protectedMediaUrl(image.storage_key) ?? "", sortOrder: image.sort_order })),
    rejectionReasonCode: latestFeedback?.reason_code ?? null,
    rejectedAt: latestFeedback?.rejected_at ?? null,
    updatedAt: row.updated_at,
  };
}

export async function updateMyListingDraft(
  client: MarketoSupabaseClient,
  input: {
    listingId: string;
    categoryId: string;
    settlementId: string;
    title: string;
    description: string;
    price: number | null;
    contactName: string;
    contactPhone: string;
    allowMessages: boolean;
    rpcAttributes: Json;
  },
) {
  const { data, error } = await client.rpc("update_listing_draft", {
    target_listing_id: input.listingId,
    p_category_id: input.categoryId,
    p_settlement_id: input.settlementId,
    p_title: input.title,
    p_description: input.description,
    p_price_minor: input.price,
    p_currency_code: "KZT",
    p_contact_name: input.contactName,
    p_contact_phone_e164: input.contactPhone,
    p_allow_messages: input.allowMessages,
    p_attributes: input.rpcAttributes,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

