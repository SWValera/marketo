"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export function HomeMarketplaceTabs({ catalog, listings }: { catalog: ReactNode; listings: ReactNode }) {
  const { t } = useI18n();
  const [active, setActive] = useState<"catalog" | "listings">("catalog");
  return <section className="home-marketplace page-shell">
    <div className="home-marketplace-tabs" role="tablist" aria-label={t("home.marketplaceTabs")}>
      <button type="button" role="tab" aria-selected={active === "catalog"} className={active === "catalog" ? "is-active" : ""} onClick={() => setActive("catalog")}>{t("common.catalog")}</button>
      <button type="button" role="tab" aria-selected={active === "listings"} className={active === "listings" ? "is-active" : ""} onClick={() => setActive("listings")}>{t("home.listings")}</button>
    </div>
    <div role="tabpanel">{active === "catalog" ? catalog : listings}</div>
  </section>;
}

