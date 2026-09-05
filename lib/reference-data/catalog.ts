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

const ROOT_CATEGORY_ORDER = [
  "transport",
  "real-estate",
  "jobs",
  "services",
  "construction-repair",
  "goods-rental",
  "electronics",
  "parts",
  "home-garden",
  "personal",
  "kids",
  "hobby",
  "animals",
  "business",
  "free",
  "exchange",
] as const;
const rootCategoryPriority = new Map<string, number>(ROOT_CATEGORY_ORDER.map((slug, index) => [slug, index]));

const categorySearchAliases: Record<string, string> = {
  cars: "машина машины авто автомобиль автомобили легковушка",
  smartphones: "айфон iphone ios смартфон смартфоны телефон телефоны сотовый",
  laptops: "ноут ноутбук ноутбуки laptop",
  "flats-sale": "квартира квартиры жильё жилье купить квартиру",
  "flats-rent": "квартира квартиры жильё жилье снять квартиру аренда квартиры",
  "flats-daily": "квартира квартиры жильё жилье посуточно квартира на сутки",
  "houses-sale": "дом дома коттедж купить дом",
  "houses-rent": "дом дома коттедж снять дом аренда дома",
  "jobs-driver": "водитель шофёр шофер",
  "plumbing-services": "сантехник сантехнические работы",
};

const normalizeSearchText = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const stemSearchWord = (value: string) => value.length < 5 || !/[а-я]/u.test(value)
  ? value
  : value.replace(/(иями|ями|ами|ого|ему|ому|ыми|ими|иях|ах|ях|ую|юю|ая|яя|ое|ее|ые|ие|ый|ий|ой|ов|ев|ам|ям|ом|ем|а|я|ы|и|у|ю|е)$/u, "");
const searchTokens = (value: string) => normalizeSearchText(value).split(" ").filter(Boolean).map(stemSearchWord);
function matchesCategorySearch(haystack: string, query: string) {
  const normalizedHaystack = normalizeSearchText(haystack);
  if (normalizedHaystack.includes(query)) return true;
  const haystackTokens = searchTokens(normalizedHaystack);
  return searchTokens(query).every((needle) => haystackTokens.some((candidate) => (
    candidate === needle
    || (candidate.length >= 3 && needle.length >= 3 && (candidate.startsWith(needle) || needle.startsWith(candidate)))
  )));
}

const compareCategories = (left: ReferenceCategory, right: ReferenceCategory) => {
  if (left.parentId === null && right.parentId === null) {
    const leftPriority = rootCategoryPriority.get(left.slug) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = rootCategoryPriority.get(right.slug) ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  }
  return left.sortOrder - right.sortOrder || left.name.ru.localeCompare(right.name.ru, "ru");
};

export function sortCategoryReferences<T extends ReferenceCategory>(items: readonly T[]) {
  return [...items].sort(compareCategories);
}

export function createCategoryCatalogView(reference: CategoryReferenceData): CategoryCatalogView {
  const cached = viewCache.get(reference);
  if (cached) return cached;
  const items = [...reference.categories].sort((left, right) => left.sortOrder - right.sortOrder || left.name.ru.localeCompare(right.name.ru, "ru"));
  const byId = new Map(items.map((category) => [category.id, category]));
  const bySlug = new Map(items.map((category) => [category.slug, category]));
  const childrenByParentId = new Map<string | null, ReferenceCategory[]>();

  for (const category of items) {
    const siblings = childrenByParentId.get(category.parentId) ?? [];
    siblings.push(category);
    childrenByParentId.set(category.parentId, siblings);
  }
  for (const siblings of childrenByParentId.values()) siblings.sort(compareCategories);

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

export function getCategoryDescendantCount(view: CategoryCatalogView, category: ReferenceCategory | string) {
  return Math.max(0, getCategoryDescendants(view, category).ids.length - 1);
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
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];

  return view.items
    .map((item) => {
      const ownName = normalizeSearchText(`${item.name.ru} ${item.name.kk}`);
      const aliases = normalizeSearchText(categorySearchAliases[item.slug] ?? "");
      const pathName = getCategoryPath(view, item)
        .map((pathItem) => `${pathItem.name.ru} ${pathItem.name.kk} ${categorySearchAliases[pathItem.slug] ?? ""}`)
        .join(" ")
        .normalize("NFKC");
      const score = ownName === normalized
        ? 0
        : aliases.split(" ").includes(normalized)
          ? 1
          : ownName.startsWith(normalized)
            ? 2
            : matchesCategorySearch(`${ownName} ${aliases}`, normalized)
              ? 3
              : matchesCategorySearch(pathName, normalized)
                ? 4
                : null;
      return { item, score };
    })
    .filter((candidate): candidate is { item: ReferenceCategory; score: number } => candidate.score !== null)
    .sort((left, right) => left.score - right.score || compareCategories(left.item, right.item))
    .map(({ item }) => item)
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
