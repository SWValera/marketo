import { ChevronRight } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { CategoryLink } from "@/components/category-link";
import { localize } from "@/lib/i18n/config";
import { translate, type Locale } from "@/lib/i18n/messages";
import {
  createCategoryCatalogView,
  getCategoryBySlug,
  getCategoryChildren,
  getCategoryDescendantCount,
  getCategoryRoot,
} from "@/lib/reference-data/catalog";
import type { CategoryReferenceData } from "@/lib/reference-data/types";

const CHILD_PREVIEW_LIMIT = 8;

export function CategoryBrowseGrid({
  data,
  categorySlug,
  locale,
  cityId,
}: {
  data: CategoryReferenceData;
  categorySlug: string;
  locale: Locale;
  cityId?: string;
}) {
  const view = createCategoryCatalogView(data);
  const category = getCategoryBySlug(view, categorySlug);
  if (!category) return null;
  const children = getCategoryChildren(view, category);
  if (children.length === 0) return null;
  const root = getCategoryRoot(view, category);

  return <section className="category-browse" aria-labelledby="category-browse-title">
    <header>
      <div><span className="section-kicker">{translate(locale, "categories.refine")}</span><h2 id="category-browse-title">{translate(locale, "categories.browseInside", { category: localize(category.name, locale) })}</h2></div>
      <Link href={`/categories#category-${root?.slug ?? category.slug}`}>{translate(locale, "categories.allCategories")}<ChevronRight size={16} aria-hidden="true" /></Link>
    </header>
    <div className="category-browse-grid">
      {children.map((child) => {
        const nested = getCategoryChildren(view, child);
        const descendantCount = getCategoryDescendantCount(view, child);
        const preview = nested.slice(0, CHILD_PREVIEW_LIMIT);
        return <article className="category-browse-card" key={child.id}>
          <CategoryLink cityId={cityId} className="category-browse-card-title" href={`/category/${child.slug}`}>
            <span><strong>{localize(child.name, locale)}</strong><small>{descendantCount > 0 ? translate(locale, "categories.subcategories", { count: descendantCount }) : translate(locale, "categories.openListings")}</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </CategoryLink>
          {preview.length > 0 ? <div className="category-browse-links">
            {preview.map((nestedItem) => <CategoryLink cityId={cityId} href={`/category/${nestedItem.slug}`} key={nestedItem.id}>{localize(nestedItem.name, locale)}</CategoryLink>)}
            {nested.length > CHILD_PREVIEW_LIMIT ? <CategoryLink cityId={cityId} className="category-browse-more" href={`/category/${child.slug}`}>{translate(locale, "categories.moreSubcategories", { count: nested.length - CHILD_PREVIEW_LIMIT })}</CategoryLink> : null}
          </div> : null}
        </article>;
      })}
    </div>
  </section>;
}
