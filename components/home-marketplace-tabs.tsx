"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export function HomeMarketplaceTabs({ catalog, listings }: { catalog: ReactNode; listings: ReactNode }) {
  const { t } = useI18n();
  const [active, setActive] = useState<"catalog" | "listings">("catalog");
  const tabs = ["catalog", "listings"] as const;
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, current: typeof active) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabs.indexOf(current);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    setActive(next);
    document.getElementById(`home-${next}-tab`)?.focus();
  }
  return <section className="home-marketplace page-shell">
    <div className="home-marketplace-tabs" role="tablist" aria-label={t("home.marketplaceTabs")}>
      <button id="home-catalog-tab" type="button" role="tab" aria-controls="home-marketplace-panel" aria-selected={active === "catalog"} tabIndex={active === "catalog" ? 0 : -1} className={active === "catalog" ? "is-active" : ""} onKeyDown={(event) => handleKeyDown(event, "catalog")} onClick={() => setActive("catalog")}>{t("common.catalog")}</button>
      <button id="home-listings-tab" type="button" role="tab" aria-controls="home-marketplace-panel" aria-selected={active === "listings"} tabIndex={active === "listings" ? 0 : -1} className={active === "listings" ? "is-active" : ""} onKeyDown={(event) => handleKeyDown(event, "listings")} onClick={() => setActive("listings")}>{t("home.listings")}</button>
    </div>
    <div id="home-marketplace-panel" role="tabpanel" aria-labelledby={`home-${active}-tab`} tabIndex={0}>{active === "catalog" ? catalog : listings}</div>
  </section>;
}
