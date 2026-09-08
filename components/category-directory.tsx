"use client";

import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { CategoryLink } from "@/components/category-link";
import { CategoryIcon } from "@/components/category-icon";
import { useStoredLocation } from "@/components/location-picker";
import { useI18n } from "@/components/i18n-provider";
import { localize } from "@/lib/i18n/config";
import { loadBrowserCategoryReferences } from "@/lib/reference-data/browser";
import {
  createCategoryCatalogView,
  getCategoryChildren,
  getCategoryDescendantCount,
  getCategoryPath,
  getRootCategories,
  searchCategoryReferences,
  type CategoryCatalogView,
} from "@/lib/reference-data/catalog";
import type { CategoryReferenceData, ReferenceCategory } from "@/lib/reference-data/types";

type DirectoryCategory = ReferenceCategory & { childCount?: number };
type DirectoryData = { categories: DirectoryCategory[] };

function CategoryTreeList({
  items,
  view,
  locale,
  cityId,
  ancestors = new Set<string>(),
}: {
  items: ReferenceCategory[];
  view: CategoryCatalogView;
  locale: "ru" | "kk";
  cityId: string;
  ancestors?: ReadonlySet<string>;
}) {
  return <ul className="category-tree-list">
    {items.map((item) => {
      if (ancestors.has(item.id)) return null;
      const nextAncestors = new Set(ancestors).add(item.id);
      const children = getCategoryChildren(view, item).filter((child) => !nextAncestors.has(child.id));
      return <li key={item.id}>
        <CategoryLink cityId={cityId} href={`/category/${item.slug}`}>{localize(item.name, locale)}</CategoryLink>
        {children.length > 0 ? <CategoryTreeList items={children} view={view} locale={locale} cityId={cityId} ancestors={nextAncestors} /> : null}
      </li>;
    })}
  </ul>;
}

export function CategoryDirectory({ initialData }: { initialData: DirectoryData }) {
  const { locale, t } = useI18n();
  const cityId = useStoredLocation();
  const [catalogData, setCatalogData] = useState<DirectoryData>(initialData);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [retryCount, setRetryCount] = useState(0);
  const view = useMemo(
    () => createCategoryCatalogView(catalogData as CategoryReferenceData),
    [catalogData],
  );
  const roots = getRootCategories(view);
  const [query, setQuery] = useState("");
  const [expandedBranches, setExpandedBranches] = useState<ReadonlySet<string>>(() => new Set());
  const normalizedQuery = query.normalize("NFKC").trim();
  const deferredQuery = useDeferredValue(normalizedQuery);
  const searchActive = normalizedQuery.length >= 3;
  const searchResults = useMemo(
    () => loadState === "ready" && deferredQuery.length >= 3
      ? searchCategoryReferences(view, deferredQuery, view.items.length)
      : [],
    [deferredQuery, loadState, view],
  );

  useEffect(() => {
    let active = true;
    void loadBrowserCategoryReferences()
      .then((result) => {
        if (!active) return;
        if (result.status !== "ready" || result.data.categories.length === 0) {
          setLoadState("error");
          return;
        }
        setCatalogData(result.data);
        setLoadState("ready");
      })
      .catch(() => {
        if (active) setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [retryCount]);

  function toggleBranch(id: string, open: boolean) {
    setExpandedBranches((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return <>
    {loadState === "error" ? <section className="empty-state" role="status" data-marketo-error={true}>
      <p>{t("reference.categoriesUnavailable")}</p>
      <button type="button" className="secondary-button" onClick={() => { setLoadState("loading"); setRetryCount(value => value + 1); }}>{t("common.retry")}</button>
    </section> : null}
    <section className="category-directory-tools" aria-label={t("categories.search")}>
      <label className="category-directory-search">
        <Search size={20} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("categories.search")}
          aria-label={t("categories.search")}
          autoComplete="off"
        />
      </label>
      {!searchActive ? <nav className="category-root-jumps" aria-label={t("categories.main")}>
        {roots.map((root) => <a href={`#category-${root.slug}`} key={root.id}>{localize(root.name, locale)}</a>)}
      </nav> : null}
    </section>

    {searchActive ? <section className="category-search-results" aria-live="polite">
      <header><strong>{t("categories.searchResults", { count: searchResults.length })}</strong><span>{t("categories.searchHint")}</span></header>
      {loadState === "loading" ? <p className="category-directory-empty">{t("common.loading")}…</p> : searchResults.length > 0 ? <div>
        {searchResults.map((item) => {
          const path = getCategoryPath(view, item);
          const childrenCount = getCategoryDescendantCount(view, item);
          return <CategoryLink cityId={cityId} href={`/category/${item.slug}`} key={item.id}>
            <span><strong>{localize(item.name, locale)}</strong><small>{path.map((pathItem) => localize(pathItem.name, locale)).join(" → ")}</small></span>
            <span className="category-result-kind">{childrenCount > 0 ? t("categories.subcategories", { count: childrenCount }) : t("categories.exact")}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </CategoryLink>;
        })}
      </div> : <p className="category-directory-empty">{loadState === "error" ? t("reference.categoriesUnavailable") : t("categories.notFound")}</p>}
    </section> : <div className="category-directory">
      {roots.map((root) => {
        const children = getCategoryChildren(view, root);
        const descendantCount = loadState === "ready"
          ? getCategoryDescendantCount(view, root)
          : (root as DirectoryCategory).childCount ?? 0;
        return <section className="category-directory-group" id={`category-${root.slug}`} key={root.id}>
          <CategoryLink cityId={cityId} className="category-directory-title" href={`/category/${root.slug}`}>
            <span className={`category-icon tone-${root.tone ?? "green"}`}><CategoryIcon name={root.icon ?? undefined} /></span>
            <span><strong>{localize(root.name, locale)}</strong><small>{t("categories.subcategories", { count: descendantCount })}</small></span>
            <ChevronRight size={19} aria-hidden="true" />
          </CategoryLink>
          <div className="category-directory-branches">
            {children.map((child) => {
              const nested = getCategoryChildren(view, child);
              const nestedCount = getCategoryDescendantCount(view, child);
              return <article className="category-directory-branch" key={child.id}>
                <CategoryLink cityId={cityId} className="category-branch-title" href={`/category/${child.slug}`}>
                  <strong>{localize(child.name, locale)}</strong>
                  <span>{nestedCount > 0 ? t("categories.subcategories", { count: nestedCount }) : t("categories.exact")}</span>
                </CategoryLink>
                {nested.length > 0 ? <details onToggle={(event) => toggleBranch(child.id, event.currentTarget.open)}>
                  <summary>{t("categories.showSubcategories", { count: nestedCount })}<ChevronDown size={16} aria-hidden="true" /></summary>
                  {expandedBranches.has(child.id) ? <CategoryTreeList items={nested} view={view} locale={locale} cityId={cityId} /> : null}
                </details> : null}
              </article>;
            })}
          </div>
        </section>;
      })}
    </div>}
  </>;
}
