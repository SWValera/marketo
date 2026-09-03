import type {
  ChatSummary,
  Conversation,
  ListingDetail,
  ListingSummary,
  MyListingSummary,
  ModerationDecision,
  ModerationListingDetail,
  ModerationQueueItem,
  Notification,
  NumberedPageResult,
  PageResult,
  Profile,
} from "@/lib/data/types";
import { cache } from "react";
import { getListingAttributeRecords, getListingDetailByRouteKey, listPublishedListingCards, listPublishedListingCardsBySeller, type ListingQuery } from "@/lib/data/supabase/listings";
import { localeTag } from "@/lib/i18n/config";
import type { Locale } from "@/lib/i18n/messages";
import { createSupabasePublicServerClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { tryGetServerSupabasePublicConfig } from "@/lib/supabase/server-env";
import { getPublicSellerProfile } from "@/lib/data/supabase/profiles";
import { publicMediaUrl } from "@/lib/media/public-url";
import { getCurrentAuthContext } from "@/lib/auth/context";
import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import {
  getModerationListingDetail,
  listModerationQueue,
  moderateListing,
} from "@/lib/data/supabase/moderation";
import type { ModerationRejectionReason } from "@/lib/moderation/policy";
import { listMyListings } from "@/lib/data/supabase/my-listings";
import { listFavoriteListings, FavoriteDataError } from "@/lib/data/supabase/favorites";
import { getConversation, listUserConversations, ChatDataError } from "@/lib/data/supabase/chat";
import { listNotificationPage, NotificationDataError } from "@/lib/data/supabase/notifications";

type ListingRepositoryQuery = ListingQuery & { locale?: Locale };

export type SellerListingsPage = PageResult<ListingSummary> & {
  page: number;
  totalPages: number;
  state: "ready" | "empty" | "out_of_range";
};

export type CatalogListingsPage = PageResult<ListingSummary> & {
  page: number;
  totalPages: number;
  state: "ready" | "empty" | "out_of_range";
};

export class PublicListingDataError extends Error {
  constructor(
    public readonly code: "UNCONFIGURED" | "INVALID_ROW" | "INVALID_RELATION",
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = "PublicListingDataError";
  }
}

function priceParts(priceMinor: number | null, currencyCode: string | null, locale: Locale) {
  if (priceMinor === null) return { amount: null, label: locale === "kk" ? "Келісімді" : "Договорная" };
  // The reviewed Kazakhstan reference row uses exponent 0: marketplace prices
  // are entered and displayed as whole tenge. Future currencies can extend this
  // map without changing stored formatted text.
  const exponent = currencyCode === "KZT" ? 0 : 2;
  const amount = priceMinor / (10 ** exponent);
  const symbol = currencyCode === "KZT" ? "₸" : currencyCode ?? "";
  return { amount, label: `${amount.toLocaleString(localeTag(locale), { maximumFractionDigits: exponent })} ${symbol}`.trim() };
}

function dateLabel(value: string | null, locale: Locale) {
  if (!value) return "";
  return new Intl.DateTimeFormat(localeTag(locale), { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

async function hydrateAttributes(listingIds: string[], locale: Locale) {
  const result = await getListingAttributeRecords(createSupabasePublicServerClient(), listingIds);
  const attributesById = new Map(result.attributes.map((row) => [row.id, row]));
  const optionsById = new Map(result.options.map((row) => [row.id, row]));
  const stable = new Map<string, Record<string, string | number | boolean>>();
  const display = new Map<string, Record<string, string>>();
  const ensure = <T>(map: Map<string, T>, listingId: string, create: () => T) => {
    const current = map.get(listingId) ?? create();
    map.set(listingId, current);
    return current;
  };
  for (const row of result.scalarValues) {
    const definition = attributesById.get(row.attribute_id);
    if (!definition) continue;
    const value = row.text_value ?? row.number_value ?? row.boolean_value ?? row.date_value
      ?? (row.number_min_value !== null && row.number_max_value !== null ? `${row.number_min_value}–${row.number_max_value}` : null);
    if (value !== null) ensure<Record<string, string | number | boolean>>(stable, row.listing_id, () => ({}))[definition.key] = value;
  }
  for (const row of result.optionValues) {
    const definition = attributesById.get(row.attribute_id);
    const option = optionsById.get(row.option_id);
    if (!definition || !option) continue;
    const current = ensure<Record<string, string | number | boolean>>(stable, row.listing_id, () => ({}));
    current[definition.key] = current[definition.key] ? `${current[definition.key]},${option.value}` : option.value;
    const localized = locale === "kk" ? option.label_kk : option.label_ru;
    const currentDisplay = ensure<Record<string, string>>(display, row.listing_id, () => ({}));
    currentDisplay[definition.key] = currentDisplay[definition.key] ? `${currentDisplay[definition.key]}, ${localized}` : localized;
  }
  return { stable, display };
}

const findListingBySlug = cache(async (slug: string, locale: Locale): Promise<ListingDetail | null> => {
  if (!tryGetServerSupabasePublicConfig()) throw new PublicListingDataError("UNCONFIGURED");
  const client = createSupabasePublicServerClient();
  const row = await getListingDetailByRouteKey(client, slug);
  if (!row) return null;
  const category = row.categories as unknown as { slug?: string } | null;
  const settlement = row.settlements as unknown as { id?: string; name_ru?: string; name_kk?: string } | null;
  if (!row.id || !row.slug || !row.title || typeof row.description !== "string" || !category?.slug || !settlement?.id || !row.owner_id) {
    throw new PublicListingDataError("INVALID_ROW");
  }
  const [hydrated, seller] = await Promise.all([
    hydrateAttributes([row.id], locale),
    getPublicSellerProfile(client, row.owner_id),
  ]);
  if (!seller?.display_name) throw new PublicListingDataError("INVALID_RELATION");
  if (!Array.isArray(row.listing_images)) throw new PublicListingDataError("INVALID_RELATION");
  const price = priceParts(row.price_minor, row.currency_code, locale);
  const images = (row.listing_images as unknown as Array<{ storage_key: string; sort_order: number }>).sort((left, right) => left.sort_order - right.sort_order);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    priceLabel: price.label,
    priceAmount: price.amount,
    locationLabel: locale === "kk" ? settlement.name_kk ?? settlement.name_ru ?? "" : settlement.name_ru ?? settlement.name_kk ?? "",
    publishedLabel: dateLabel(row.published_at, locale),
    imageUrl: publicMediaUrl(images[0]?.storage_key ?? null),
    categorySlug: category.slug,
    cityId: settlement.id,
    promoted: Boolean(row.promoted_until && new Date(row.promoted_until) > new Date()),
    attributes: hydrated.stable.get(row.id) ?? {},
    attributeDisplayValues: hydrated.display.get(row.id) ?? {},
    sellerId: row.owner_id,
    sellerName: seller.display_name,
    contactPhone: null,
  };
});

export const listingRepository = {
  async list(filters: ListingRepositoryQuery = {}): Promise<CatalogListingsPage> {
    if (!tryGetServerSupabasePublicConfig()) throw new PublicListingDataError("UNCONFIGURED");
    const locale = filters.locale ?? "ru";
    const page = await listPublishedListingCards(createSupabasePublicServerClient(), filters);
    const rows = page.items.map((row) => {
      if (!row.id || !row.slug || !row.title || !row.category_slug || !row.settlement_id || !row.published_at) {
        throw new PublicListingDataError("INVALID_ROW");
      }
      return row as typeof row & { id: string; slug: string; title: string; category_slug: string; settlement_id: string; published_at: string };
    });
    const hydrated = await hydrateAttributes(rows.map((row) => row.id), locale);
    return {
      items: rows.map((row) => {
        const price = priceParts(row.price_minor, row.currency_code, locale);
        return {
          id: row.id,
          slug: row.slug,
          title: row.title,
          priceLabel: price.label,
          priceAmount: price.amount,
          locationLabel: locale === "kk" ? row.location_name_kk ?? row.location_name_ru ?? "" : row.location_name_ru ?? row.location_name_kk ?? "",
          publishedLabel: dateLabel(row.published_at, locale),
          imageUrl: publicMediaUrl(row.primary_image_storage_key),
          categorySlug: row.category_slug,
          cityId: row.settlement_id,
          promoted: Boolean(row.promoted),
          attributes: hydrated.stable.get(row.id) ?? {},
        };
      }),
      total: page.total,
      nextCursor: page.nextPage === null ? null : String(page.nextPage),
      page: page.page,
      totalPages: page.totalPages,
      state: page.state,
    };
  },
  async favorites(options: { page?: number; pageSize?: number; locale?: Locale } = {}): Promise<PageResult<ListingSummary>> {
    const context = await getCurrentAuthContext();
    if (context.status !== "authenticated") throw new FavoriteDataError("AUTHENTICATION_REQUIRED");
    return listFavoriteListings(await createSupabaseServerClient(), context.user.id, options);
  },
  async mine(options: { page?: number; pageSize?: number; locale?: Locale } = {}): Promise<NumberedPageResult<MyListingSummary>> {
    return listMyListings(await createSupabaseServerClient(), options);
  },
  async findBySlug(slug: string, locale: Locale = "ru"): Promise<ListingDetail | null> {
    return findListingBySlug(slug, locale);
  },
  async listPublishedBySeller(
    sellerId: string,
    options: { page?: number; pageSize?: number; locale?: Locale } = {},
  ): Promise<SellerListingsPage> {
    if (!tryGetServerSupabasePublicConfig()) throw new Error("seller_listings_unavailable");
    const locale = options.locale ?? "ru";
    const page = await listPublishedListingCardsBySeller(
      createSupabasePublicServerClient(),
      sellerId,
      { page: options.page, pageSize: options.pageSize },
    );
    return {
      items: page.items.map((row) => {
        const price = priceParts(row.price_minor, row.currency_code, locale);
        return {
          id: row.id,
          slug: row.slug,
          title: row.title,
          priceLabel: price.label,
          priceAmount: price.amount,
          locationLabel: locale === "kk" ? row.location_name_kk ?? row.location_name_ru ?? "" : row.location_name_ru ?? row.location_name_kk ?? "",
          publishedLabel: dateLabel(row.published_at, locale),
          imageUrl: publicMediaUrl(row.primary_image_storage_key),
          categorySlug: row.category_slug,
          cityId: row.settlement_id,
          promoted: Boolean(row.promoted),
        };
      }),
      total: page.total,
      page: page.page,
      totalPages: page.totalPages,
      state: page.state,
      nextCursor: page.nextPage === null ? null : String(page.nextPage),
    };
  },
};

export const profileRepository = {
  async current() {
    return getCurrentAuthContext();
  },
  async findById(id: string): Promise<Profile | null> {
    const row = await getPublicSellerProfile(createSupabasePublicServerClient(), id);
    if (!row) return null;
    if (!row.id || !row.display_name) throw new Error("seller_profile_invalid");
    return {
      id: row.id,
      displayName: row.display_name,
      avatarUrl: publicMediaUrl(row.avatar_path),
      cityId: row.settlement_id,
      bio: row.bio,
      verified: Boolean(row.verified_at),
      language: "ru",
      accountStatus: "active",
    };
  },
};

export const chatRepository = {
  async list(options: { page?: number; pageSize?: number; locale?: Locale } = {}): Promise<PageResult<ChatSummary>> {
    const context = await getCurrentAuthContext();
    if (context.status !== "authenticated") throw new ChatDataError("LIST_UNAVAILABLE");
    return listUserConversations(await createSupabaseServerClient(), context.user.id, options);
  },
  async findById(id: string, locale: Locale = "ru"): Promise<Conversation | null> {
    const context = await getCurrentAuthContext();
    if (context.status !== "authenticated") throw new ChatDataError("DETAIL_UNAVAILABLE");
    return getConversation(await createSupabaseServerClient(), id, context.user.id, locale);
  },
};

export const notificationRepository = {
  async list(options: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}): Promise<PageResult<Notification>> {
    const context = await getCurrentAuthContext();
    if (context.status !== "authenticated") throw new NotificationDataError("LIST_UNAVAILABLE");
    return listNotificationPage(await createSupabaseServerClient(), context.user.id, options);
  },
};

export const moderationRepository = {
  async list(
    client: MarketoSupabaseClient,
    options: { page?: number; pageSize?: number; locale?: Locale } = {},
  ): Promise<NumberedPageResult<ModerationQueueItem>> {
    return listModerationQueue(client, options);
  },
  async findById(
    client: MarketoSupabaseClient,
    id: string,
    locale: Locale = "ru",
  ): Promise<ModerationListingDetail | null> {
    return getModerationListingDetail(client, id, locale);
  },
  async decide(
    client: MarketoSupabaseClient,
    id: string,
    decision: ModerationDecision,
    reasonCode?: ModerationRejectionReason,
    note?: string,
  ) {
    return moderateListing(client, id, decision, reasonCode, note);
  },
};
