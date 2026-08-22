"use client";

import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";
import { useReferenceGeography } from "@/components/reference-geography-provider";
import { localize } from "@/lib/i18n/config";
import {
  getFeaturedSettlements,
  getRegion,
  getSettlement,
  searchSettlements,
} from "@/lib/reference-data/geography";

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
  return window.localStorage.getItem(LOCATION_STORAGE_KEY) || "all";
}

export function useStoredLocation() {
  const { data } = useReferenceGeography();
  const stored = useSyncExternalStore(subscribeToLocation, readStoredLocation, () => "all");
  if (stored === "all") return stored;
  return getSettlement(data, stored)?.id ?? "all";
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
  const { locale, t } = useI18n();
  const geography = useReferenceGeography();
  const storedSelection = useStoredLocation();
  const requestedSelection = value ?? storedSelection;
  const requestedSettlement = getSettlement(geography.data, requestedSelection);
  const selected = requestedSelection === "all" && allowAll ? "all" : requestedSettlement?.id ?? "";
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

  const filtered = useMemo(
    () => searchSettlements(geography.data, query),
    [geography.data, query],
  );
  const featured = useMemo(
    () => getFeaturedSettlements(geography.data),
    [geography.data],
  );

  const selectedSettlement = getSettlement(geography.data, selected);
  const displayName = selected === "all"
    ? t("common.allKazakhstan")
    : selectedSettlement
      ? localize(selectedSettlement.name, locale)
      : t("location.choose");

  function choose(settlementId: string) {
    onChange?.(settlementId);
    if (value === undefined) {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, settlementId);
      window.dispatchEvent(new CustomEvent(LOCATION_EVENT, { detail: settlementId }));
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
            <header><div><span className="section-kicker">{t("common.kazakhstan")}</span><h2 id="location-title">{t("location.choose")}</h2><p>{t("location.searchHelp")}</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label={t("location.close")}><X size={21} /></button></header>
            <label className="location-search"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("location.searchPlaceholder")} /></label>
            {!query && featured.length > 0 ? <div className="popular-locations"><strong>{t("location.popular")}</strong><div>{featured.map((item) => <button type="button" key={item.id} onClick={() => choose(item.id)}>{localize(item.name, locale)}</button>)}</div></div> : null}
            {allowAll && !query ? <button type="button" className={`location-all ${selected === "all" ? "selected" : ""}`} onClick={() => choose("all")}><span><MapPin size={19} />{t("common.allKazakhstan")}</span>{selected === "all" && <Check size={18} />}</button> : null}
            <div className="location-results" role="listbox" aria-label={t("location.citiesAria")}>
              {filtered.map((item) => {
                const region = getRegion(geography.data, item.regionId);
                return <button type="button" role="option" aria-selected={selected === item.id} className={selected === item.id ? "selected" : ""} key={item.id} onClick={() => choose(item.id)}><span><strong>{localize(item.name, locale)}</strong><small>{region ? localize(region.name, locale) : ""}</small></span>{selected === item.id && <Check size={18} />}</button>;
              })}
              {filtered.length === 0 ? <div className="location-empty">{geography.status === "ready" ? t("location.notFound") : t("reference.geographyUnavailable")}</div> : null}
            </div>
            <footer>{t("location.source")}</footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
