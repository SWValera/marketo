"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AppLink as Link } from "@/components/app-link";
import { CategoryCascade } from "@/components/category-cascade";
import { EmptyState } from "@/components/empty-state";
import { ListingCard } from "@/components/listing-card";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import { useReferenceGeography } from "@/components/reference-geography-provider";
import { useCategoryAttributes } from "@/components/use-category-attributes";
import { ReferenceSelect } from "@/components/reference-select";
import {
  createCategoryCatalogView,
  getCategoryBySlug,
  getCategoryPath,
  getCategoryPresentation,
  getCategoryRoot,
  isCategoryWithin,
} from "@/lib/reference-data/catalog";
import type { ListingSummary } from "@/lib/data/types";
import { readListingAttributePreview } from "@/lib/data/listing-filter-preview";
import { getSettlement } from "@/lib/reference-data/geography";
import type {
  CategoryAttributeReferenceData,
  CategoryReferenceData,
  LocalizedText,
  ReferenceDataEnvelope,
} from "@/lib/reference-data/types";
import { EMPTY_CATEGORIES } from "@/lib/reference-data/types";
import { useI18n } from "@/components/i18n-provider";
import { localeTag, localize } from "@/lib/i18n/config";
import {
  clearDependentValues,
  getDependentParentOptionId,
  isAttributeVisible,
} from "@/lib/reference-data/attributes";

type FilterValue = string;
type CatalogRouteState = {
  query: string;
  categorySlug: string;
  cityId: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  dynamicFilters: Record<string, FilterValue>;
  page: number;
};

const MOBILE_FILTER_QUERY = "(max-width: 900px)";

function subscribeToMobileFilters(callback: () => void) {
  const query = window.matchMedia(MOBILE_FILTER_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function mobileFiltersSnapshot() {
  return window.matchMedia(MOBILE_FILTER_QUERY).matches;
}

const EMPTY_CATALOG: ReferenceDataEnvelope<CategoryReferenceData> = {
  status: "unconfigured",
  data: EMPTY_CATEGORIES,
  reason: "missing_configuration",
};

export function CatalogClient({
  initialQuery = "",
  initialCategorySlug = "",
  initialCityId,
  initialMinPrice = "",
  initialMaxPrice = "",
  initialSort = "new",
  initialDynamicFilters = {},
  initialCategoryAttributes,
  title,
  titleText,
  initialListings = [],
  initialTotal = initialListings.length,
  initialPage = 1,
  initialTotalPages = initialTotal === 0 ? 0 : 1,
  initialState = initialTotal === 0 ? "empty" : "ready",
  basePath = "/search",
  fallback = "/",
}: {
  initialQuery?: string;
  initialCategorySlug?: string;
  initialCityId?: string;
  initialMinPrice?: string;
  initialMaxPrice?: string;
  initialSort?: string;
  initialDynamicFilters?: Record<string, FilterValue>;
  initialCategoryAttributes?: ReferenceDataEnvelope<CategoryAttributeReferenceData>;
  title?: string;
  titleText?: LocalizedText;
  initialListings?: ListingSummary[];
  initialTotal?: number;
  initialPage?: number;
  initialTotalPages?: number;
  initialState?: "ready" | "empty" | "out_of_range";
  basePath?: string;
  fallback?: string;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const geography = useReferenceGeography();
  const ensureGeographyLoaded = geography.ensureLoaded;
  const [catalog, setCatalog] = useState<ReferenceDataEnvelope<CategoryReferenceData>>(EMPTY_CATALOG);
  const catalogView = useMemo(() => createCategoryCatalogView(catalog.data), [catalog.data]);
  const [query, setQuery] = useState(initialQuery);
  const [categorySlug, setCategorySlug] = useState(initialCategorySlug);
  const storedLocation = useStoredLocation();
  const [cityOverride, setCityOverride] = useState<string>(() => initialCityId ?? "all");
  const cityId = cityOverride;
  const [minPrice, setMinPrice] = useState(initialMinPrice);
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice);
  const [sort, setSort] = useState(initialSort);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersPanelRef = useRef<HTMLElement>(null);
  const mobileFilters = useSyncExternalStore(subscribeToMobileFilters, mobileFiltersSnapshot, () => false);
  const [dynamicFilters, setDynamicFilters] = useState<Record<string, FilterValue>>(initialDynamicFilters);
  const city = getSettlement(geography.data, cityId);
  const activeCategory = getCategoryBySlug(catalogView, categorySlug);
  const activeRoot = getCategoryRoot(catalogView, categorySlug);
  const attributeState = useCategoryAttributes(activeCategory?.id, initialCategoryAttributes);
  const activeAttributes = useMemo(
    () => attributeState.data.attributes.filter((attribute) => attribute.filterable && isAttributeVisible(attribute, dynamicFilters)),
    [attributeState.data.attributes, dynamicFilters],
  );
  const activePresentation = getCategoryPresentation(catalogView, categorySlug);
  const activePlaceholder = localize(activePresentation.searchPlaceholder ?? activeRoot?.searchPlaceholder, locale) || t("header.searchPlaceholder");

  useEffect(() => {
    let active = true;
    void import("@/lib/reference-data/browser")
      .then(({ loadBrowserCategoryReferences }) => loadBrowserCategoryReferences())
      .then((value) => { if (active) setCatalog(value); })
      .catch(() => {
        if (active) setCatalog({ status: "error", data: EMPTY_CATEGORIES, reason: "query_failed" });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if ((initialCityId && initialCityId !== "all") || storedLocation !== "all") ensureGeographyLoaded();
  }, [ensureGeographyLoaded, initialCityId, storedLocation]);

  useEffect(() => {
    if (initialCityId !== undefined || storedLocation === "all") return;
    const params = new URLSearchParams(window.location.search);
    params.set("city", storedLocation);
    params.delete("page");
    router.replace(`${basePath}?${params}`, { scroll: false });
  }, [basePath, initialCityId, router, storedLocation]);

  const result = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    const filterDefinitions = new Map(activeAttributes.map((attribute) => [attribute.key, attribute]));
    return initialListings
      // The server search also matches description/search_document, which cards do
      // not expose. Keep applied server results authoritative; only preview a
      // newly edited query locally before the user applies it.
      .filter((item) => query === initialQuery || !normalizedQuery || `${item.title} ${item.locationLabel}`.toLocaleLowerCase("ru").includes(normalizedQuery))
      .filter((item) => catalog.status !== "ready" || isCategoryWithin(catalogView, item.categorySlug, categorySlug))
      .filter((item) => cityId === "all" || item.cityId === cityId)
      .filter((item) => !minPrice || (item.priceAmount ?? 0) >= Number(minPrice))
      .filter((item) => !maxPrice || (item.priceAmount ?? 0) <= Number(maxPrice))
      .filter((item) => Object.entries(dynamicFilters).every(([key, value]) => {
        if (value === "") return true;
        const rangeMatch = key.match(/^(.*)_(min|max)$/);
        const attributeKey = rangeMatch?.[1] ?? key;
        const preview = readListingAttributePreview(item.attributes, attributeKey);
        if (!preview.known) {
          // Unapplied filters are only a client-side preview. Cards intentionally
          // omit attribute hydration on the fast path, so unknown values must
          // remain visible until the authoritative server query is submitted.
          return true;
        }
        const listingValue = preview.value;
        if (rangeMatch) {
          const candidate = Number(listingValue);
          const boundary = Number(value);
          return Number.isFinite(candidate) && (rangeMatch[2] === "min" ? candidate >= boundary : candidate <= boundary);
        }
        const definition = filterDefinitions.get(attributeKey);
        if (definition?.dataType === "boolean") return listingValue === (value === "true");
        if (definition?.filterMode === "search" || definition?.dataType === "text") return String(listingValue ?? "").toLocaleLowerCase("ru").includes(String(value).toLocaleLowerCase("ru"));
        if (definition?.dataType === "number") return Number(listingValue) === Number(value);
        return String(listingValue ?? "") === String(value);
      }))
      .sort((a, b) => {
        if (sort === "cheap" || sort === "expensive") {
          if (a.priceAmount === null) return b.priceAmount === null ? 0 : 1;
          if (b.priceAmount === null) return -1;
          return sort === "cheap" ? a.priceAmount - b.priceAmount : b.priceAmount - a.priceAmount;
        }
        return Number(b.promoted) - Number(a.promoted);
      });
  }, [activeAttributes, catalog.status, catalogView, categorySlug, cityId, dynamicFilters, initialListings, initialQuery, maxPrice, minPrice, query, sort]);

  function filterUrl(overrides: Partial<CatalogRouteState> = {}) {
    const routeState: CatalogRouteState = {
      query,
      categorySlug,
      cityId,
      minPrice,
      maxPrice,
      sort,
      dynamicFilters,
      page: 1,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (routeState.query) params.set("q", routeState.query);
    if (routeState.categorySlug) params.set("category", routeState.categorySlug);
    if (routeState.cityId !== "all") params.set("city", routeState.cityId);
    if (routeState.minPrice) params.set("price_min", routeState.minPrice);
    if (routeState.maxPrice) params.set("price_max", routeState.maxPrice);
    if (routeState.sort !== "new") params.set("sort", routeState.sort);
    if (routeState.page > 1) params.set("page", String(routeState.page));
    for (const [key, value] of Object.entries(routeState.dynamicFilters)) if (value !== "") params.set(`f_${key}`, value);
    return `${basePath}${params.size ? `?${params}` : ""}`;
  }

  function navigateWithFilters(overrides: Partial<CatalogRouteState> = {}) {
    const nextUrl = filterUrl(overrides);
    setFiltersOpen(false);
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }

  function applyFilters() {
    navigateWithFilters();
  }

  useEffect(() => {
    if (!filtersOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = filtersPanelRef.current;
    panel?.querySelector<HTMLElement>("input, select, button, [href]")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
      previousFocus?.focus();
    };
  }, [filtersOpen]);

  function changeCategory(slug: string) {
    setCategorySlug(slug);
    setDynamicFilters({});
  }

  function resetFilters() {
    setQuery("");
    setCategorySlug(initialCategorySlug);
    setCityOverride("all");
    setMinPrice("");
    setMaxPrice("");
    setSort("new");
    setDynamicFilters({});
    navigateWithFilters({
      query: "",
      categorySlug: initialCategorySlug,
      cityId: "all",
      minPrice: "",
      maxPrice: "",
      sort: "new",
      dynamicFilters: {},
    });
  }

  const activeChips = [
    activeCategory ? getCategoryPath(catalogView, activeCategory).map((item) => localize(item.name, locale)).join(" → ") : null,
    city ? localize(city.name, locale) : null,
    minPrice ? `${t("catalog.from")} ${Number(minPrice).toLocaleString(localeTag(locale))} ₸` : null,
    maxPrice ? `${t("catalog.to")} ${Number(maxPrice).toLocaleString(localeTag(locale))} ₸` : null,
    ...Object.entries(dynamicFilters).filter(([, value]) => Boolean(value)).map(([key, value]) => {
      const rangeMatch = key.match(/^(.*)_(min|max)$/);
      const filter = activeAttributes.find((item) => item.key === (rangeMatch?.[1] ?? key));
      const option = filter?.options?.find((item) => item.value === value);
      const rangeLabel = rangeMatch?.[2] === "min" ? t("catalog.from") : rangeMatch?.[2] === "max" ? t("catalog.to") : "";
      const displayValue = filter?.dataType === "boolean"
        ? value === "true" ? t("common.yes") : t("common.no")
        : value;
      return option ? localize(option.label, locale) : filter ? `${localize(filter.label, locale)}${rangeLabel ? ` ${rangeLabel}` : ""}: ${displayValue}` : null;
    }),
  ].filter(Boolean) as string[];

  const pageTitle = activeCategory ? localize(activeCategory.name, locale) : titleText ? localize(titleText, locale) : title ?? t("catalog.allListings");

  return <>
    <div inert={mobileFilters && filtersOpen || undefined}><PageHeader fallback={fallback} eyebrow={t("categories.eyebrow")} title={pageTitle} description={`${initialTotal} ${t("catalog.listings")} · ${city ? localize(city.name, locale) : t("catalog.wholeCountry")}`} /></div>
    <div className="catalog-layout">
      <button className="filter-mobile-toggle" type="button" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>
        <SlidersHorizontal size={18} /> {t("catalog.filters")} {activeChips.length > 0 && <b>{activeChips.length}</b>}
      </button>
      {filtersOpen ? <button className="filters-overlay" type="button" onClick={() => setFiltersOpen(false)} aria-label={t("catalog.closeFilters")} /> : null}
      <aside ref={filtersPanelRef} className={`filters-panel ${filtersOpen ? "is-open" : ""}`} aria-label={t("catalog.filters")} role={filtersOpen ? "dialog" : undefined} aria-modal={filtersOpen || undefined} hidden={mobileFilters && !filtersOpen}>
        <div className="filters-title"><div><strong>{t("catalog.filters")}</strong><small>{t("catalog.filterHint")}</small></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label={t("catalog.closeFilters")}><X size={21} /></button></div>
        <label>{t("common.search")}<span className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyFilters(); }} placeholder={activePlaceholder} /></span></label>
        <CategoryCascade value={categorySlug} onChange={changeCategory} catalog={catalog} />
        <div className="filter-location"><span>{t("catalog.location")}</span><LocationPicker value={cityId} onChange={setCityOverride} /></div>
        <div className="price-fields"><label>{t("catalog.priceFrom")}<input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ""))} placeholder="0" /></label><label>{t("catalog.to")}<input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))} placeholder="15 000 000" /></label></div>
        {attributeState.status === "loading" ? <p className="filter-reference-state">{t("reference.attributesLoading")}</p> : null}
        {attributeState.status === "error" ? <p className="filter-reference-state is-error">{t("reference.attributesUnavailable")}</p> : null}
        {activeAttributes.map((attribute) => {
          if (attribute.dataType === "select" || attribute.dataType === "multiselect") {
            return <label key={attribute.id}>{localize(attribute.label, locale)}<ReferenceSelect attribute={attribute} emptyMode="filter" value={String(dynamicFilters[attribute.key] ?? "")} parentOptionId={getDependentParentOptionId(attribute, attributeState.data.attributes, dynamicFilters)} onChange={(value) => setDynamicFilters((current) => clearDependentValues(attribute.key, value, attributeState.data.attributes, current))} /></label>;
          }
          if (attribute.dataType === "boolean") {
            return <label key={attribute.id}>{localize(attribute.label, locale)}<select value={dynamicFilters[attribute.key] ?? ""} onChange={(event) => setDynamicFilters((current) => clearDependentValues(attribute.key, event.target.value, attributeState.data.attributes, current))}><option value="">{t("common.notImportant")}</option><option value="true">{t("common.yes")}</option><option value="false">{t("common.no")}</option></select></label>;
          }
          if (attribute.filterMode === "range") {
            return <fieldset className="attribute-range-filter" key={attribute.id}><legend>{localize(attribute.label, locale)}{attribute.unit ? `, ${localize(attribute.unit, locale)}` : ""}</legend><div><label>{t("catalog.from")}<input type={attribute.dataType === "date" ? "date" : "number"} inputMode={attribute.dataType === "date" ? undefined : "decimal"} value={String(dynamicFilters[`${attribute.key}_min`] ?? "")} onChange={(event) => setDynamicFilters((current) => ({ ...current, [`${attribute.key}_min`]: event.target.value }))} /></label><label>{t("catalog.to")}<input type={attribute.dataType === "date" ? "date" : "number"} inputMode={attribute.dataType === "date" ? undefined : "decimal"} value={String(dynamicFilters[`${attribute.key}_max`] ?? "")} onChange={(event) => setDynamicFilters((current) => ({ ...current, [`${attribute.key}_max`]: event.target.value }))} /></label></div></fieldset>;
          }
          return <label key={attribute.id}>{localize(attribute.label, locale)}<input type={attribute.dataType === "date" ? "date" : attribute.dataType === "number" || attribute.dataType === "range" ? "number" : "text"} inputMode={attribute.dataType === "number" || attribute.dataType === "range" ? "decimal" : undefined} value={String(dynamicFilters[attribute.key] ?? "")} onChange={(event) => setDynamicFilters((current) => ({ ...current, [attribute.key]: event.target.value }))} /></label>;
        })}
        <button className="filter-apply" type="button" onClick={applyFilters}>{t("catalog.show", { count: result.length })}</button>
        <button className="reset-button" type="button" onClick={resetFilters}>{t("catalog.reset")}</button>
      </aside>
      <section className="catalog-results" inert={mobileFilters && filtersOpen || undefined}>
        <div className="catalog-toolbar catalog-toolbar-compact"><div className="active-filter-chips">{activeChips.length > 0 ? activeChips.map((chip) => <span key={chip}>{chip}</span>) : <span className="muted-chip">{t("catalog.noExtraFilters")}</span>}</div><label>{t("catalog.sort")}<select value={sort} onChange={(event) => { const nextSort = event.target.value; setSort(nextSort); navigateWithFilters({ sort: nextSort }); }}><option value="new">{t("catalog.sortNew")}</option><option value="cheap">{t("catalog.sortCheap")}</option><option value="expensive">{t("catalog.sortExpensive")}</option></select></label></div>
        {initialState === "out_of_range" ? <EmptyState icon={<Search size={30} />} title={t("catalog.emptyTitle")} description={t("catalog.emptyDescription")} actionHref={filterUrl({ page: 1 })} actionLabel={t("profile.firstPage")} />
          : result.length ? <>
            <div className="listing-grid catalog-grid">{result.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div>
            {initialPage > 1 || initialPage < initialTotalPages ? <nav className="owner-listing-pagination" aria-label={t("catalog.listings")}>
              {initialPage > 1 ? <Link href={filterUrl({ page: initialPage - 1 })}>{t("seller.previousPage")}</Link> : <span />}
              {initialPage < initialTotalPages ? <Link href={filterUrl({ page: initialPage + 1 })}>{t("seller.nextPage")}</Link> : null}
            </nav> : null}
          </> : <EmptyState icon={<Search size={30} />} title={t("catalog.emptyTitle")} description={t("catalog.emptyDescription")} actionHref="/publish" actionLabel={t("nav.publish")} actionPrefetch={false} />}
      </section>
    </div>
  </>;
}
