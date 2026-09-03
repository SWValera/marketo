import type {
  CategoryReferenceData,
  LocalizedText,
  ReferenceCategory,
  ReferenceCategoryAttribute,
} from "@/lib/reference-data/types";

export type CategoryCatalogView = {
  items: ReferenceCategory[];
  byId: Map<string, ReferenceCategory>;
  bySlug: Map<string, ReferenceCategory>;
  childrenByParentId: Map<string | null, ReferenceCategory[]>;
};

const viewCache = new WeakMap<CategoryReferenceData, CategoryCatalogView>();
const pathCache = new WeakMap<CategoryCatalogView, Map<string, ReferenceCategory[]>>();
const descendantCache = new WeakMap<CategoryCatalogView, Map<string, { ids: string[]; set: Set<string> }>>();

const compareCategories = (left: ReferenceCategory, right: ReferenceCategory) =>
  left.sortOrder - right.sortOrder || left.name.ru.localeCompare(right.name.ru, "ru");

export function createCategoryCatalogView(reference: CategoryReferenceData): CategoryCatalogView {
  const cached = viewCache.get(reference);
  if (cached) return cached;
  const items = [...reference.categories].sort(compareCategories);
  const byId = new Map(items.map((category) => [category.id, category]));
  const bySlug = new Map(items.map((category) => [category.slug, category]));
  const childrenByParentId = new Map<string | null, ReferenceCategory[]>();

  for (const category of items) {
    const siblings = childrenByParentId.get(category.parentId) ?? [];
    siblings.push(category);
    childrenByParentId.set(category.parentId, siblings);
  }

  const view = { items, byId, bySlug, childrenByParentId };
  viewCache.set(reference, view);
  return view;
}

export function getRootCategories(view: CategoryCatalogView) {
  return view.childrenByParentId.get(null) ?? [];
}

export function getCategoryBySlug(view: CategoryCatalogView, slug?: string | null) {
  return slug ? view.bySlug.get(slug) : undefined;
}

export function getCategoryById(view: CategoryCatalogView, id?: string | null) {
  return id ? view.byId.get(id) : undefined;
}

export function getCategoryChildren(view: CategoryCatalogView, category?: ReferenceCategory | string | null) {
  if (!category) return getRootCategories(view);
  const categoryId = typeof category === "string" ? view.bySlug.get(category)?.id ?? category : category.id;
  return view.childrenByParentId.get(categoryId) ?? [];
}

export function getCategoryParent(view: CategoryCatalogView, category?: ReferenceCategory | string | null) {
  const item = typeof category === "string" ? view.bySlug.get(category) : category;
  return item?.parentId ? view.byId.get(item.parentId) : undefined;
}

export function getCategoryPath(view: CategoryCatalogView, category?: ReferenceCategory | string | null) {
  const item = typeof category === "string" ? view.bySlug.get(category) : category;
  if (!item) return [];
  let paths = pathCache.get(view);
  if (!paths) {
    paths = new Map();
    pathCache.set(view, paths);
  }
  const cached = paths.get(item.id);
  if (cached) return cached;

  const path: ReferenceCategory[] = [];
  let current: ReferenceCategory | undefined = item;
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? view.byId.get(current.parentId) : undefined;
  }

  paths.set(item.id, path);
  return path;
}

function getCategoryDescendants(view: CategoryCatalogView, category: ReferenceCategory | string) {
  const item = typeof category === "string" ? view.bySlug.get(category) : category;
  if (!item) return { ids: [], set: new Set<string>() };
  let descendants = descendantCache.get(view);
  if (!descendants) {
    descendants = new Map();
    descendantCache.set(view, descendants);
  }
  const cached = descendants.get(item.id);
  if (cached) return cached;

  const ids: string[] = [];
  const set = new Set<string>();
  const pending = [item];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || set.has(current.id)) continue;
    set.add(current.id);
    ids.push(current.id);
    pending.push(...(view.childrenByParentId.get(current.id) ?? []));
  }
  const value = { ids, set };
  descendants.set(item.id, value);
  return value;
}

export function getCategoryDescendantIds(view: CategoryCatalogView, category: ReferenceCategory | string) {
  return getCategoryDescendants(view, category).ids;
}

export function getCategoryRoot(view: CategoryCatalogView, category?: ReferenceCategory | string | null) {
  return getCategoryPath(view, category)[0];
}

export function getCategoryDepth(view: CategoryCatalogView, category: ReferenceCategory | string) {
  return Math.max(0, getCategoryPath(view, category).length - 1);
}

export function isCategoryWithin(view: CategoryCatalogView, candidateSlug: string, selectedSlug?: string | null) {
  if (!selectedSlug) return true;
  const candidate = view.bySlug.get(candidateSlug);
  return Boolean(candidate && getCategoryDescendants(view, selectedSlug).set.has(candidate.id));
}

export function searchCategoryReferences(view: CategoryCatalogView, query: string, limit = 40) {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("ru");
  if (!normalized) return [];

  return view.items
    .filter((item) => getCategoryPath(view, item)
      .map((pathItem) => `${pathItem.name.ru} ${pathItem.name.kk}`)
      .join(" ")
      .toLocaleLowerCase("ru")
      .includes(normalized))
    .slice(0, limit);
}

export function getCategoryPresentation(view: CategoryCatalogView, category?: ReferenceCategory | string | null) {
  const path = [...getCategoryPath(view, category)].reverse();
  const firstLocalized = (pick: (item: ReferenceCategory) => LocalizedText | null) =>
    path.map(pick).find((value): value is LocalizedText => Boolean(value));

  return {
    searchPlaceholder: firstLocalized((item) => item.searchPlaceholder),
    titlePlaceholder: firstLocalized((item) => item.titlePlaceholder),
    descriptionHint: firstLocalized((item) => item.descriptionHint),
    priceMode: path[0]?.priceMode ?? "price",
  };
}

export function resolveEffectiveAttributes(
  view: CategoryCatalogView,
  category: ReferenceCategory | string | null | undefined,
  attributesByCategoryId: ReadonlyMap<string, ReferenceCategoryAttribute[]>,
) {
  const path = getCategoryPath(view, category);
  const effective = new Map<string, ReferenceCategoryAttribute>();

  path.forEach((pathItem, index) => {
    const isSelected = index === path.length - 1;
    for (const attribute of attributesByCategoryId.get(pathItem.id) ?? []) {
      if (isSelected || attribute.inheritsToChildren) effective.set(attribute.key, attribute);
    }
  });

  return [...effective.values()].sort((left, right) => left.sortOrder - right.sortOrder);
}
