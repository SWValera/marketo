"use client";

import { useState } from "react";

type QueryTab = { value: string; label: string; count?: number };

export function QueryTabs({ className, items, defaultValue, initialValue, param = "view" }: { className: string; items: QueryTab[]; defaultValue: string; initialValue?: string; param?: string }) {
  const [active, setActive] = useState(items.some((item) => item.value === initialValue) ? initialValue! : defaultValue);

  function choose(value: string) {
    setActive(value);
    const next = new URLSearchParams(window.location.search);
    if (value === defaultValue) next.delete(param); else next.set(param, value);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  }

  return <div className={className} role="tablist">{items.map((item) => <button className={item.value === active ? "is-active" : ""} type="button" role="tab" aria-selected={item.value === active} onClick={() => choose(item.value)} key={item.value}>{item.label}{typeof item.count === "number" ? <> <b>{item.count}</b></> : null}</button>)}</div>;
}
