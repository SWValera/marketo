"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { getSettlement } from "@/lib/reference-data/geography";
import type {
  CategoryAttributeReferenceData,
  CategoryReferenceData,
  LocalizedText,
  ReferenceDataEnvelope,
} from "@/lib/reference-data/types";
import { useI18n } from "@/components/i18n-provider";
import { localeTag, localize } from "@/lib/i18n/config";
import {
  clearDependentValues,
  getDependentParentOptionId,
  isAttributeVisible,
} from "@/lib/reference-data/attributes";

type FilterValue = string | boolean;

export function CatalogClient({
  initialQuery = "",
  initialCategorySlug = "",
  initialCityId,
  initialMinPrice = "",
  initialMaxPrice = "",
  initialSort = "new",
  initialDynamicFilters = {},
  catalog,
  initialCategoryAttributes,
  title,
  titleText,
  initialListings = [],
  fallback = "/",
}: {
  initialQuery?: string;
  initialCategorySlug?: string;
  initialCityId?: string;
  initialMinPrice?: string;
  initialMaxPrice?: string;
  initialSort?: string;
  initialDynamicFilters?: Record<string, FilterValue>;
  catalog: ReferenceDataEnvelope<CategoryReferenceData>;
  initialCategoryAttributes?: ReferenceDataEnvelope<CategoryAttributeReferenceData>;
  title?: string;
  titleText?: LocalizedText;
  initialListings?: ListingSummary[];
  fallback?: string;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const geography = useReferenceGeography();
  const catalogView = useMemo(() => createCategoryCatalogView(catalog.data), [catalog.data]);
  const [query, setQuery] = useState(initialQuery);
  const [categorySlug, setCategorySlug] = useState(initialCategorySlug);
  const storedLocation = useStoredLocation();
  const [cityOverride, setCityOverride] = useState<string | null>(() => initialCityId ? getSettlement(geography.data, initialCityId)?.id ?? "all" : null);
  const cityId = cityOverride ?? storedLocation;
  const [minPrice, setMinPrice] = useState(initialMinPrice);
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice);
  const [sort, setSort] = useState(initialSort);
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const result = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    const filterDefinitions = new Map(activeAttributes.map((attribute) => [attribute.key, attribute]));
    return initialListings
      .filter((item) => !normalizedQuery || `${item.title} ${item.locationLabel}`.toLocaleLowerCase("ru").includes(normalizedQuery))
      .filter((item) => isCategoryWithin(catalogView, item.categorySlug, categorySlug))
      .filter((item) => cityId === "all" || item.cityId === cityId)
      .filter((item) => !minPrice || (item.priceAmount ?? 0) >= Number(minPrice))
      .filter((item) => !maxPrice || (item.priceAmount ?? 0) <= Number(maxPrice))
      .filter((item) => Object.entries(dynamicFilters).every(([key, value]) => {
        if (value === "" || value === false) return true;
        const rangeMatch = key.match(/^(.*)_(min|max)$/);
        const attributeKey = rangeMatch?.[1] ?? key;
        const listingValue = item.attributes?.[attributeKey];
        if (rangeMatch) {
          const candidate = Number(listingValue);
          const boundary = Number(value);
          return Number.isFinite(candidate) && (rangeMatch[2] === "min" ? candidate >= boundary : candidate <= boundary);
        }
        if (typeof value === "boolean") return listingValue === value;
        const definition = filterDefinitions.get(attributeKey);
        if (definition?.filterMode === "search" || definition?.dataType === "text") return String(listingValue ?? "").toLocaleLowerCase("ru").includes(String(value).toLocaleLowerCase("ru"));
        if (definition?.dataType === "number") return Number(listingValue) === Number(value);
        return String(listingValue ?? "") === String(value);
      }))
      .sort((a, b) => sort === "cheap"
        ? (a.priceAmount ?? 0) - (b.priceAmount ?? 0)
        : sort === "expensive"
          ? (b.priceAmount ?? 0) - (a.priceAmount ?? 0)
          : Number(b.promoted) - Number(a.promoted));
  }, [activeAttributes, catalogView, categorySlug, cityId, dynamicFilters, initialListings, maxPrice, minPrice, query, sort]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (categorySlug) params.set("category", categorySlug);
    if (cityId !== "all") params.set("city", cityId);
    if (minPrice) params.set("price_min", minPrice);
    if (maxPrice) params.set("price_max", maxPrice);
    if (sort !== "new") params.set("sort", sort);
    for (const [key, value] of Object.entries(dynamicFilters)) if (value !== "" && value !== false) params.set(`f_${key}`, String(value));
    const nextUrl = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` === nextUrl) return;
    const timer = window.setTimeout(() => router.replace(nextUrl, { scroll: false }), 300);
    return () => window.clearTimeout(timer);
  }, [categorySlug, cityId, dynamicFilters, maxPrice, minPrice, query, router, sort]);

  useEffect(() => {
    if (!filtersOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => event.key === "Escape" && setFiltersOpen(false);
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
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
      return option ? localize(option.label, locale) : filter ? `${localize(filter.label, locale)}${rangeLabel ? ` ${rangeLabel}` : ""}: ${value === true ? t("common.yes") : String(value)}` : null;
    }),
  ].filter(Boolean) as string[];

  const pageTitle = activeCategory ? localize(activeCategory.name, locale) : titleText ? localize(titleText, locale) : title ?? t("catalog.allListings");

  return <>
    <PageHeader fallback={fallback} eyebrow={t("categories.eyebrow")} title={pageTitle} description={`${result.length} ${t("catalog.listings")} · ${city ? localize(city.name, locale) : t("catalog.wholeCountry")}`} />
    <div className="catalog-layout">
      <button className="filter-mobile-toggle" type="button" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>
        <SlidersHorizontal size={18} /> {t("catalog.filters")} {activeChips.length > 0 && <b>{activeChips.length}</b>}
      </button>
      {filtersOpen ? <button className="filters-overlay" type="button" onClick={() => setFiltersOpen(false)} aria-label={t("catalog.closeFilters")} /> : null}
      <aside className={`filters-panel ${filtersOpen ? "is-open" : ""}`} aria-label={t("catalog.filters")} role={filtersOpen ? "dialog" : undefined} aria-modal={filtersOpen || undefined}>
        <div className="filters-title"><div><strong>{t("catalog.filters")}</strong><small>{t("catalog.filterHint")}</small></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label={t("catalog.closeFilters")}><X size={21} /></button></div>
        <label>{t("common.search")}<span className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={activePlaceholder} /></span></label>
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
            return <label className="check-row" key={attribute.id}><input type="checkbox" checked={Boolean(dynamicFilters[attribute.key])} onChange={(event) => setDynamicFilters((current) => clearDependentValues(attribute.key, event.target.checked, attributeState.data.attributes, current))} /> {localize(attribute.label, locale)}</label>;
          }
          if (attribute.filterMode === "range") {
            return <fieldset className="attribute-range-filter" key={attribute.id}><legend>{localize(attribute.label, locale)}{attribute.unit ? `, ${localize(attribute.unit, locale)}` : ""}</legend><div><label>{t("catalog.from")}<input type={attribute.dataType === "date" ? "date" : "number"} inputMode={attribute.dataType === "date" ? undefined : "decimal"} value={String(dynamicFilters[`${attribute.key}_min`] ?? "")} onChange={(event) => setDynamicFilters((current) => ({ ...current, [`${attribute.key}_min`]: event.target.value }))} /></label><label>{t("catalog.to")}<input type={attribute.dataType === "date" ? "date" : "number"} inputMode={attribute.dataType === "date" ? undefined : "decimal"} value={String(dynamicFilters[`${attribute.key}_max`] ?? "")} onChange={(event) => setDynamicFilters((current) => ({ ...current, [`${attribute.key}_max`]: event.target.value }))} /></label></div></fieldset>;
          }
          return <label key={attribute.id}>{localize(attribute.label, locale)}<input type={attribute.dataType === "date" ? "date" : attribute.dataType === "number" || attribute.dataType === "range" ? "number" : "text"} inputMode={attribute.dataType === "number" || attribute.dataType === "range" ? "decimal" : undefined} value={String(dynamicFilters[attribute.key] ?? "")} onChange={(event) => setDynamicFilters((current) => ({ ...current, [attribute.key]: event.target.value }))} /></label>;
        })}
        <button className="filter-apply" type="button" onClick={() => setFiltersOpen(false)}>{t("catalog.show", { count: result.length })}</button>
        <button className="reset-button" type="button" onClick={resetFilters}>{t("catalog.reset")}</button>
      </aside>
      <section className="catalog-results">
        <div className="catalog-toolbar catalog-toolbar-compact"><div className="active-filter-chips">{activeChips.length > 0 ? activeChips.map((chip) => <span key={chip}>{chip}</span>) : <span className="muted-chip">{t("catalog.noExtraFilters")}</span>}</div><label>{t("catalog.sort")}<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="new">{t("catalog.sortNew")}</option><option value="cheap">{t("catalog.sortCheap")}</option><option value="expensive">{t("catalog.sortExpensive")}</option></select></label></div>
        {result.length ? <div className="listing-grid catalog-grid">{result.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div> : <EmptyState icon={<Search size={30} />} title={t("catalog.emptyTitle")} description={t("catalog.emptyDescription")} actionHref="/publish" actionLabel={t("nav.publish")} actionPrefetch={false} />}
      </section>
    </div>
  </>;
}
