"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ListingCard } from "@/components/listing-card";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import type { AttributeDefinition } from "@/lib/catalog-config";
import type { ListingSummary } from "@/lib/data/types";
import { getSettlement } from "@/lib/geography";

type CategoryOption = { slug: string; label: string; depth: number };

export function CatalogClient({
  initialQuery = "", initialCategorySlug = "", title = "Все объявления",
  placeholder = "Найти товар, услугу или работу…", attributes = [], categories = [],
  initialListings = [], fallback = "/",
}: {
  initialQuery?: string; initialCategorySlug?: string; title?: string; placeholder?: string;
  attributes?: AttributeDefinition[]; categories?: CategoryOption[];
  initialListings?: ListingSummary[]; fallback?: string;
}) {
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
    city?.name.ru,
    minPrice ? `от ${Number(minPrice).toLocaleString("ru-RU")} ₸` : null,
    maxPrice ? `до ${Number(maxPrice).toLocaleString("ru-RU")} ₸` : null,
    ...Object.entries(dynamicFilters).filter(([, value]) => Boolean(value)).map(([key, value]) => {
      const filter = attributes.find((item) => item.id === key);
      return filter?.options?.find((item) => item.value === value)?.label.ru ?? filter?.label.ru;
    }),
  ].filter(Boolean) as string[];

  return <>
    <PageHeader fallback={fallback} eyebrow="Каталог Marketo" title={title} description={`${result.length} объявлений · ${city?.name.ru ?? "весь Казахстан"}`} />
    <div className="catalog-layout">
      <button className="filter-mobile-toggle" type="button" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={18} /> Фильтры {activeChips.length > 0 && <b>{activeChips.length}</b>}</button>
      <aside className={`filters-panel ${filtersOpen ? "is-open" : ""}`} aria-label="Фильтры каталога">
        <div className="filters-title"><div><strong>Фильтры</strong><small>точный поиск по разделу</small></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Закрыть фильтры"><X size={21} /></button></div>
        <label>Поиск<span className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} /></span></label>
        <label>Категория<select value={categorySlug} onChange={(event) => { setCategorySlug(event.target.value); setDynamicFilters({}); }}><option value="">Все категории</option>{categories.map((item) => <option value={item.slug} key={item.slug}>{`${"— ".repeat(item.depth)}${item.label}`}</option>)}</select></label>
        <div className="filter-location"><span>Местоположение</span><LocationPicker value={cityId} onChange={setCityOverride} /></div>
        <div className="price-fields"><label>Цена от<input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ""))} placeholder="0" /></label><label>до<input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))} placeholder="15 000 000" /></label></div>
        {attributes.filter((attribute) => attribute.filterable).map((attribute) => attribute.type === "select" ? <label key={attribute.id}>{attribute.label.ru}<select value={String(dynamicFilters[attribute.id] ?? "")} onChange={(event) => setDynamicFilters((current) => ({ ...current, [attribute.id]: event.target.value }))}><option value="">Не важно</option>{attribute.options?.map((item) => <option value={item.value} key={item.value}>{item.label.ru}</option>)}</select></label> : attribute.type === "checkbox" ? <label className="check-row" key={attribute.id}><input type="checkbox" checked={Boolean(dynamicFilters[attribute.id])} onChange={(event) => setDynamicFilters((current) => ({ ...current, [attribute.id]: event.target.checked }))} /> {attribute.label.ru}</label> : null)}
        <button className="filter-apply" type="button" onClick={() => setFiltersOpen(false)}>Показать {result.length}</button>
        <button className="reset-button" type="button" onClick={resetFilters}>Сбросить фильтры</button>
      </aside>
      <section className="catalog-results">
        <div className="catalog-toolbar catalog-toolbar-compact"><div className="active-filter-chips">{activeChips.length > 0 ? activeChips.map((chip) => <span key={chip}>{chip}</span>) : <span className="muted-chip">Без дополнительных фильтров</span>}</div><label>Сортировка<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="new">Сначала новые</option><option value="cheap">Сначала дешевле</option><option value="expensive">Сначала дороже</option></select></label></div>
        {result.length ? <div className="listing-grid catalog-grid">{result.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div> : <EmptyState icon={<Search size={30} />} title="Объявлений пока нет" description="Станьте первым продавцом в этом разделе или измените параметры поиска." actionHref="/publish" actionLabel="Подать объявление" />}
      </section>
    </div>
  </>;
}
