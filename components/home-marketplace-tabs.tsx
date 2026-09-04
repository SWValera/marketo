"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { EmptyState } from "@/components/empty-state";
import { useI18n } from "@/components/i18n-provider";
import { ListingCard } from "@/components/listing-card";
import { fetchHomeListingPreview } from "@/lib/data/home-listing-preview";
import type { ListingSummary } from "@/lib/data/types";

type ListingState = "idle" | "loading" | "ready" | "error";

export function HomeMarketplaceTabs({ catalog }: { catalog: ReactNode }) {
  const { t } = useI18n();
  const [active, setActive] = useState<"catalog" | "listings">("catalog");
  const [listingState, setListingState] = useState<ListingState>("idle");
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const request = useRef<AbortController | null>(null);
  const tabs = ["catalog", "listings"] as const;

  const loadListings = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setListingState("loading");
    try {
      setListings(await fetchHomeListingPreview(controller.signal));
      setListingState("ready");
    } catch {
      if (controller.signal.aborted) return;
      setListingState("error");
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, []);

  useEffect(() => () => request.current?.abort(), []);

  function selectTab(next: typeof active) {
    setActive(next);
    if (next === "listings" && (listingState === "idle" || listingState === "error")) void loadListings();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, current: typeof active) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabs.indexOf(current);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    selectTab(next);
    document.getElementById(`home-${next}-tab`)?.focus();
  }

  const listingsPanel = <section className="home-tab-panel" aria-labelledby="home-listings-title" aria-busy={listingState === "loading" || undefined}>
    <div className="section-heading"><div><span className="section-kicker">{t("home.newOffers")}</span><h2 id="home-listings-title">{t("home.recommended")}</h2></div><Link href="/search">{t("home.allListings")} <ArrowRight size={16} /></Link></div>
    {listingState === "loading" || listingState === "idle" ? <div className="listing-grid" aria-label={t("common.loading")}><div className="skeleton-card" /></div> : null}
    {listingState === "error" ? <div className="empty-state" role="alert"><h2>{t("state.error")}</h2><p>{t("state.errorNote")}</p><button type="button" onClick={() => void loadListings()}>{t("common.retry")}</button></div> : null}
    {listingState === "ready" && listings.length > 0 ? <div className="listing-grid">{listings.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div> : null}
    {listingState === "ready" && listings.length === 0 ? <EmptyState title={t("home.emptyTitle")} description={t("home.emptyDescription")} actionHref="/publish" actionLabel={t("nav.publish")} actionPrefetch={false} /> : null}
  </section>;

  return <section className="home-marketplace page-shell">
    <div className="home-marketplace-tabs" role="tablist" aria-label={t("home.marketplaceTabs")}>
      <button id="home-catalog-tab" type="button" role="tab" aria-controls="home-marketplace-panel" aria-selected={active === "catalog"} tabIndex={active === "catalog" ? 0 : -1} className={active === "catalog" ? "is-active" : ""} onKeyDown={(event) => handleKeyDown(event, "catalog")} onClick={() => selectTab("catalog")}>{t("common.catalog")}</button>
      <button id="home-listings-tab" type="button" role="tab" aria-controls="home-marketplace-panel" aria-selected={active === "listings"} tabIndex={active === "listings" ? 0 : -1} className={active === "listings" ? "is-active" : ""} onKeyDown={(event) => handleKeyDown(event, "listings")} onClick={() => selectTab("listings")}>{t("home.listings")}</button>
    </div>
    <div id="home-marketplace-panel" role="tabpanel" aria-labelledby={`home-${active}-tab`} tabIndex={0}>{active === "catalog" ? catalog : listingsPanel}</div>
  </section>;
}
