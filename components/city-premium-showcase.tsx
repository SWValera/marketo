/* eslint-disable @next/next/no-img-element */
"use client";

import {
  ArrowLeft,
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
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useStoredLocation } from "@/components/location-picker";
import { useReferenceGeography } from "@/components/reference-geography-provider";
import { useShowcaseTimeline } from "@/components/use-showcase-timeline";
import { localize, localeTag } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { getSettlement } from "@/lib/reference-data/geography";
import { rotationIndexAt } from "@/lib/showcase-rotation";

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
};

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

const rotationOffsets = new Map<string, number>();
const loadedRotationOffsetKeys = new Set<string>();
const rotationOffsetListeners = new Set<() => void>();
const ROTATION_OFFSET_COOKIE = "marketo-showcase-offset-v2";

function rotationOffsetStorageKey(key: string) {
  return `marketo-showcase-offset-v2:${key}`;
}

function readRotationOffsetCookie(key: string) {
  if (typeof document === "undefined") return undefined;
  const encoded = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${ROTATION_OFFSET_COOKIE}=`))
    ?.slice(ROTATION_OFFSET_COOKIE.length + 1);
  if (!encoded) return undefined;
  try {
    const [storedKey, storedValue] = JSON.parse(decodeURIComponent(encoded)) as [unknown, unknown];
    return storedKey === key && typeof storedValue === "number" && Number.isSafeInteger(storedValue) && storedValue >= 0
      ? storedValue
      : undefined;
  } catch {
    return undefined;
  }
}

function readRotationOffset(key: string) {
  if (typeof window !== "undefined" && !loadedRotationOffsetKeys.has(key)) {
    loadedRotationOffsetKeys.add(key);
    const storageKey = rotationOffsetStorageKey(key);
    const stored = readRotationOffsetCookie(key)
      ?? Number(window.localStorage.getItem(storageKey) ?? window.sessionStorage.getItem(storageKey) ?? 0);
    rotationOffsets.set(key, Number.isSafeInteger(stored) && stored >= 0 ? stored : 0);
  }
  return rotationOffsets.get(key) ?? 0;
}

function writeRotationOffset(key: string, value: number) {
  rotationOffsets.set(key, value);
  if (typeof window !== "undefined") {
    const storageKey = rotationOffsetStorageKey(key);
    // localStorage survives the full document refresh used by some RSC
    // runtimes for locale changes; the compact cookie is a fallback for
    // privacy modes that clear Web Storage on a document navigation.
    window.localStorage.setItem(storageKey, String(value));
    window.sessionStorage.setItem(storageKey, String(value));
    document.cookie = `${ROTATION_OFFSET_COOKIE}=${encodeURIComponent(JSON.stringify([key, value]))}; Path=/; Max-Age=2592000; SameSite=Lax`;
  }
  for (const listener of rotationOffsetListeners) listener();
}

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
  const selectedLocation = useStoredLocation();
  const rotationKey = selectedLocation === "all" ? "all-kazakhstan" : selectedLocation;
  const selectedCity = selectedLocation === "all" ? undefined : getSettlement(geography.data, selectedLocation);
  const [paidState, setPaidState] = useState<{ city: string; items: PaidPlacement[] }>({ city: "", items: [] });

  useEffect(() => {
    if (selectedLocation === "all") return;
    const controller = new AbortController();
    fetch(`/api/showcase?city=${encodeURIComponent(selectedLocation)}`, { signal: controller.signal, headers: { accept: "application/json" } })
      .then(async (response) => response.ok ? response.json() as Promise<{ placements?: PaidPlacement[] }> : { placements: [] })
      .then((payload) => setPaidState({ city: selectedLocation, items: payload.placements ?? [] }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [selectedLocation]);

  const paid = useMemo(
    () => paidState.city === selectedLocation ? paidState.items : [],
    [paidState, selectedLocation],
  );
  const items = useMemo(() => {
    const paidItems = paid.map((placement) => ({ kind: "paid" as const, ...placement }));
    const brandedCount = paidItems.length < 6 ? 6 - paidItems.length : 0;
    const offset = stableHash(rotationKey) % brandDefinitions.length;
    const brandedItems = Array.from({ length: brandedCount }, (_, index) => {
      const definition = brandDefinitions[(offset + index) % brandDefinitions.length];
      return { kind: "brand" as const, ...definition };
    });
    return [...paidItems, ...brandedItems];
  }, [paid, rotationKey]);

  const subscribe = useCallback((listener: () => void) => {
    rotationOffsetListeners.add(listener);
    return () => rotationOffsetListeners.delete(listener);
  }, []);
  const getSnapshot = useCallback(() => readRotationOffset(rotationKey), [rotationKey]);
  // During an RSC refresh React asks for the server snapshot again in the
  // existing browser runtime. Reuse the in-memory value so a locale refresh
  // cannot replace a running carousel with index zero.
  const getServerSnapshot = useCallback(() => rotationOffsets.get(rotationKey) ?? 0, [rotationKey]);
  const persistedOffset = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const timelineFrame = useShowcaseTimeline(items.length < 2);
  const activeIndex = rotationIndexAt(timelineFrame, items.length, persistedOffset);
  const advance = useCallback((delta: number) => {
    if (items.length < 2) return;
    const currentOffset = readRotationOffset(rotationKey) % items.length;
    writeRotationOffset(rotationKey, (currentOffset + delta + items.length) % items.length);
  }, [items.length, rotationKey]);

  const visible = Array.from({ length: 3 }, (_, slot) => items[(activeIndex + slot) % items.length]).filter(Boolean);
  const cityLabel = selectedCity ? localize(selectedCity.name, locale) : t("common.allKazakhstan");

  return <section
    className="city-premium-showcase"
    aria-roledescription="carousel"
    aria-label={t("showcase.aria")}
  >
    <div className="showcase-heading">
      <div><span className="section-kicker">{t("showcase.eyebrow")}</span><h1>{t("showcase.title")}</h1><p><MapPin size={15} /> {cityLabel} · {t("showcase.activeOnly")}</p></div>
      <div className="showcase-controls">
        <button type="button" onClick={() => advance(-1)} aria-label={t("showcase.previous")}><ArrowLeft size={19} /></button>
        <span>{items.length ? `${activeIndex + 1} / ${items.length}` : ""}</span>
        <button type="button" onClick={() => advance(1)} aria-label={t("showcase.next")}><ArrowRight size={19} /></button>
      </div>
    </div>
    <div className="showcase-grid" aria-live="off">
      {visible.map((item, slot) => {
        if (item.kind === "paid") {
          const price = item.priceMinor === null ? t("listing.negotiable") : `${item.priceMinor.toLocaleString(localeTag(locale))} ${item.currencyCode === "KZT" ? "₸" : item.currencyCode}`;
          return <Link className="showcase-card showcase-paid-card" href={`/listing/${item.listingId}-${item.slug}`} key={`${slot}-${item.id}`}>
            <span className="showcase-badge"><Star size={13} /> {t("showcase.premium")}</span>
            <div className="showcase-media">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Star size={42} />}</div>
            <div className="showcase-card-copy"><strong>{item.title}</strong><b>{price}</b><small><MapPin size={13} /> {locale === "kk" ? item.locationKk : item.locationRu}</small></div>
          </Link>;
        }
        const Icon = item.icon;
        return <Link className={`showcase-card showcase-brand-card showcase-tone-${item.tone}`} href={item.href} key={`${slot}-${item.id}`}>
          <span className="showcase-badge">Marketo</span>
          <span className="showcase-brand-icon"><Icon size={34} /></span>
          <div className="showcase-card-copy"><strong>{t(item.titleKey)}</strong><p>{t(item.descriptionKey)}</p><small>{t("showcase.open")} <ArrowRight size={13} /></small></div>
        </Link>;
      })}
    </div>
  </section>;
}
