"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Crown,
  Gift,
  KeyRound,
  MapPin,
  PackageOpen,
  RefreshCcw,
  Store,
  Wrench,
} from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { CategoryLink } from "@/components/category-link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useI18n } from "@/components/i18n-provider";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { useReferenceGeography } from "@/components/reference-geography-provider";
import { localize, localeTag } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { createSingleFlightTtlCache } from "@/lib/reference-data/cache";
import { getSettlement } from "@/lib/reference-data/geography";
import { useShowcaseTimeline } from "@/components/use-showcase-timeline";
import { premiumCarouselPage, premiumDemoCount, premiumExpandedDemoCount, premiumPreparedIndexes } from "@/lib/premium-showcase-presentation";

import { useShowcaseWidth } from "@/components/use-showcase-width";
import { ShowcaseImage, type ShowcaseImageState } from "@/components/showcase-image";
import { listingThumbnailUrl } from "@/lib/media/listing-thumbnail";

type PaidPlacement = {
  id: string;
  listingId: string;
  slug: string;
  title: string;
  priceMinor: number | null;
  currencyCode: string;
  locationRu: string;
  locationKk: string;
  imageUrl: string | null;
  expiresAt?: string;
};

type PaidResult = { placements: PaidPlacement[]; capacity: number | null };
export type ShowcaseSnapshot = { city: string; items: PaidPlacement[]; capacity: number | null; status: "idle" | "ready" | "error" };
const subscribeHydration = () => () => {};
const browserHydrated = () => true;
const serverHydrated = () => false;

const createPaidPlacementCache = () => createSingleFlightTtlCache<string, PaidResult>({
  maxEntries: 20,
  ttlMilliseconds: () => 60 * 1000,
});

async function requestPaidPlacements(cityId: string) {
  const response = await fetch(`/api/showcase?city=${encodeURIComponent(cityId)}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("showcase_unavailable");
  const payload = await response.json() as Partial<PaidResult>;
  if (!Array.isArray(payload.placements)) throw new Error("showcase_invalid_response");
  if (cityId !== "all" && (!Number.isSafeInteger(payload.capacity) || Number(payload.capacity) < 1)) throw new Error("showcase_invalid_capacity");
  return { placements: payload.placements, capacity: cityId === "all" ? null : payload.capacity! };
}

type BrandDefinition = {
  id: string;
  tone: string;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  href: string;
  icon: typeof PackageOpen;
};

const brandDefinitions: BrandDefinition[] = [
  { id: "market", tone: "market", titleKey: "showcase.brand.market.title", descriptionKey: "showcase.brand.market.description", href: "/search", icon: PackageOpen },
  { id: "goods", tone: "goods", titleKey: "showcase.brand.goods.title", descriptionKey: "showcase.brand.goods.description", href: "/categories", icon: Store },
  { id: "auto", tone: "auto", titleKey: "showcase.brand.auto.title", descriptionKey: "showcase.brand.auto.description", href: "/category/transport", icon: CarFront },
  { id: "property", tone: "property", titleKey: "showcase.brand.property.title", descriptionKey: "showcase.brand.property.description", href: "/category/real-estate", icon: Building2 },
  { id: "jobs", tone: "jobs", titleKey: "showcase.brand.jobs.title", descriptionKey: "showcase.brand.jobs.description", href: "/category/jobs", icon: BriefcaseBusiness },
  { id: "services", tone: "services", titleKey: "showcase.brand.services.title", descriptionKey: "showcase.brand.services.description", href: "/category/services", icon: Wrench },
  { id: "rental", tone: "rental", titleKey: "showcase.brand.rental.title", descriptionKey: "showcase.brand.rental.description", href: "/category/goods-rental", icon: KeyRound },
  { id: "business", tone: "business", titleKey: "showcase.brand.business.title", descriptionKey: "showcase.brand.business.description", href: "/category/business", icon: Store },
  { id: "exchange", tone: "exchange", titleKey: "showcase.brand.exchange.title", descriptionKey: "showcase.brand.exchange.description", href: "/category/exchange", icon: RefreshCcw },
  { id: "free", tone: "free", titleKey: "showcase.brand.free.title", descriptionKey: "showcase.brand.free.description", href: "/category/free", icon: Gift },
];

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function CityPremiumShowcase({ initial }: { initial?: ShowcaseSnapshot }) {
  const hydrated = useSyncExternalStore(subscribeHydration, browserHydrated, serverHydrated);
  const { locale, t } = useI18n();
  const geography = useReferenceGeography();
  const ensureGeographyLoaded = geography.ensureLoaded;
  const selectedLocation = useStoredLocation(initial?.city ?? "all");
  const cityKey = selectedLocation === "all" ? "all-kazakhstan" : selectedLocation;
  const selectedCity = selectedLocation === "all" ? undefined : getSettlement(geography.data, selectedLocation);
  const [paidState, setPaidState] = useState<ShowcaseSnapshot>(initial ?? { city: "", items: [], capacity: null, status: "idle" });
  const [paidRetry, setPaidRetry] = useState(0);
  const initialSeen = useRef<ShowcaseSnapshot | undefined>(undefined);
  const [cacheScope, setCacheScope] = useState(() => ({ initial, cache: createPaidPlacementCache() }));
  if (cacheScope.initial !== initial) {
    setCacheScope({ initial, cache: createPaidPlacementCache() });
    if (initial) setPaidState(initial);
  }
  const paidPlacementCache = cacheScope.cache;
  const [expandedState, setExpandedState] = useState({ scope: cityKey, expanded: false });
  if (expandedState.scope !== cityKey) setExpandedState({ scope: cityKey, expanded: false });
  const viewAll = expandedState.scope === cityKey && expandedState.expanded;
  const { ref: showcaseRef, cardsPerPage, layoutReady } = useShowcaseWidth();
  const [imageState, setImageState] = useState<{ scope: string; images: Record<string, ShowcaseImageState> }>({ scope: cityKey, images: {} });
  if (imageState.scope !== cityKey) setImageState({ scope: cityKey, images: {} });
  const imageStates = imageState.scope === cityKey ? imageState.images : {};
  const imageSettled = useCallback((src: string, state: ShowcaseImageState) => {
    setImageState((previous) => {
      const images = previous.scope === cityKey ? previous.images : {};
      return images[src] === state ? previous : { scope: cityKey, images: { ...images, [src]: state } };
    });
  }, [cityKey]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const [deadlineNow, setDeadlineNow] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      setDeadlineNow(Date.now());
      const next = paidState.items.map((item) => Date.parse(item.expiresAt ?? "")).filter((date) => date > Date.now()).sort((a,b) => a-b)[0];
      if (next) timer = setTimeout(check, Math.min(next - Date.now(), 2147483647));
    };
    let active = true;
    queueMicrotask(() => { if (active) check(); });
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { active = false; clearTimeout(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [paidState]);

  useEffect(() => {
    if (selectedLocation === "all") return;
    ensureGeographyLoaded();
  }, [ensureGeographyLoaded, selectedLocation]);

  useEffect(() => {
    if (!hydrated) return;
    // Seed the existing short-lived cache once, without repeating the server read.
    const seed = initialSeen.current !== initial ? initial : undefined;
    initialSeen.current = initial;
    const useSeed = paidRetry === 0 && seed?.city === selectedLocation;
    if (useSeed && seed.status !== "ready") return;
    let active = true;
    void paidPlacementCache.getOrLoad(selectedLocation, () => useSeed
      ? Promise.resolve({ placements: seed.items, capacity: seed.capacity })
      : requestPaidPlacements(selectedLocation))
      .then((result) => { if (active) setPaidState({ city: selectedLocation, items: result.placements, capacity: result.capacity, status: "ready" }); })
      .catch(() => { if (active) setPaidState({ city: selectedLocation, items: [], capacity: null, status: "error" }); });
    return () => { active = false; };
  }, [hydrated, initial, paidPlacementCache, paidRetry, selectedLocation]);

  const paid = useMemo(
    () => paidState.city === selectedLocation && paidState.status === "ready" ? paidState.items.filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > deadlineNow) : [],
    [paidState, selectedLocation, deadlineNow],
  );
  const capacity = selectedLocation === "all" ? null : paidState.city === selectedLocation ? paidState.capacity ?? 0 : 0;
  const dataReady = paidState.city === selectedLocation && paidState.status === "ready";
  const carouselDemoCount = dataReady ? premiumDemoCount(paid.length, cardsPerPage) : 0;
  const expandedDemoCount = dataReady ? premiumExpandedDemoCount(paid.length, capacity, cardsPerPage) : 0;
  const items = useMemo(() => {
    const paidItems = paid.map((placement) => ({ kind: "paid" as const, ...placement, imageUrl: listingThumbnailUrl(placement.imageUrl) }));
    const brandedCount = Math.max(carouselDemoCount, expandedDemoCount);
    const offset = stableHash(cityKey) % brandDefinitions.length;
    const brandedItems = Array.from({ length: brandedCount }, (_, index) => {
      const definition = brandDefinitions[(offset + index) % brandDefinitions.length];
      return { kind: "brand" as const, ...definition, id: `${cityKey}-slot-${index}` };
    });
    return [...paidItems, ...brandedItems];
  }, [paid, cityKey, carouselDemoCount, expandedDemoCount]);
  const carouselItems = items.slice(0, paid.length + carouselDemoCount);

  const carousel = useShowcaseTimeline(Math.ceil(carouselItems.length / cardsPerPage), viewAll, cityKey + ":" + cardsPerPage);
  const targetPage = premiumCarouselPage(carouselItems, carousel.page, cardsPerPage);
  const isPageReady = (page: typeof targetPage) => dataReady && page.items.every((item) => item.kind !== "paid" || !item.imageUrl || imageStates[item.imageUrl]);
  const frameScope = cityKey + ":" + cardsPerPage + ":" + carouselItems.map((item) => item.id).join(",");
  const [lastFrame, setLastFrame] = useState({ scope: "", page: 0 });
  const targetReady = isPageReady(targetPage);
  // Keep decoded pixels visible when the absolute clock advances ahead of the network.
  // The clock is never paused/restarted; catch up to its current target as soon as ready.
  if (targetReady && (lastFrame.scope !== frameScope || lastFrame.page !== targetPage.pageIndex)) {
    setLastFrame({ scope: frameScope, page: targetPage.pageIndex });
  }
  const page = !targetReady && lastFrame.scope === frameScope
    ? premiumCarouselPage(carouselItems, lastFrame.page, cardsPerPage) : targetPage;
  const currentItems = new Set(page.items);
  const targetItems = new Set(targetPage.items);
  const pageReady = isPageReady(page);
  const prepared = premiumPreparedIndexes(carouselItems.length, targetPage.pageIndex, cardsPerPage);
  const initialLoading = !hydrated || !layoutReady || !pageReady;
  const moveToPage = carousel.selectPage;
  const paidLoading = paidState.city !== selectedLocation || paidState.status === "idle";
  const cityLabel = selectedCity ? localize(selectedCity.name, locale) : t("common.allKazakhstan");

  return <section
    ref={showcaseRef}
    style={{ "--showcase-columns": cardsPerPage, "--showcase-media-max": cardsPerPage > 2 ? "180px" : "240px" } as CSSProperties}
    data-layout-ready={layoutReady}
    data-four-pages={Math.max(1, Math.ceil(paid.length / 4))}
    data-cards-per-page={cardsPerPage}
    data-scope={selectedLocation}
    className={"city-premium-showcase" + (initialLoading && paidState.status !== "error" ? " showcase-initial-loading" : "")}
    aria-busy={initialLoading || undefined}
    data-loading-label={t("common.loading") + "…"}
    aria-label={t("showcase.aria")}
  >
    <div className="showcase-heading">
      <div className="showcase-heading-copy">
        <h1><Crown size={24} aria-hidden="true" />{t("showcase.title")}</h1>
        <p className="showcase-city"><MapPin size={16} aria-hidden="true" /><span>{cityLabel}</span></p>
        {dataReady ? <p className="showcase-status" role="status">{t(selectedLocation === "all" ? "showcase.nationalTotal" : "showcase.total", { count: paid.length, capacity: capacity ?? 0 })}</p> : <p className="showcase-status" aria-hidden="true">&nbsp;</p>}
      </div>
      <button className="showcase-view-all" type="button" aria-expanded={viewAll} aria-controls="city-premium-items" onClick={() => setExpandedState({ scope: cityKey, expanded: !viewAll })}>{t(viewAll ? "showcase.collapse" : "showcase.viewAll")}<ArrowRight size={16} aria-hidden="true" /></button>
    </div>
    {paidState.city === selectedLocation && paidState.status === "error" ? <div className="showcase-load-error" role="alert"><span>{t("state.errorNote")}</span><button type="button" onClick={() => setPaidRetry((value) => value + 1)}>{t("common.retry")}</button></div> : null}
    <div id="city-premium-items">
    {viewAll && selectedLocation === "all" ? <div className="showcase-status"><p>{t("showcase.chooseCity")}</p><LocationPicker allowAll={false} /></div> : null}
    {viewAll && paidLoading ? <p className="showcase-status" role="status">{t("common.loading")}…</p> : null}
    <div className="showcase-carousel-area">
    <div
      className={["showcase-grid", viewAll ? "showcase-grid-all" : !pageReady ? "showcase-grid-pending" : ""].filter(Boolean).join(" ")}
      role="group"
      aria-label={viewAll ? t("showcase.viewAll") : t("showcase.page", { page: page.pageIndex + 1, total: page.pageCount })}
      tabIndex={viewAll ? -1 : 0}
      onKeyDown={(event) => {
        if (viewAll || event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          moveToPage(page.pageIndex + (event.key === "ArrowLeft" ? -1 : 1));
        }
      }}
      onTouchStart={(event) => {
        suppressClickUntil.current = 0;
        const touch = event.touches[0];
        touchStart.current = !viewAll && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchCancel={() => { touchStart.current = null; }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        const touch = event.changedTouches[0];
        if (!start || !touch || viewAll || page.pageCount < 2) return;
        const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
        if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          suppressClickUntil.current = performance.now() + 400;
          moveToPage(page.pageIndex + (dx < 0 ? 1 : -1));
        }
      }}
      onClickCapture={(event) => {
        if (performance.now() < suppressClickUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {!dataReady ? <div className="showcase-size-reserve" aria-hidden="true"><div className="showcase-media listing-image-wrap" /><div className="showcase-card-copy"><strong /><b /><small /></div></div> : null}
      {items.map((item, index) => {
        const visible = viewAll ? index < paid.length + expandedDemoCount : currentItems.has(item);
        const pending = item.kind === "paid" && Boolean(item.imageUrl) && !imageStates[item.imageUrl!];
        if (item.kind === "paid") {
          const price = item.priceMinor === null ? t("listing.negotiable") : `${item.priceMinor.toLocaleString(localeTag(locale))} ${item.currencyCode === "KZT" ? "₸" : item.currencyCode}`;
          return <Link hidden={!visible} aria-busy={pending || undefined} className="showcase-card showcase-paid-card" href={`/listing/${item.listingId}-${item.slug}`} key={item.kind + "-" + item.id}>
            <span className="showcase-badge"><Crown size={13} aria-hidden="true" /> {t("showcase.premium")}</span>
            <div className="showcase-media listing-image-wrap">
              <span className="listing-placeholder" aria-hidden="true"><PackageOpen size={42} /></span>
              {item.imageUrl ? <ShowcaseImage key={item.imageUrl} src={item.imageUrl} prepare={!viewAll && prepared.has(index)} expanded={viewAll} current={!viewAll && targetItems.has(item)} onSettled={imageSettled} /> : null}
            </div>
            <div className="showcase-card-copy"><strong>{item.title}</strong><b>{price}</b><small><MapPin size={13} /><span>{locale === "kk" ? item.locationKk : item.locationRu}</span></small></div>
          </Link>;
        }
        const Icon = item.icon;
        return <CategoryLink hidden={!visible} cityId={selectedLocation} className={`showcase-card showcase-brand-card showcase-tone-${item.tone}`} href={item.href} key={item.kind + "-" + item.id}>
          <span className="showcase-badge">JEVU</span>
          <div className="showcase-demo-media"><span className="showcase-brand-icon"><Icon size={34} /></span></div>
          <div className="showcase-card-copy"><strong>{t(item.titleKey)}</strong><p>{t(item.descriptionKey)}</p><small><span>{t("showcase.open")}</span><ArrowRight size={13} /></small></div>
        </CategoryLink>;
      })}
    </div>
    {!viewAll && page.pageCount > 1 ? <>
      <button type="button" className="showcase-arrow showcase-arrow-prev" aria-label={t("showcase.previous")} aria-controls="city-premium-items" onClick={() => moveToPage(page.pageIndex - 1)}><ChevronLeft size={22} aria-hidden="true" /></button>
      <button type="button" className="showcase-arrow showcase-arrow-next" aria-label={t("showcase.next")} aria-controls="city-premium-items" onClick={() => moveToPage(page.pageIndex + 1)}><ChevronRight size={22} aria-hidden="true" /></button>
    </> : null}
    </div>
    {!viewAll && page.pageCount > 1 ? <div className="showcase-dots" role="group" aria-label={t("showcase.pages")}>
      {Array.from({ length: page.pageCount }, (_, index) => <button key={index} type="button" aria-label={t("showcase.page", { page: index + 1, total: page.pageCount })} aria-current={index === page.pageIndex ? "true" : undefined} aria-controls="city-premium-items" onClick={() => moveToPage(index)}><span /></button>)}
    </div> : null}
    {!viewAll ? <span className="sr-only" aria-live="polite" aria-atomic="true">{t("showcase.page", { page: page.pageIndex + 1, total: page.pageCount })}</span> : null}
    </div>
  </section>;
}
