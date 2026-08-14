"use client";

import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getRegion, getSettlement, popularSettlements, regions, settlements } from "@/lib/geography";

const LOCATION_STORAGE_KEY = "marketo-location";
const LOCATION_EVENT = "marketo:location-change";

function subscribeToLocation(callback: () => void) {
  window.addEventListener(LOCATION_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LOCATION_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function readStoredLocation() {
  const stored = window.localStorage.getItem(LOCATION_STORAGE_KEY);
  return stored && (stored === "all" || getSettlement(stored)) ? stored : "all";
}

export function useStoredLocation() {
  return useSyncExternalStore(subscribeToLocation, readStoredLocation, () => "all");
}

export function LocationPicker({
  value,
  onChange,
  allowAll = true,
  compact = false,
  className = "",
}: {
  value?: string;
  onChange?: (settlementId: string) => void;
  allowAll?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const fallback = allowAll ? "all" : "almaty";
  const storedSelection = useStoredLocation();
  const selected = value ?? (storedSelection === "all" ? fallback : storedSelection);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    if (!normalized) return settlements;
    return settlements.filter((item) => {
      const region = getRegion(item.regionId);
      return `${item.name.ru} ${item.name.kk} ${region?.name.ru ?? ""} ${region?.name.kk ?? ""}`.toLocaleLowerCase("ru").includes(normalized);
    });
  }, [query]);

  const selectedSettlement = getSettlement(selected);
  const displayName = selected === "all" ? "Весь Казахстан" : selectedSettlement?.name.ru ?? "Выберите город";

  function choose(cityId: string) {
    onChange?.(cityId);
    if (!value) {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, cityId);
      window.dispatchEvent(new CustomEvent(LOCATION_EVENT, { detail: cityId }));
    }
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <button type="button" className={`location-trigger ${compact ? "compact" : ""} ${className}`.trim()} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <MapPin size={17} aria-hidden="true" /><span>{displayName}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div className="location-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="location-sheet" role="dialog" aria-modal="true" aria-labelledby="location-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span className="section-kicker">Казахстан</span><h2 id="location-title">Выберите город</h2><p>Поиск охватывает города всех 17 областей и трёх городов республиканского значения.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Закрыть выбор города"><X size={21} /></button></header>
            <label className="location-search"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Введите город или область" /></label>
            {!query && <div className="popular-locations"><strong>Популярные города</strong><div>{popularSettlements.map((item) => <button type="button" key={item.id} onClick={() => choose(item.id)}>{item.name.ru}</button>)}</div></div>}
            {allowAll && !query && <button type="button" className={`location-all ${selected === "all" ? "selected" : ""}`} onClick={() => choose("all")}><span><MapPin size={19} />Весь Казахстан</span>{selected === "all" && <Check size={18} />}</button>}
            <div className="location-results" role="listbox" aria-label="Города Казахстана">
              {filtered.map((item) => {
                const region = getRegion(item.regionId);
                return <button type="button" role="option" aria-selected={selected === item.id} className={selected === item.id ? "selected" : ""} key={`${item.regionId}-${item.id}`} onClick={() => choose(item.id)}><span><strong>{item.name.ru}</strong><small>{region?.name.ru}</small></span>{selected === item.id && <Check size={18} />}</button>;
              })}
              {filtered.length === 0 && <div className="location-empty">Город не найден. Проверьте написание.</div>}
            </div>
            <footer>Справочник подготовлен по КАТО Республики Казахстан. Структура готова для районов, сёл и посёлков.</footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

export { regions };
