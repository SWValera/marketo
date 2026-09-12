"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";
import { localize } from "@/lib/i18n/config";
import { readLruEntry, writeLruEntry } from "@/lib/reference-data/bounded-map";
import { CATEGORY_REFERENCE_VERSION } from "@/lib/reference-data/release";
import type { ReferenceAttributeOption, ReferenceCategoryAttribute, ReferenceOptionsPage } from "@/lib/reference-data/types";
import { activateModalFocus } from "@/lib/browser/modal";

const DEFERRED_CACHE_MAX_ENTRIES = 128;
const deferredCache = new Map<string, ReferenceOptionsPage>();
const EMPTY_OPTIONS: ReferenceAttributeOption[] = [];
const PAGE_SIZE = 60;

export function ReferenceSelect({
  attribute,
  value,
  multipleValues = [],
  parentOptionId,
  parentValue,
  onChange,
  onMultipleChange,
  emptyMode = "select",
}: {
  attribute: ReferenceCategoryAttribute;
  value: string;
  multipleValues?: string[];
  parentOptionId?: string;
  parentValue?: string;
  onChange: (value: string) => void;
  onMultipleChange?: (value: string[]) => void;
  emptyMode?: "select" | "filter";
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const [queryState, setQueryState] = useState({ cacheKey: "", value: "" });
  const [pageState, setPageState] = useState({ searchKey: "", offset: 0 });
  const [remoteState, setRemoteState] = useState<{ cacheKey: string; dependencyKey: string; page: ReferenceOptionsPage; status: "ready" | "error" } | null>(null);
  const dependencyReady = !attribute.dependsOnKey || Boolean(parentValue || parentOptionId);
  const dependencyKey = `${CATEGORY_REFERENCE_VERSION}:${attribute.id}:${parentValue ?? parentOptionId ?? "root"}`;
  const query = queryState.cacheKey === dependencyKey ? queryState.value : "";
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase(locale);
  const isMultiple = attribute.dataType === "multiselect" && emptyMode !== "filter";
  const validation = attribute.validation && typeof attribute.validation === "object" && !Array.isArray(attribute.validation)
    ? attribute.validation as Record<string, unknown> : {};
  const fallbackValue = typeof validation.fallbackOption === "string" ? validation.fallbackOption : "other";
  const searchKey = JSON.stringify([dependencyKey, normalized]);
  const offset = pageState.searchKey === searchKey ? pageState.offset : 0;
  const selectedValues = (isMultiple ? multipleValues : value ? [value] : []).join(",");
  const cacheKey = JSON.stringify([searchKey, offset, selectedValues, fallbackValue]);
  const cachedPage = deferredCache.get(cacheKey);
  const remotePage = cachedPage ?? (remoteState?.cacheKey === cacheKey ? remoteState.page : undefined);
  const status = cachedPage ? "ready" : remoteState?.cacheKey === cacheKey ? remoteState.status
    : attribute.optionsLoadMode === "deferred" && dependencyReady && open ? "loading" : "idle";

  useEffect(() => {
    if (attribute.optionsLoadMode !== "deferred" || !dependencyReady || (!open && !selectedValues)) return;
    if (readLruEntry(deferredCache, cacheKey)) return;
    const controller = new AbortController();
    // Debounce typing, not navigation or opening an already cached picker.
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ v: CATEGORY_REFERENCE_VERSION, offset: String(offset) });
      if (parentValue) params.set("parent_value", parentValue);
      else if (parentOptionId) params.set("parent_option_id", parentOptionId);
      if (normalized) params.set("q", normalized);
      if (selectedValues) params.set("selected", selectedValues);
      params.set("fallback", fallbackValue);
      void fetch(`/api/reference/attributes/${encodeURIComponent(attribute.id)}/options?${params}`, {
        headers: { accept: "application/json" }, signal: controller.signal,
      }).then(async response => {
        if (!response.ok) throw new Error("reference_options_unavailable");
        return response.json() as Promise<ReferenceOptionsPage>;
      }).then(page => {
        if (controller.signal.aborted) return;
        writeLruEntry(deferredCache, cacheKey, page, DEFERRED_CACHE_MAX_ENTRIES);
        setRemoteState({ cacheKey, dependencyKey, page, status: "ready" });
      }).catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setRemoteState({ cacheKey, dependencyKey, page: { options: [], selectedOptions: [], hasMore: false }, status: "error" });
      });
    }, normalized ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [attribute.id, attribute.optionsLoadMode, cacheKey, dependencyKey, dependencyReady, fallbackValue, normalized, offset, open, parentOptionId, parentValue, selectedValues]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const releaseFocus = dialogRef.current ? activateModalFocus(dialogRef.current, () => setOpen(false)) : () => undefined;
    return () => {
      document.body.style.overflow = previous;
      releaseFocus();
    };
  }, [open]);

  const options = attribute.optionsLoadMode === "deferred" ? remotePage?.options ?? EMPTY_OPTIONS : attribute.options;
  const resolvedOptions = remotePage?.selectedOptions ?? (remoteState?.dependencyKey === dependencyKey ? remoteState.page.selectedOptions : EMPTY_OPTIONS);
  const selected = resolvedOptions.find(option => option.value === value)
    ?? options.find(option => option.value === value) ?? attribute.options.find(option => option.value === value);
  const selectedMultiple = [...new Map([...resolvedOptions, ...options].map(option => [option.id, option])).values()]
    .filter(option => multipleValues.includes(option.value));
  const filtered = useMemo(() => {
    const matched = options.filter((option) => !normalized
      || `${option.label.ru} ${option.label.kk}`.normalize("NFKC").toLocaleLowerCase(locale).includes(normalized));
    const fallback = [...resolvedOptions, ...options].find(option => option.value === fallbackValue);
    if (fallback && !matched.some((option) => option.id === fallback.id)) matched.push(fallback);
    return matched;
  }, [fallbackValue, locale, normalized, options, resolvedOptions]);
  const placeholder = emptyMode === "filter" ? t("common.notImportant") : t("common.selectValue");

  return <>
    <button
      className="reference-select-trigger"
      type="button"
      disabled={!dependencyReady}
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <span>{isMultiple && selectedMultiple.length > 0
        ? selectedMultiple.map((option) => localize(option.label, locale)).join(", ")
        : selected ? localize(selected.label, locale) : dependencyReady ? placeholder : t("reference.selectParentFirst")}</span>
      <ChevronDown size={18} />
    </button>
    {open ? createPortal(<div className="reference-picker-layer" role="presentation">
      <button className="reference-picker-backdrop" type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} />
      <section ref={dialogRef} className="reference-picker" role="dialog" aria-modal="true" aria-label={localize(attribute.label, locale)} tabIndex={-1}>
        <header><div><strong>{localize(attribute.label, locale)}</strong><small>{t("reference.searchValue")}</small></div><button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")}><X size={22} /></button></header>
        <label className="reference-picker-search"><Search size={18} /><input data-dialog-initial-focus aria-label={`${t("common.search")}: ${localize(attribute.label, locale)}`} maxLength={64} value={query} onChange={(event) => setQueryState({ cacheKey: dependencyKey, value: event.target.value })} placeholder={t("common.search")} /></label>
        <div className="reference-picker-list">
          <button type="button" className={isMultiple ? multipleValues.length === 0 ? "is-selected" : "" : !value ? "is-selected" : ""} onClick={() => {
            if (isMultiple) onMultipleChange?.([]);
            else onChange("");
            if (!isMultiple) setOpen(false);
          }}><span>{placeholder}</span>{(isMultiple ? multipleValues.length === 0 : !value) ? <Check size={18} /> : null}</button>
          {status === "loading" ? <p>{t("reference.optionsLoading")}</p> : null}
          {status === "error" ? <p className="is-error">{t("reference.attributesUnavailable")}</p> : null}
          {filtered.map((option) => {
            const optionSelected = isMultiple ? multipleValues.includes(option.value) : option.value === value;
            return <button type="button" className={optionSelected ? "is-selected" : ""} key={option.id} onClick={() => {
              if (isMultiple) {
                onMultipleChange?.(optionSelected
                  ? multipleValues.filter((item) => item !== option.value)
                  : [...multipleValues, option.value]);
              } else {
                onChange(option.value);
                setOpen(false);
              }
            }}><span>{localize(option.label, locale)}</span>{optionSelected ? <Check size={18} /> : null}</button>;
          })}
          {attribute.optionsLoadMode === "deferred" && (offset > 0 || remotePage?.hasMore) ? <nav aria-label={localize(attribute.label, locale)}>
            {offset > 0 ? <button type="button" onClick={() => setPageState({ searchKey, offset: Math.max(0, offset - PAGE_SIZE) })}>{t("seller.previousPage")}</button> : null}
            {remotePage?.hasMore ? <button type="button" onClick={() => setPageState({ searchKey, offset: offset + PAGE_SIZE })}>{t("seller.nextPage")}</button> : null}
          </nav> : null}
          {status !== "loading" && filtered.length === 0 ? <p>{t("reference.noOptions")}</p> : null}
        </div>
      </section>
    </div>, document.body) : null}
  </>;
}
