"use client";

import { AppLink as Link } from "@/components/app-link";
import { listingThumbnailUrl, listingDetailImageUrl } from "@/lib/media/listing-thumbnail";
import { Crown, Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  loadFavoriteStore,
  readFavoriteStore,
  readServerFavoriteStore,
  subscribeFavoriteStore,
  toggleFavoriteListing,
} from "@/components/favorite-store";
import type { ListingSummary } from "@/lib/data/types";
import { useI18n } from "@/components/i18n-provider";
import { createIntentPrefetchController } from "@/lib/navigation/intent-prefetch";
import { usePublicationDeadline } from "@/components/use-publication-deadline";

export function ListingCard({ listing, eager = false }: { listing: ListingSummary; eager?: boolean }) {
  const { t } = useI18n();
  const expired = usePublicationDeadline(listing.expiresAt);
  // Presentation deadlines come from server entitlements; activation/scheduling never runs here.
  const vipExpired = usePublicationDeadline(listing.vipUntil);
  const x2Expired = usePublicationDeadline(listing.x2Until);
  const vip = Boolean(listing.vipUntil) && !vipExpired;
  const x2 = Boolean(listing.x2Until) && !x2Expired;
  const router = useRouter();
  const pathname = usePathname();
  const favoriteStore = useSyncExternalStore(subscribeFavoriteStore, readFavoriteStore, readServerFavoriteStore);
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteError, setFavoriteError] = useState(false);
  const favorite = favoriteStore.ids.has(listing.id);
  const placeholders: Record<string, string> = { transport: "🚙", "real-estate": "🏠", electronics: "📱", "home-garden": "🛋️", personal: "👕", jobs: "💼", services: "🛠️", hobby: "🚲", business: "🏪", animals: "🐾", free: "🎁", exchange: "🔄" };
  const placeholder = placeholders[listing.categorySlug] ?? "📦";
  const href = `/listing/${listing.id}-${listing.slug}`;
  const intentPrefetch = useMemo(
    () => createIntentPrefetchController(() => router.prefetch(href)),
    [href, router],
  );

  useEffect(() => {
    void loadFavoriteStore();
  }, []);

  useEffect(() => () => intentPrefetch.dispose(), [intentPrefetch]);

  const intentPrefetchProps = {
    onClick: intentPrefetch.cancel,
    onMouseEnter: intentPrefetch.schedule,
    onMouseLeave: intentPrefetch.cancel,
  };

  async function toggleFavorite() {
    if (favoritePending) return;
    setFavoritePending(true);
    setFavoriteError(false);
    const result = await toggleFavoriteListing(listing.id);
    setFavoritePending(false);
    if (result === "authentication_required") {
      window.location.assign(`/login?next=${encodeURIComponent(href)}`);
      return;
    }
    if (result === "error") {
      setFavoriteError(true);
      return;
    }
    if (pathname === "/favorites" && result === "removed") router.refresh();
  }

  if (expired) return null;
  return (
    <article className={`listing-card${vip ? " listing-card-vip" : ""}${x2 ? " listing-card-x2" : ""}`}>
      <Link href={href} className="listing-image-wrap" aria-label={listing.title} {...intentPrefetchProps}>
        <span className="listing-placeholder" aria-hidden="true">{placeholder}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {listing.imageUrl ? <img className="listing-image" src={x2 ? listingDetailImageUrl(listing.imageUrl) : listingThumbnailUrl(listing.imageUrl)!} alt="" loading={eager ? "eager" : "lazy"} fetchPriority="auto" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
        {vip ? <span className="listing-vip-badge"><Crown size={14} aria-hidden="true" />VIP</span> : listing.promoted ? <span className="top-badge">TOP</span> : null}
      </Link>
      <button
        className={`favorite-button ${favorite ? "is-favorite" : ""}`}
        type="button"
        aria-label={favorite ? t("listing.removeFavorite") : t("listing.addFavorite")}
        aria-pressed={favorite}
        aria-describedby={favoriteError ? `favorite-error-${listing.id}` : undefined}
        disabled={!favoriteStore.ready || favoritePending}
        onClick={() => void toggleFavorite()}
      >
        <Heart size={20} fill={favorite ? "currentColor" : "none"} />
      </button>
      {favoriteError ? <span className="sr-only" id={`favorite-error-${listing.id}`} role="alert">{t("auth.errorGeneric")}</span> : null}
      <div className="listing-body">
        <p className="listing-price">{listing.priceLabel}</p>
        <Link href={href} className="listing-title" {...intentPrefetchProps}>{listing.title}</Link>
        <p className="listing-location">{listing.locationLabel}</p>
        <p className="listing-time">{listing.publishedLabel}</p>
      </div>
    </article>
  );
}
