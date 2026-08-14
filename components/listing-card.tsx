"use client";

import { Heart } from "lucide-react";
import { useState } from "react";
import type { Listing } from "@/lib/mock-data";

export function ListingCard({ listing }: { listing: Listing }) {
  const [favorite, setFavorite] = useState(false);
  const placeholder = listing.category === "Транспорт" ? "🚙" : listing.category === "Недвижимость" ? "🏠" : listing.category === "Электроника" ? "📱" : "🛋️";
  const href = `/listing/${listing.id}-${listing.slug}`;

  return (
    <article className="listing-card">
      <a href={href} className="listing-image-wrap" aria-label={listing.title}>
        <span className="listing-placeholder" aria-hidden="true">{placeholder}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="listing-image" src={listing.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
        {listing.top && <span className="top-badge">TOP</span>}
      </a>
      <button
        className={`favorite-button ${favorite ? "is-favorite" : ""}`}
        type="button"
        aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"}
        aria-pressed={favorite}
        onClick={() => setFavorite((value) => !value)}
      >
        <Heart size={20} fill={favorite ? "currentColor" : "none"} />
      </button>
      <div className="listing-body">
        <p className="listing-price">{listing.price}</p>
        <a href={href} className="listing-title">{listing.title}</a>
        <p className="listing-location">{listing.location}</p>
        <p className="listing-time">{listing.time}</p>
      </div>
    </article>
  );
}
