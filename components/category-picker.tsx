"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { categoryOptions, getCategoryBySlug } from "@/lib/catalog-config";

export function CategoryPicker({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
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
    <button type="button" className="category-picker-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog"><span>{selected?.name.ru ?? "Выберите точную категорию"}</span><ChevronDown size={18} /></button>
    {open ? createPortal(<div className="category-picker-backdrop" onMouseDown={() => setOpen(false)}><section className="category-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="category-picker-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="section-kicker">Каталог Marketo</span><h2 id="category-picker-title">Выберите категорию</h2><p>Начните вводить название или раскройте нужный раздел.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Закрыть"><X size={21} /></button></header><label className="location-search"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по категориям" /></label><div className="category-picker-results">{options.map((item) => <button type="button" className={item.slug === value ? "selected" : ""} style={{ paddingLeft: `${16 + item.depth * 18}px` }} key={item.slug} onClick={() => { onChange(item.slug); setOpen(false); setQuery(""); }}><span><strong>{item.name.ru}</strong>{item.depth === 0 ? <small>Основная категория</small> : null}</span>{item.slug === value ? <Check size={18} /> : null}</button>)}</div></section></div>, document.body) : null}
  </>;
}
