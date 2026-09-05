"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import { localize } from "@/lib/i18n/config";
import {
  createCategoryCatalogView,
  getCategoryChildren,
  getCategoryPath,
  getRootCategories,
} from "@/lib/reference-data/catalog";
import type { CategoryReferenceData, ReferenceDataEnvelope } from "@/lib/reference-data/types";

export function CategoryCascade({
  value,
  onChange,
  catalog,
}: {
  value: string;
  onChange: (slug: string) => void;
  catalog: ReferenceDataEnvelope<CategoryReferenceData>;
}) {
  const { locale, t } = useI18n();
  const view = useMemo(() => createCategoryCatalogView(catalog.data), [catalog.data]);
  const path = getCategoryPath(view, value);
  const roots = getRootCategories(view);

  return <div className="category-cascade">
    {path.length > 0 ? <p className="category-cascade-path" aria-live="polite">{path.map((item) => localize(item.name, locale)).join(" → ")}</p> : null}
    <label>
      <span>{t("catalog.category")}</span>
      <select value={path[0]?.slug ?? ""} onChange={(event) => onChange(event.target.value)} disabled={catalog.status !== "ready"}>
        <option value="">{catalog.status === "ready" ? t("catalog.allCategories") : t("reference.categoriesUnavailable")}</option>
        {roots.map((item) => <option value={item.slug} key={item.id}>{localize(item.name, locale)}</option>)}
      </select>
    </label>
    {path.map((parent, index) => {
      const children = getCategoryChildren(view, parent);
      return children.length > 0 ? <label key={parent.id}>
        <span>{index === 0 ? t("catalog.subcategory") : t("catalog.categoryType")}</span>
        <select value={path[index + 1]?.slug ?? ""} onChange={(event) => onChange(event.target.value || parent.slug)}>
          <option value="">{t("catalog.allIn", { category: localize(parent.name, locale) })}</option>
          {children.map((item) => <option value={item.slug} key={item.id}>{localize(item.name, locale)}</option>)}
        </select>
      </label> : null;
    })}
  </div>;
}
