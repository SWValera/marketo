"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useState } from "react";
import type { ListingSummary } from "@/lib/data/types";
import { useI18n } from "@/components/i18n-provider";

export function ListingCard({ listing }: { listing: ListingSummary }) {
  const { t } = useI18n();
  const [favorite, setFavorite] = useState(false);
  const placeholders: Record<string, string> = { transport: "🚙", "real-estate": "🏠", electronics: "📱", "home-garden": "🛋️", personal: "👕", jobs: "💼", services: "🛠️", hobby: "🚲", business: "🏪", animals: "🐾", free: "🎁", exchange: "🔄" };
  const placeholder = placeholders[listing.categorySlug] ?? "📦";
  const href = `/listing/${listing.id}-${listing.slug}`;

  return (
    <article className="listing-card">
      <Link href={href} className="listing-image-wrap" aria-label={listing.title}>
        <span className="listing-placeholder" aria-hidden="true">{placeholder}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {listing.imageUrl ? <img className="listing-image" src={listing.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
        {listing.promoted && <span className="top-badge">TOP</span>}
      </Link>
      <button
        className={`favorite-button ${favorite ? "is-favorite" : ""}`}
        type="button"
        aria-label={favorite ? t("listing.removeFavorite") : t("listing.addFavorite")}
        aria-pressed={favorite}
        onClick={() => setFavorite((value) => !value)}
      >
        <Heart size={20} fill={favorite ? "currentColor" : "none"} />
      </button>
      <div className="listing-body">
        <p className="listing-price">{listing.priceLabel}</p>
        <Link href={href} className="listing-title">{listing.title}</Link>
        <p className="listing-location">{listing.locationLabel}</p>
        <p className="listing-time">{listing.publishedLabel}</p>
      </div>
    </article>
  );
}
