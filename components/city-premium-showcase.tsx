/* eslint-disable @next/next/no-img-element */
"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CarFront,
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
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { useReferenceGeography } from "@/components/reference-geography-provider";
import { localize, localeTag } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { createSingleFlightTtlCache } from "@/lib/reference-data/cache";
import { getSettlement } from "@/lib/reference-data/geography";

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
    const paidItems = paid.map((placement) => ({ kind: "paid" as const, ...placement }));
    const brandedCount = Math.max(0, 3 - paidItems.length);
    const offset = stableHash(cityKey) % brandDefinitions.length;
    const brandedItems = Array.from({ length: brandedCount }, (_, index) => {
      const definition = brandDefinitions[(offset + index) % brandDefinitions.length];
      return { kind: "brand" as const, ...definition };
    });
    return [...paidItems, ...brandedItems];
  }, [paid, cityKey]);

  const visible = items.slice(0, 3);
  const displayed = viewAll ? paid.map((placement) => ({ kind: "paid" as const, ...placement })) : visible;
  const paidLoading = selectedLocation !== "all" && (paidState.city !== selectedLocation || paidState.status === "idle");
  const cityLabel = selectedCity ? localize(selectedCity.name, locale) : t("common.allKazakhstan");

  return <section
    className="city-premium-showcase"
    aria-label={t("showcase.aria")}
  >
    <div className="showcase-heading">
      <h1>{t("showcase.title")}</h1>
      <div className="showcase-city-row">
        <p className="showcase-city"><MapPin size={18} aria-hidden="true" /><span>{cityLabel}</span></p>
        <button className="secondary-button showcase-view-all" type="button" aria-expanded={viewAll} aria-controls="city-premium-items" onClick={() => setViewAll((value) => !value)}>{t(viewAll ? "showcase.collapse" : "showcase.viewAll")}</button>
      </div>
    </div>
    {selectedLocation !== "all" && paidState.city === selectedLocation && paidState.status === "error" ? <div className="showcase-load-error" role="alert"><span>{t("state.errorNote")}</span><button type="button" onClick={() => setPaidRetry((value) => value + 1)}>{t("common.retry")}</button></div> : null}
    <div id="city-premium-items">
    {viewAll && selectedLocation === "all" ? <div className="showcase-status"><p>{t("showcase.chooseCity")}</p><LocationPicker allowAll={false} /></div> : null}
    {viewAll && paidLoading ? <p className="showcase-status" role="status">{t("common.loading")}…</p> : null}
    {viewAll && selectedLocation !== "all" && paidState.city === selectedLocation && paidState.status === "ready" ? <p className="showcase-status" role="status">{t(paid.length ? "showcase.total" : "showcase.empty", { count: paid.length })}</p> : null}
    <div className={["showcase-grid", viewAll ? "showcase-grid-all" : ""].filter(Boolean).join(" ")} aria-live="off">
      {displayed.map((item, slot) => {
        if (item.kind === "paid") {
          const price = item.priceMinor === null ? t("listing.negotiable") : `${item.priceMinor.toLocaleString(localeTag(locale))} ${item.currencyCode === "KZT" ? "₸" : item.currencyCode}`;
          return <Link className="showcase-card showcase-paid-card" href={`/listing/${item.listingId}-${item.slug}`} key={`${slot}-${item.id}`}>
            <span className="showcase-badge"><Star size={13} /> {t("showcase.premium")}</span>
            <div className="showcase-media">{item.imageUrl ? <img src={item.imageUrl} alt="" decoding="async" /> : <Star size={42} />}</div>
            <div className="showcase-card-copy"><strong>{item.title}</strong><b>{price}</b><small><MapPin size={13} /> {locale === "kk" ? item.locationKk : item.locationRu}</small></div>
          </Link>;
        }
        const Icon = item.icon;
        return <CategoryLink cityId={selectedLocation} className={`showcase-card showcase-brand-card showcase-tone-${item.tone}`} href={item.href} key={`${slot}-${item.id}`}>
          <span className="showcase-badge">Marketo</span>
          <span className="showcase-brand-icon"><Icon size={34} /></span>
          <div className="showcase-card-copy"><strong>{t(item.titleKey)}</strong><p>{t(item.descriptionKey)}</p><small>{t("showcase.open")} <ArrowRight size={13} /></small></div>
        </CategoryLink>;
      })}
    </div>
    </div>
  </section>;
}
