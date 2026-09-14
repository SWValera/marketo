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
  Star,
  Store,
  Wrench,
} from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { CategoryLink } from "@/components/category-link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/components/i18n-provider";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { useReferenceGeography } from "@/components/reference-geography-provider";
import { localize, localeTag } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { createSingleFlightTtlCache } from "@/lib/reference-data/cache";
import { getSettlement } from "@/lib/reference-data/geography";
import { useShowcaseTimeline } from "@/components/use-showcase-timeline";
import { premiumCarouselPage, premiumDemoCount, premiumPreparedIndexes } from "@/lib/premium-showcase-presentation";

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

const paidPlacementCache = createSingleFlightTtlCache<string, PaidPlacement[]>({
  maxEntries: 20,
  ttlMilliseconds: () => 60 * 1000,
});

async function requestPaidPlacements(cityId: string) {
  const response = await fetch(`/api/showcase?city=${encodeURIComponent(cityId)}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("showcase_unavailable");
  const payload = await response.json() as { placements?: PaidPlacement[] };
  if (!Array.isArray(payload.placements)) throw new Error("showcase_invalid_response");
  return payload.placements;
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

export function CityPremiumShowcase() {
  const { locale, t } = useI18n();
  const geography = useReferenceGeography();
  const ensureGeographyLoaded = geography.ensureLoaded;
  const selectedLocation = useStoredLocation();
  const cityKey = selectedLocation === "all" ? "all-kazakhstan" : selectedLocation;
  const selectedCity = selectedLocation === "all" ? undefined : getSettlement(geography.data, selectedLocation);
  const [paidState, setPaidState] = useState<{ city: string; items: PaidPlacement[]; status: "idle" | "ready" | "error" }>({ city: "", items: [], status: "idle" });
  const [paidRetry, setPaidRetry] = useState(0);
  const [viewAll, setViewAll] = useState(false);
  const { ref: showcaseRef, cardsPerPage } = useShowcaseWidth();
  const [imageStates, setImageStates] = useState<Record<string, ShowcaseImageState>>({});
  const imageSettled = useCallback((src: string, state: ShowcaseImageState) => {
    setImageStates((previous) => previous[src] === state ? previous : { ...previous, [src]: state });
  }, []);
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
    if (selectedLocation === "all") return;
    let active = true;
    void paidPlacementCache.getOrLoad(selectedLocation, () => requestPaidPlacements(selectedLocation))
      .then((items) => { if (active) setPaidState({ city: selectedLocation, items, status: "ready" }); })
      .catch(() => { if (active) setPaidState({ city: selectedLocation, items: [], status: "error" }); });
    return () => { active = false; };
  }, [paidRetry, selectedLocation]);

  const paid = useMemo(
    () => paidState.city === selectedLocation && paidState.status === "ready" ? paidState.items.filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > deadlineNow) : [],
    [paidState, selectedLocation, deadlineNow],
  );
  const items = useMemo(() => {
    const paidItems = paid.map((placement) => ({ kind: "paid" as const, ...placement, imageUrl: listingThumbnailUrl(placement.imageUrl) }));
    const brandedCount = premiumDemoCount(paidItems.length);
    const offset = stableHash(cityKey) % brandDefinitions.length;
    const brandedItems = Array.from({ length: brandedCount }, (_, index) => {
      const definition = brandDefinitions[(offset + index) % brandDefinitions.length];
      return { kind: "brand" as const, ...definition };
    });
    return [...paidItems, ...brandedItems];
  }, [paid, cityKey]);

  const carousel = useShowcaseTimeline(Math.ceil(items.length / cardsPerPage), viewAll, cityKey + ":" + cardsPerPage);
  const page = premiumCarouselPage(items, carousel.page, cardsPerPage);
  const currentItems = new Set(page.items);
  const prepared = premiumPreparedIndexes(items.length, page.pageIndex, cardsPerPage);
  const pageReady = page.items.every((item) => item.kind !== "paid" || !item.imageUrl || imageStates[item.imageUrl]);
  const moveToPage = carousel.selectPage;
  const paidLoading = selectedLocation !== "all" && (paidState.city !== selectedLocation || paidState.status === "idle");
  const cityLabel = selectedCity ? localize(selectedCity.name, locale) : t("common.allKazakhstan");

  return <section
    ref={showcaseRef}
    style={{ "--showcase-columns": cardsPerPage, "--showcase-media-max": cardsPerPage > 2 ? "180px" : "240px" } as CSSProperties}
    data-cards-per-page={cardsPerPage}
    className="city-premium-showcase"
    aria-label={t("showcase.aria")}
  >
    <div className="showcase-heading">
      <div className="showcase-heading-copy">
        <h1><Crown size={24} aria-hidden="true" />{t("showcase.title")}</h1>
        <p className="showcase-city"><MapPin size={16} aria-hidden="true" /><span>{cityLabel}</span></p>
        {selectedLocation !== "all" && paidState.city === selectedLocation && paidState.status === "ready" ? <p className="showcase-status" role="status">{t("showcase.total", { count: paid.length })}</p> : null}
      </div>
      <button className="secondary-button showcase-view-all" type="button" aria-expanded={viewAll} aria-controls="city-premium-items" onClick={() => setViewAll((value) => !value)}>{t(viewAll ? "showcase.collapse" : "showcase.viewAll")}<ArrowRight size={16} aria-hidden="true" /></button>
    </div>
    {selectedLocation !== "all" && paidState.city === selectedLocation && paidState.status === "error" ? <div className="showcase-load-error" role="alert"><span>{t("state.errorNote")}</span><button type="button" onClick={() => setPaidRetry((value) => value + 1)}>{t("common.retry")}</button></div> : null}
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
      {items.map((item, index) => {
        const visible = viewAll || currentItems.has(item);
        const pending = item.kind === "paid" && Boolean(item.imageUrl) && !imageStates[item.imageUrl!];
        if (item.kind === "paid") {
          const price = item.priceMinor === null ? t("listing.negotiable") : `${item.priceMinor.toLocaleString(localeTag(locale))} ${item.currencyCode === "KZT" ? "₸" : item.currencyCode}`;
          return <Link hidden={!visible} aria-busy={pending || undefined} className="showcase-card showcase-paid-card" href={`/listing/${item.listingId}-${item.slug}`} key={item.kind + "-" + item.id}>
            <span className="showcase-badge"><Star size={13} /> {t("showcase.premium")}</span>
            <div className="showcase-media listing-image-wrap">
              <span className="listing-placeholder" aria-hidden="true"><PackageOpen size={42} /></span>
              {item.imageUrl ? <ShowcaseImage key={item.imageUrl} src={item.imageUrl} prepare={!viewAll && prepared.has(index)} expanded={viewAll} current={!viewAll && currentItems.has(item)} onSettled={imageSettled} /> : null}
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
