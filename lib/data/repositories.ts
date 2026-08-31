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
  PageResult,
  Profile,
} from "@/lib/data/types";
import { getListingAttributeRecords, getListingDetailByRouteKey, listPublishedListingCards, type ListingQuery } from "@/lib/data/supabase/listings";
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

const emptyPage = <T>(): PageResult<T> => ({ items: [], total: 0, nextCursor: null });

type ListingRepositoryQuery = ListingQuery & { locale?: Locale };

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

export const listingRepository = {
  async list(filters: ListingRepositoryQuery = {}): Promise<PageResult<ListingSummary>> {
    if (!tryGetServerSupabasePublicConfig()) return emptyPage();
    try {
      const locale = filters.locale ?? "ru";
      const page = await listPublishedListingCards(createSupabasePublicServerClient(), filters);
      const rows = page.items.filter((row): row is typeof row & { id: string; slug: string; title: string; category_slug: string; settlement_id: string } => Boolean(row.id && row.slug && row.title && row.category_slug && row.settlement_id));
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
        total: rows.length,
        nextCursor: page.hasMore && rows.at(-1)?.published_at && rows.at(-1)?.id ? `${rows.at(-1)?.published_at}|${rows.at(-1)?.id}` : null,
      };
    } catch {
      return emptyPage();
    }
  },
  async favorites(): Promise<PageResult<ListingSummary>> { return emptyPage(); },
  async mine(options: { page?: number; pageSize?: number; locale?: Locale } = {}): Promise<PageResult<MyListingSummary>> {
    return listMyListings(await createSupabaseServerClient(), options);
  },
  async findBySlug(slug: string, locale: Locale = "ru"): Promise<ListingDetail | null> {
    if (!tryGetServerSupabasePublicConfig()) return null;
    try {
      const client = createSupabasePublicServerClient();
      const row = await getListingDetailByRouteKey(client, slug);
      if (!row) return null;
      const category = row.categories as unknown as { slug?: string } | null;
      const settlement = row.settlements as unknown as { id?: string; name_ru?: string; name_kk?: string } | null;
      if (!category?.slug || !settlement?.id) return null;
      const hydrated = await hydrateAttributes([row.id], locale);
      const price = priceParts(row.price_minor, row.currency_code, locale);
      const images = (row.listing_images as unknown as Array<{ storage_key: string; sort_order: number }>).sort((left, right) => left.sort_order - right.sort_order);
      const seller = row.owner_id ? await getPublicSellerProfile(client, row.owner_id) : null;
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
        sellerId: row.owner_id ?? "",
        sellerName: seller?.display_name ?? (locale === "kk" ? "Сатушы" : "Продавец"),
        contactPhone: null,
      };
    } catch {
      return null;
    }
  },
};

export const profileRepository = {
  async current() {
    return getCurrentAuthContext();
  },
  async findById(id: string): Promise<Profile | null> {
    if (!tryGetServerSupabasePublicConfig()) return null;
    try {
      const row = await getPublicSellerProfile(createSupabasePublicServerClient(), id);
      if (!row?.id || !row.display_name) return null;
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
    } catch {
      return null;
    }
  },
};

export const chatRepository = {
  async list(): Promise<PageResult<ChatSummary>> { return emptyPage(); },
  async findById(id: string): Promise<Conversation | null> { void id; return null; },
};

export const notificationRepository = {
  async list(): Promise<PageResult<Notification>> { return emptyPage(); },
};

export const moderationRepository = {
  async list(
    client: MarketoSupabaseClient,
    options: { page?: number; pageSize?: number; locale?: Locale } = {},
  ): Promise<PageResult<ModerationQueueItem>> {
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

// Remaining user-domain adapters keep honest empty states until their reviewed
// Auth/RLS cutovers; page components stay behind this stable boundary.
