"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ListingCard } from "@/components/listing-card";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import { allSearchPlaceholder, categoryConfigs, getCategoryBySlug } from "@/lib/catalog-config";
import { getSettlement } from "@/lib/geography";
import { listings } from "@/lib/mock-data";

export function CatalogClient({ initialQuery = "", initialCategorySlug = "" }: { initialQuery?: string; initialCategorySlug?: string }) {
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

  const category = getCategoryBySlug(categorySlug);
  const city = getSettlement(cityId);

  const result = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    return listings
      .filter((item) => !normalizedQuery || `${item.title} ${item.description} ${item.category}`.toLocaleLowerCase("ru").includes(normalizedQuery))
      .filter((item) => !categorySlug || item.categorySlug === categorySlug)
      .filter((item) => cityId === "all" || item.cityId === cityId)
      .filter((item) => !minPrice || item.numericPrice >= Number(minPrice))
      .filter((item) => !maxPrice || item.numericPrice <= Number(maxPrice))
      .filter((item) => Object.entries(dynamicFilters).every(([key, value]) => !value || item.attributes?.[key] === value))
      .sort((a, b) => {
        if (sort === "cheap") return a.numericPrice - b.numericPrice;
        if (sort === "expensive") return b.numericPrice - a.numericPrice;
        return Number(Boolean(b.top)) - Number(Boolean(a.top));
      });
  }, [categorySlug, cityId, dynamicFilters, maxPrice, minPrice, query, sort]);

  function setCategory(nextSlug: string) {
    setCategorySlug(nextSlug);
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
    category?.name.ru,
    city?.name.ru,
    minPrice ? `от ${Number(minPrice).toLocaleString("ru-RU")} ₸` : null,
    maxPrice ? `до ${Number(maxPrice).toLocaleString("ru-RU")} ₸` : null,
    ...Object.entries(dynamicFilters).filter(([, value]) => Boolean(value)).map(([key, value]) => {
      const filter = category?.filters.find((item) => item.id === key);
      return filter?.options?.find((item) => item.value === value)?.label.ru ?? filter?.label.ru;
    }),
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader fallback="/" eyebrow="Каталог Marketo" title={category?.name.ru ?? "Все объявления"} description={`${result.length} объявлений · ${city?.name.ru ?? "весь Казахстан"}`} />
      <div className="catalog-layout">
        <button className="filter-mobile-toggle" type="button" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={18} /> Фильтры {activeChips.length > 0 && <b>{activeChips.length}</b>}</button>
        <aside className={`filters-panel ${filtersOpen ? "is-open" : ""}`} aria-label="Фильтры каталога">
          <div className="filters-title"><div><strong>Фильтры</strong><small>{category ? `для раздела «${category.name.ru}»` : "для всего каталога"}</small></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Закрыть фильтры"><X size={21} /></button></div>
          <label>Поиск<span className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={category?.searchPlaceholder.ru ?? allSearchPlaceholder.ru} /></span></label>
          <label>Категория<select value={categorySlug} onChange={(event) => setCategory(event.target.value)}><option value="">Все категории</option>{categoryConfigs.map((item) => <option value={item.slug} key={item.slug}>{item.name.ru}</option>)}</select></label>
          <div className="filter-location"><span>Местоположение</span><LocationPicker value={cityId} onChange={setCityOverride} /></div>
          <div className="price-fields"><label>Цена от<input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ""))} placeholder="0" /></label><label>до<input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))} placeholder="15 000 000" /></label></div>
          {category?.filters.map((filter) => filter.type === "select" ? (
            <label key={filter.id}>{filter.label.ru}<select value={String(dynamicFilters[filter.id] ?? "")} onChange={(event) => setDynamicFilters((current) => ({ ...current, [filter.id]: event.target.value }))}><option value="">Не важно</option>{filter.options?.map((item) => <option value={item.value} key={item.value}>{item.label.ru}</option>)}</select></label>
          ) : (
            <label className="check-row" key={filter.id}><input type="checkbox" checked={Boolean(dynamicFilters[filter.id])} onChange={(event) => setDynamicFilters((current) => ({ ...current, [filter.id]: event.target.checked }))} /> {filter.label.ru}</label>
          ))}
          <label className="check-row"><input type="checkbox" /> Только с фото</label>
          <button className="filter-apply" type="button" onClick={() => setFiltersOpen(false)}>Показать {result.length}</button>
          <button className="reset-button" type="button" onClick={resetFilters}>Сбросить фильтры</button>
        </aside>
        <section className="catalog-results">
          <div className="catalog-toolbar catalog-toolbar-compact">
            <div className="active-filter-chips" aria-label="Активные фильтры">{activeChips.length > 0 ? activeChips.map((chip) => <span key={chip}>{chip}</span>) : <span className="muted-chip">Без дополнительных фильтров</span>}</div>
            <label>Сортировка<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="new">Сначала новые</option><option value="cheap">Сначала дешевле</option><option value="expensive">Сначала дороже</option></select></label>
          </div>
          {result.length > 0 ? <div className="listing-grid catalog-grid">{result.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div> : <div className="empty-state"><Search size={30} /><h2>Объявления не найдены</h2><p>Измените город, запрос или параметры категории.</p><button type="button" onClick={resetFilters}>Сбросить фильтры</button></div>}
        </section>
      </div>
    </>
  );
}
