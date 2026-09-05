"use client";

import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppLink as Link } from "@/components/app-link";
import { CategoryIcon } from "@/components/category-icon";
import { useI18n } from "@/components/i18n-provider";
import { localize } from "@/lib/i18n/config";
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

function CategoryTreeList({
  items,
  view,
  locale,
  ancestors = new Set<string>(),
}: {
  items: ReferenceCategory[];
  view: CategoryCatalogView;
  locale: "ru" | "kk";
  ancestors?: ReadonlySet<string>;
}) {
  return <ul className="category-tree-list">
    {items.map((item) => {
      if (ancestors.has(item.id)) return null;
      const nextAncestors = new Set(ancestors).add(item.id);
      const children = getCategoryChildren(view, item).filter((child) => !nextAncestors.has(child.id));
      return <li key={item.id}>
        <Link href={`/category/${item.slug}`}>{localize(item.name, locale)}</Link>
        {children.length > 0 ? <CategoryTreeList items={children} view={view} locale={locale} ancestors={nextAncestors} /> : null}
      </li>;
    })}
  </ul>;
}

type DirectoryLoadState = "loading" | "ready" | "error";

export function CategoryDirectory({ initialData }: { initialData: CategoryReferenceData }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState(initialData);
  const [loadState, setLoadState] = useState<DirectoryLoadState>("loading");
  const view = useMemo(() => createCategoryCatalogView(data), [data]);
  const roots = getRootCategories(view);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.normalize("NFKC").trim();
  const searchActive = normalizedQuery.length >= 3;
  const searchResults = useMemo(
    () => loadState === "ready" && searchActive ? searchCategoryReferences(view, normalizedQuery, view.items.length) : [],
    [loadState, normalizedQuery, searchActive, view],
  );

  useEffect(() => {
    let active = true;
    void import("@/lib/reference-data/browser")
      .then(({ loadBrowserCategoryReferences }) => loadBrowserCategoryReferences())
      .then((catalog) => {
        if (!active) return;
        if (catalog.status !== "ready") throw new Error("category_directory_unavailable");
        setData(catalog.data);
        setLoadState("ready");
      })
      .catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, []);

  return <>
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
          disabled={loadState !== "ready"}
        />
      </label>
      {!searchActive && loadState === "ready" ? <nav className="category-root-jumps" aria-label={t("categories.main")}>
        {roots.map((root) => <a href={`#category-${root.slug}`} key={root.id}>{localize(root.name, locale)}</a>)}
      </nav> : null}
    </section>

    {loadState !== "ready" ? <section className="category-directory-bootstrap" aria-live="polite" aria-busy={loadState === "loading" || undefined}>
      <div>{roots.map((root) => <Link id={`category-${root.slug}`} href={`/category/${root.slug}`} key={root.id}><span className={`category-icon tone-${root.tone ?? "green"}`}><CategoryIcon name={root.icon ?? undefined} /></span><strong>{localize(root.name, locale)}</strong><ChevronRight size={18} aria-hidden="true" /></Link>)}</div>
      <p className={loadState === "error" ? "is-error" : undefined}>{loadState === "loading" ? t("categories.loadingTree") : t("reference.categoriesUnavailable")}</p>
    </section> : searchActive ? <section className="category-search-results" aria-live="polite">
      <header><strong>{t("categories.searchResults", { count: searchResults.length })}</strong><span>{t("categories.searchHint")}</span></header>
      {searchResults.length > 0 ? <div>
        {searchResults.map((item) => {
          const path = getCategoryPath(view, item);
          const childrenCount = getCategoryDescendantCount(view, item);
          return <Link href={`/category/${item.slug}`} key={item.id}>
            <span><strong>{localize(item.name, locale)}</strong><small>{path.map((pathItem) => localize(pathItem.name, locale)).join(" → ")}</small></span>
            <span className="category-result-kind">{childrenCount > 0 ? t("categories.subcategories", { count: childrenCount }) : t("categories.exact")}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>;
        })}
      </div> : <p className="category-directory-empty">{t("categories.notFound")}</p>}
    </section> : <div className="category-directory">
      {roots.map((root) => {
        const children = getCategoryChildren(view, root);
        const descendantCount = getCategoryDescendantCount(view, root);
        return <section className="category-directory-group" id={`category-${root.slug}`} key={root.id}>
          <Link className="category-directory-title" href={`/category/${root.slug}`}>
            <span className={`category-icon tone-${root.tone ?? "green"}`}><CategoryIcon name={root.icon ?? undefined} /></span>
            <span><strong>{localize(root.name, locale)}</strong><small>{t("categories.subcategories", { count: descendantCount })}</small></span>
            <ChevronRight size={19} aria-hidden="true" />
          </Link>
          <div className="category-directory-branches">
            {children.map((child) => {
              const nested = getCategoryChildren(view, child);
              const nestedCount = getCategoryDescendantCount(view, child);
              return <article className="category-directory-branch" key={child.id}>
                <Link className="category-branch-title" href={`/category/${child.slug}`}>
                  <strong>{localize(child.name, locale)}</strong>
                  <span>{nestedCount > 0 ? t("categories.subcategories", { count: nestedCount }) : t("categories.exact")}</span>
                </Link>
                {nested.length > 0 ? <details>
                  <summary>{t("categories.showSubcategories", { count: nestedCount })}<ChevronDown size={16} aria-hidden="true" /></summary>
                  <CategoryTreeList items={nested} view={view} locale={locale} />
                </details> : null}
              </article>;
            })}
          </div>
        </section>;
      })}
    </div>}
  </>;
}
