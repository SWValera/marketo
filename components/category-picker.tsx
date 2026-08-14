"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { categoryOptions, getCategoryBySlug } from "@/lib/catalog-config";
import { useI18n } from "@/components/i18n-provider";
import { localize } from "@/lib/i18n/config";

export function CategoryPicker({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = getCategoryBySlug(value);
  const options = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return normalized ? categoryOptions.filter((item) => `${item.name.ru} ${item.name.kk ?? ""}`.toLocaleLowerCase("ru").includes(normalized)) : categoryOptions;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [open]);

  return <>
    <button type="button" className="category-picker-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog"><span>{selected ? localize(selected.name, locale) : t("categories.chooseExact")}</span><ChevronDown size={18} /></button>
    {open ? createPortal(<div className="category-picker-backdrop" onMouseDown={() => setOpen(false)}><section className="category-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="category-picker-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="section-kicker">{t("categories.eyebrow")}</span><h2 id="category-picker-title">{t("categories.choose")}</h2><p>{t("categories.chooseHelp")}</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label={t("categories.close")}><X size={21} /></button></header><label className="location-search"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("categories.search")} /></label><div className="category-picker-results">{options.map((item) => <button type="button" className={item.slug === value ? "selected" : ""} style={{ paddingLeft: `${16 + item.depth * 18}px` }} key={item.slug} onClick={() => { onChange(item.slug); setOpen(false); setQuery(""); }}><span><strong>{localize(item.name, locale)}</strong>{item.depth === 0 ? <small>{t("categories.main")}</small> : null}</span>{item.slug === value ? <Check size={18} /> : null}</button>)}</div></section></div>, document.body) : null}
  </>;
}
