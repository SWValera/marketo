"use client";

import { categoryTree, getCategoryPath } from "@/lib/catalog-config";
import { useI18n } from "@/components/i18n-provider";
import { localize } from "@/lib/i18n/config";

export function CategoryCascade({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  const { locale, t } = useI18n();
  const path = getCategoryPath(value);

  return <div className="category-cascade">
    <label>
      <span>{t("catalog.category")}</span>
      <select value={path[0]?.slug ?? ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("catalog.allCategories")}</option>
        {categoryTree.map((item) => <option value={item.slug} key={item.slug}>{localize(item.name, locale)}</option>)}
      </select>
    </label>
    {path.map((parent, index) => parent.children?.length ? <label key={parent.slug}>
      <span>{index === 0 ? t("catalog.subcategory") : t("catalog.categoryType")}</span>
      <select value={path[index + 1]?.slug ?? ""} onChange={(event) => onChange(event.target.value || parent.slug)}>
        <option value="">{t("catalog.allIn", { category: localize(parent.name, locale) })}</option>
        {parent.children.map((item) => <option value={item.slug} key={item.slug}>{localize(item.name, locale)}</option>)}
      </select>
    </label> : null)}
  </div>;
}
