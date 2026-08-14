"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ListingCard } from "@/components/listing-card";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import type { AttributeDefinition } from "@/lib/catalog-config";
import type { LocalizedText } from "@/lib/catalog-config";
import type { ListingSummary } from "@/lib/data/types";
import { getSettlement } from "@/lib/geography";
import { useI18n } from "@/components/i18n-provider";
import { localeTag, localize } from "@/lib/i18n/config";

type CategoryOption = { slug: string; name: LocalizedText; depth: number };

export function CatalogClient({
  initialQuery = "", initialCategorySlug = "", title, titleText,
  placeholder, placeholderText, attributes = [], categories = [],
  initialListings = [], fallback = "/",
}: {
  initialQuery?: string; initialCategorySlug?: string; title?: string; titleText?: LocalizedText; placeholder?: string; placeholderText?: LocalizedText;
  attributes?: AttributeDefinition[]; categories?: CategoryOption[];
  initialListings?: ListingSummary[]; fallback?: string;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState(initialQuery);
  const [categorySlug, setCategorySlug] = useState(initialCategorySlug);
  const storedLocation = useStoredLocation();
  const [cityOverride, setCityOverride] = useState<string | null>(null);
  const cityId = cityOverride ?? storedLocation;
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("new");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dynamicFilters, setDynamicFilters] = useState<Record<string, string | boolean>>({});
  const city = getSettlement(cityId);

  const result = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    return initialListings
      .filter((item) => !normalizedQuery || item.title.toLocaleLowerCase("ru").includes(normalizedQuery))
      .filter((item) => !categorySlug || item.categorySlug === categorySlug)
      .filter((item) => cityId === "all" || item.cityId === cityId)
      .filter((item) => !minPrice || (item.priceAmount ?? 0) >= Number(minPrice))
      .filter((item) => !maxPrice || (item.priceAmount ?? 0) <= Number(maxPrice))
      .sort((a, b) => sort === "cheap" ? (a.priceAmount ?? 0) - (b.priceAmount ?? 0) : sort === "expensive" ? (b.priceAmount ?? 0) - (a.priceAmount ?? 0) : Number(b.promoted) - Number(a.promoted));
  }, [categorySlug, cityId, initialListings, maxPrice, minPrice, query, sort]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (categorySlug) params.set("category", categorySlug);
    if (cityId !== "all") params.set("city", cityId);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [categorySlug, cityId, query]);

  function resetFilters() {
    setQuery(""); setCategorySlug(initialCategorySlug); setCityOverride("all");
    setMinPrice(""); setMaxPrice(""); setSort("new"); setDynamicFilters({});
  }

  const activeChips = [
    city ? localize(city.name, locale) : null,
    minPrice ? `${t("catalog.from")} ${Number(minPrice).toLocaleString(localeTag(locale))} ₸` : null,
    maxPrice ? `${t("catalog.to")} ${Number(maxPrice).toLocaleString(localeTag(locale))} ₸` : null,
    ...Object.entries(dynamicFilters).filter(([, value]) => Boolean(value)).map(([key, value]) => {
      const filter = attributes.find((item) => item.id === key);
      const option = filter?.options?.find((item) => item.value === value);
      return option ? localize(option.label, locale) : localize(filter?.label, locale);
    }),
  ].filter(Boolean) as string[];

  return <>
    <PageHeader fallback={fallback} eyebrow={t("categories.eyebrow")} title={titleText ? localize(titleText, locale) : title ?? t("catalog.allListings")} description={`${result.length} ${t("catalog.listings")} · ${city ? localize(city.name, locale) : t("catalog.wholeCountry")}`} />
    <div className="catalog-layout">
      <button className="filter-mobile-toggle" type="button" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={18} /> {t("catalog.filters")} {activeChips.length > 0 && <b>{activeChips.length}</b>}</button>
      <aside className={`filters-panel ${filtersOpen ? "is-open" : ""}`} aria-label={t("catalog.filters")}>
        <div className="filters-title"><div><strong>{t("catalog.filters")}</strong><small>{t("catalog.filterHint")}</small></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label={t("catalog.closeFilters")}><X size={21} /></button></div>
        <label>{t("common.search")}<span className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholderText ? localize(placeholderText, locale) : placeholder ?? t("header.searchPlaceholder")} /></span></label>
        <label>{t("catalog.category")}<select value={categorySlug} onChange={(event) => { setCategorySlug(event.target.value); setDynamicFilters({}); }}><option value="">{t("catalog.allCategories")}</option>{categories.map((item) => <option value={item.slug} key={item.slug}>{`${"— ".repeat(item.depth)}${localize(item.name, locale)}`}</option>)}</select></label>
        <div className="filter-location"><span>{t("catalog.location")}</span><LocationPicker value={cityId} onChange={setCityOverride} /></div>
        <div className="price-fields"><label>{t("catalog.priceFrom")}<input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ""))} placeholder="0" /></label><label>{t("catalog.to")}<input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))} placeholder="15 000 000" /></label></div>
        {attributes.filter((attribute) => attribute.filterable).map((attribute) => attribute.type === "select" ? <label key={attribute.id}>{localize(attribute.label, locale)}<select value={String(dynamicFilters[attribute.id] ?? "")} onChange={(event) => setDynamicFilters((current) => ({ ...current, [attribute.id]: event.target.value }))}><option value="">{t("common.notImportant")}</option>{attribute.options?.map((item) => <option value={item.value} key={item.value}>{localize(item.label, locale)}</option>)}</select></label> : attribute.type === "checkbox" ? <label className="check-row" key={attribute.id}><input type="checkbox" checked={Boolean(dynamicFilters[attribute.id])} onChange={(event) => setDynamicFilters((current) => ({ ...current, [attribute.id]: event.target.checked }))} /> {localize(attribute.label, locale)}</label> : null)}
        <button className="filter-apply" type="button" onClick={() => setFiltersOpen(false)}>{t("catalog.show", { count: result.length })}</button>
        <button className="reset-button" type="button" onClick={resetFilters}>{t("catalog.reset")}</button>
      </aside>
      <section className="catalog-results">
        <div className="catalog-toolbar catalog-toolbar-compact"><div className="active-filter-chips">{activeChips.length > 0 ? activeChips.map((chip) => <span key={chip}>{chip}</span>) : <span className="muted-chip">{t("catalog.noExtraFilters")}</span>}</div><label>{t("catalog.sort")}<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="new">{t("catalog.sortNew")}</option><option value="cheap">{t("catalog.sortCheap")}</option><option value="expensive">{t("catalog.sortExpensive")}</option></select></label></div>
        {result.length ? <div className="listing-grid catalog-grid">{result.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div> : <EmptyState icon={<Search size={30} />} title={t("catalog.emptyTitle")} description={t("catalog.emptyDescription")} actionHref="/publish" actionLabel={t("nav.publish")} />}
      </section>
    </div>
  </>;
}
