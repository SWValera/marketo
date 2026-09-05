import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCategoryCatalogView,
  getCategoryDescendantCount,
  getRootCategories,
  searchCategoryReferences,
} from "../lib/reference-data/catalog.ts";

const category = (id, slug, name, parentId, sortOrder) => ({
  id,
  parentId,
  slug,
  name: { ru: name, kk: name },
  icon: null,
  tone: null,
  searchPlaceholder: null,
  titlePlaceholder: null,
  descriptionHint: null,
  priceMode: "price",
  sortOrder,
});

const view = createCategoryCatalogView({ categories: [
  category("free", "free", "Отдам бесплатно", null, 1),
  category("property", "real-estate", "Недвижимость", null, 20),
  category("transport", "transport", "Транспорт", null, 30),
  category("cars", "cars", "Легковые автомобили", "transport", 31),
  category("sedans", "cars-sedan", "Седаны", "cars", 32),
  category("flats", "flats-sale", "Квартиры", "property", 21),
  category("services", "services", "Услуги", null, 50),
  category("exam", "exam-preparation", "Подготовка к ЕНТ и экзаменам", "services", 51),
  category("electronics", "electronics", "Электроника", null, 40),
  category("phones", "phones-accessories", "Телефоны и аксессуары", "electronics", 41),
  category("smartphones", "smartphones", "Смартфоны", "phones", 42),
] });

test("catalog roots use the buyer-oriented order and descendants include every depth", () => {
  assert.deepEqual(getRootCategories(view).map((item) => item.slug), ["transport", "real-estate", "services", "electronics", "free"]);
  assert.equal(getCategoryDescendantCount(view, "transport"), 2);
  assert.equal(getCategoryDescendantCount(view, "electronics"), 2);
});

test("category search understands common words, word forms and full paths", () => {
  const flatResults = searchCategoryReferences(view, "квартира");
  assert.equal(flatResults[0]?.slug, "flats-sale");
  assert.equal(flatResults.some((item) => item.slug === "exam-preparation"), false);
  assert.equal(searchCategoryReferences(view, "айфон")[0]?.slug, "smartphones");
  assert.equal(searchCategoryReferences(view, "iphone")[0]?.slug, "smartphones");
  assert.equal(searchCategoryReferences(view, "машина")[0]?.slug, "cars");
});

test("catalog UI exposes the full tree and protects branch-level filtering", async () => {
  const [directory, categoryPage, catalogClient, searchPage, messages, migration] = await Promise.all([
    readFile(new URL("../components/category-directory.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/category/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/catalog-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/search/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/i18n/messages.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/0026_catalog_navigation_ux.sql", import.meta.url), "utf8"),
  ]);
  assert.match(directory, /function CategoryTreeList[\s\S]*<CategoryTreeList items=\{children\}/);
  assert.match(directory, /searchCategoryReferences\(view, normalizedQuery, view\.items\.length\)/);
  assert.match(directory, /const searchActive = normalizedQuery\.length >= 3/);
  assert.match(directory, /loadState === "ready" && searchActive \? searchCategoryReferences/);
  assert.match(directory, /<Link id=\{\`category-\$\{root\.slug\}\`\} href=\{\`\/category\/\$\{root\.slug\}\`\}/);
  assert.match(categoryPage, /<CatalogClient[\s\S]*categoryNavigation=\{<CategoryBrowseGrid[^>]*categorySlug=\{filteredCategory\.slug\}/);
  assert.doesNotMatch(categoryPage, /categoryNavigation=\{<CategoryBrowseGrid[^>]*categorySlug=\{category\.slug\}/);
  assert.match(categoryPage, /const parent = getCategoryParent\(view, filteredCategory\)/);
  assert.match(categoryPage, /const path = getCategoryPath\(view, filteredCategory\)/);
  assert.doesNotMatch(categoryPage, /initialCatalog=\{catalog\}/);
  assert.match(searchPage, /const catalogPromise = parsed\.categorySlug[\s\S]*\? getCategoryReferences\(\)[\s\S]*EMPTY_CATEGORIES/);
  assert.match(catalogClient, /activeCategoryIsLeaf[\s\S]*useCategoryAttributes\(activeCategoryIsLeaf/);
  assert.match(catalogClient, /PRIMARY_CATEGORY_FILTER_LIMIT = 8/);
  assert.match(messages, /"categories\.subcategories": "Подкатегории: \{count\}"/);
  assert.match(migration, /active category count mismatch: expected 1356/);
  assert.match(migration, /Стройматериалы и инструменты/);
  assert.match(migration, /search_placeholder_ru\s*=\s*'Поиск строительных товаров: «Стройматериалы и инструменты»'/);
  assert.match(migration, /search_placeholder_kk\s*=\s*'Құрылыс тауарларын іздеу: «Құрылыс материалдары мен құралдар»'/);
  assert.match(migration, /title_placeholder_ru\s*=\s*'Укажите материал, товар или инструмент: «Стройматериалы и инструменты»'/);
  assert.match(migration, /title_placeholder_kk\s*=\s*'Материалды, тауарды немесе құралды көрсетіңіз: «Құрылыс материалдары мен құралдар»'/);
  assert.match(migration, /description_hint_ru\s*=\s*'Категория: «Стройматериалы и инструменты»\. Укажите назначение, материал, размер, количество, состояние и условия доставки\.'/);
  assert.match(migration, /description_hint_kk\s*=\s*'Санат: «Құрылыс материалдары мен құралдар»\. Мақсатын, материалын, өлшемін, санын, күйін және жеткізу шарттарын көрсетіңіз\.'/);
});
