"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";
import { localize } from "@/lib/i18n/config";
import { readLruEntry, writeLruEntry } from "@/lib/reference-data/bounded-map";
import type { ReferenceAttributeOption, ReferenceCategoryAttribute } from "@/lib/reference-data/types";
import { activateModalFocus } from "@/lib/browser/modal";

const DEFERRED_CACHE_MAX_ENTRIES = 128;
const deferredCache = new Map<string, ReferenceAttributeOption[]>();

export function ReferenceSelect({
  attribute,
  value,
  multipleValues = [],
  parentOptionId,
  onChange,
  onMultipleChange,
  emptyMode = "select",
}: {
  attribute: ReferenceCategoryAttribute;
  value: string;
  multipleValues?: string[];
  parentOptionId?: string;
  onChange: (value: string) => void;
  onMultipleChange?: (value: string[]) => void;
  emptyMode?: "select" | "filter";
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const [queryState, setQueryState] = useState({ cacheKey: "", value: "" });
  const [remoteState, setRemoteState] = useState<{ cacheKey: string; options: ReferenceAttributeOption[]; status: "ready" | "error" } | null>(null);
  const dependencyReady = !attribute.dependsOnKey || Boolean(parentOptionId);
  const cacheKey = `${attribute.id}:${parentOptionId ?? "root"}`;
  const cachedOptions = deferredCache.get(cacheKey);
  const remoteOptions = cachedOptions ?? (remoteState?.cacheKey === cacheKey ? remoteState.options : []);
  const status = cachedOptions ? "ready" : remoteState?.cacheKey === cacheKey ? remoteState.status : attribute.optionsLoadMode === "deferred" && dependencyReady && open ? "loading" : "idle";
  const query = queryState.cacheKey === cacheKey ? queryState.value : "";

  useEffect(() => {
    if (attribute.optionsLoadMode !== "deferred" || !dependencyReady || (!open && !value && multipleValues.length === 0)) return;
    const cached = readLruEntry(deferredCache, cacheKey);
    if (cached) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (parentOptionId) params.set("parent_option_id", parentOptionId);
    void fetch(`/api/reference/attributes/${encodeURIComponent(attribute.id)}/options?${params}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("reference_options_unavailable");
        return response.json() as Promise<{ options: ReferenceAttributeOption[] }>;
      })
      .then(({ options }) => {
        writeLruEntry(deferredCache, cacheKey, options, DEFERRED_CACHE_MAX_ENTRIES);
        setRemoteState({ cacheKey, options, status: "ready" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRemoteState({ cacheKey, options: [], status: "error" });
      });
    return () => controller.abort();
  }, [attribute.id, attribute.optionsLoadMode, cacheKey, dependencyReady, multipleValues.length, open, parentOptionId, value]);

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

  const options = attribute.optionsLoadMode === "deferred" ? remoteOptions : attribute.options;
  const isMultiple = attribute.dataType === "multiselect";
  const selected = options.find((option) => option.value === value) ?? attribute.options.find((option) => option.value === value);
  const selectedMultiple = options.filter((option) => multipleValues.includes(option.value));
  const normalized = query.trim().toLocaleLowerCase(locale);
  const filtered = useMemo(() => options.filter((option) => !normalized
    || `${option.label.ru} ${option.label.kk}`.toLocaleLowerCase(locale).includes(normalized)), [locale, normalized, options]);
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
        <label className="reference-picker-search"><Search size={18} /><input data-dialog-initial-focus aria-label={`${t("common.search")}: ${localize(attribute.label, locale)}`} value={query} onChange={(event) => setQueryState({ cacheKey, value: event.target.value })} placeholder={t("common.search")} /></label>
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
          {status !== "loading" && filtered.length === 0 ? <p>{t("reference.noOptions")}</p> : null}
        </div>
      </section>
    </div>, document.body) : null}
  </>;
}
