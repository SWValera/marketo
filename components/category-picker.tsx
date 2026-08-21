"use client";

import { ArrowLeft, Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCategoryBySlug,
  getCategoryChildren,
  getCategoryParent,
  getCategoryPath,
  searchCategoryOptions,
} from "@/lib/catalog-config";
import { useI18n } from "@/components/i18n-provider";
import { localize } from "@/lib/i18n/config";

export function CategoryPicker({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [parentSlug, setParentSlug] = useState<string | null>(null);
  const selected = getCategoryBySlug(value);
  const selectedPath = getCategoryPath(value);
  const currentParent = getCategoryBySlug(parentSlug);
  const currentItems = getCategoryChildren(parentSlug);
  const searchResults = useMemo(() => searchCategoryOptions(query), [query]);

  function openPicker() {
    const selectedParent = getCategoryParent(value);
    setParentSlug(selectedParent?.slug ?? null);
    setQuery("");
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
    setQuery("");
  }

  function choose(slug: string) {
    const item = getCategoryBySlug(slug);
    if (!item) return;
    if (item.children?.length) {
      setParentSlug(item.slug);
      setQuery("");
      return;
    }
    onChange(item.slug);
    closePicker();
  }

  function goBack() {
    setQuery("");
    setParentSlug(getCategoryParent(parentSlug)?.slug ?? null);
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => event.key === "Escape" && closePicker();
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  const visibleItems = query.trim() ? searchResults.map((item) => getCategoryBySlug(item.slug)!).filter(Boolean) : currentItems;

  return <>
    <button type="button" className="category-picker-trigger" onClick={openPicker} aria-haspopup="dialog">
      <span>
        {selected ? <><strong>{localize(selected.name, locale)}</strong><small>{selectedPath.map((item) => localize(item.name, locale)).join(" → ")}</small></> : t("categories.chooseExact")}
      </span>
      <ChevronDown size={18} />
    </button>
    {open ? createPortal(
      <div className="category-picker-backdrop" onMouseDown={closePicker}>
        <section className="category-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="category-picker-title" onMouseDown={(event) => event.stopPropagation()}>
          <header>
            {parentSlug ? <button type="button" className="category-level-back" onClick={goBack} aria-label={t("common.back")}><ArrowLeft size={21} /></button> : null}
            <div>
              <span className="section-kicker">{t("categories.eyebrow")}</span>
              <h2 id="category-picker-title">{currentParent ? localize(currentParent.name, locale) : t("categories.choose")}</h2>
              <p>{currentParent ? t("categories.levelHelp") : t("categories.chooseHelp")}</p>
            </div>
            <button type="button" className="icon-button" onClick={closePicker} aria-label={t("categories.close")}><X size={21} /></button>
          </header>
          <label className="location-search category-search">
            <Search size={19} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("categories.search")} />
          </label>
          {!query && parentSlug ? <div className="category-level-path">{getCategoryPath(parentSlug).map((item) => <span key={item.slug}>{localize(item.name, locale)}</span>)}</div> : null}
          <div className="category-picker-results" role="listbox" aria-label={t("categories.choose")}>{visibleItems.map((item) => {
            const path = getCategoryPath(item.slug);
            const hasChildren = Boolean(item.children?.length);
            return <button type="button" role="option" aria-selected={item.slug === value} className={item.slug === value ? "selected" : ""} key={item.slug} onClick={() => choose(item.slug)}>
              <span>
                <strong>{localize(item.name, locale)}</strong>
                {query ? <small>{path.map((pathItem) => localize(pathItem.name, locale)).join(" → ")}</small> : hasChildren ? <small>{t("categories.sections", { count: item.children?.length ?? 0 })}</small> : <small>{t("categories.exact")}</small>}
              </span>
              {item.slug === value ? <Check size={18} /> : hasChildren ? <ChevronRight size={19} /> : null}
            </button>;
          })}</div>
          {visibleItems.length === 0 ? <div className="category-picker-empty">{t("categories.notFound")}</div> : null}
        </section>
      </div>,
      document.body,
    ) : null}
  </>;
}
