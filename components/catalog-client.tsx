"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ListingCard } from "@/components/listing-card";
import { categories, listings } from "@/lib/mock-data";

export function CatalogClient({ initialQuery = "", initialCategory = "" }: { initialQuery?: string; initialCategory?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("new");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const result = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return listings
      .filter((item) => !normalizedQuery || `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(normalizedQuery))
      .filter((item) => !category || item.category === category)
      .filter((item) => !minPrice || item.numericPrice >= Number(minPrice))
      .filter((item) => !maxPrice || item.numericPrice <= Number(maxPrice))
      .sort((a, b) => {
        if (sort === "cheap") return a.numericPrice - b.numericPrice;
        if (sort === "expensive") return b.numericPrice - a.numericPrice;
        return Number(Boolean(b.top)) - Number(Boolean(a.top));
      });
  }, [category, maxPrice, minPrice, query, sort]);

  function resetFilters() {
    setQuery("");
    setCategory(initialCategory);
    setMinPrice("");
    setMaxPrice("");
    setSort("new");
  }

  return (
    <div className="catalog-layout">
      <button className="filter-mobile-toggle" type="button" onClick={() => setFiltersOpen(true)}>
        <SlidersHorizontal size={18} /> Фильтры
      </button>

      <aside className={`filters-panel ${filtersOpen ? "is-open" : ""}`} aria-label="Фильтры каталога">
        <div className="filters-title">
          <strong>Фильтры</strong>
          <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Закрыть фильтры"><X size={21} /></button>
        </div>
        <label>Поиск
          <span className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например, Toyota" /></span>
        </label>
        <label>Категория
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Все категории</option>
            {categories.map((item) => <option value={item.name} key={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <label>Город
          <select defaultValue="Алматы"><option>Алматы</option><option>Астана</option><option>Шымкент</option><option>Караганда</option></select>
        </label>
        <div className="price-fields">
          <label>Цена от<input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ""))} placeholder="0" /></label>
          <label>до<input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))} placeholder="15 000 000" /></label>
        </div>
        <label className="check-row"><input type="checkbox" /> Только с фото</label>
        <button className="filter-apply" type="button" onClick={() => setFiltersOpen(false)}>Показать {result.length}</button>
        <button className="reset-button" type="button" onClick={resetFilters}>Сбросить фильтры</button>
      </aside>

      <section className="catalog-results">
        <div className="catalog-toolbar">
          <div>
            <span className="section-kicker">Каталог Marketo</span>
            <h1>{initialCategory || "Все объявления"}</h1>
            <p>Показано {result.length} объявлений в Алматы</p>
          </div>
          <label>Сортировка
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="new">Сначала новые</option>
              <option value="cheap">Сначала дешевле</option>
              <option value="expensive">Сначала дороже</option>
            </select>
          </label>
        </div>
        {result.length > 0 ? (
          <div className="listing-grid catalog-grid">{result.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div>
        ) : (
          <div className="empty-state"><Search size={30} /><h2>Объявления не найдены</h2><p>Измените запрос или сбросьте фильтры.</p><button type="button" onClick={resetFilters}>Сбросить фильтры</button></div>
        )}
      </section>
    </div>
  );
}
