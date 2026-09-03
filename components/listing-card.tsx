"use client";

import { AppLink as Link } from "@/components/app-link";
import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  loadFavoriteStore,
  readFavoriteStore,
  readServerFavoriteStore,
  subscribeFavoriteStore,
  toggleFavoriteListing,
} from "@/components/favorite-store";
import type { ListingSummary } from "@/lib/data/types";
import { useI18n } from "@/components/i18n-provider";

export function ListingCard({ listing }: { listing: ListingSummary }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const favoriteStore = useSyncExternalStore(subscribeFavoriteStore, readFavoriteStore, readServerFavoriteStore);
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteError, setFavoriteError] = useState(false);
  const favorite = favoriteStore.ids.has(listing.id);
  const placeholders: Record<string, string> = { transport: "🚙", "real-estate": "🏠", electronics: "📱", "home-garden": "🛋️", personal: "👕", jobs: "💼", services: "🛠️", hobby: "🚲", business: "🏪", animals: "🐾", free: "🎁", exchange: "🔄" };
  const placeholder = placeholders[listing.categorySlug] ?? "📦";
  const href = `/listing/${listing.id}-${listing.slug}`;

  useEffect(() => {
    void loadFavoriteStore();
  }, []);

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

  return (
    <article className="listing-card">
      <Link href={href} className="listing-image-wrap" aria-label={listing.title}>
        <span className="listing-placeholder" aria-hidden="true">{placeholder}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {listing.imageUrl ? <img className="listing-image" src={listing.imageUrl} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
        {listing.promoted && <span className="top-badge">TOP</span>}
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
        <Link href={href} className="listing-title">{listing.title}</Link>
        <p className="listing-location">{listing.locationLabel}</p>
        <p className="listing-time">{listing.publishedLabel}</p>
      </div>
    </article>
  );
}
