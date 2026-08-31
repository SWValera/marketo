import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attributeSets, categoryOptions, getCategoryBySlug, getCategoryPath } from "../lib/catalog-config.ts";
import { resolveCategoryAttributeSchema } from "../lib/reference-data/category-attribute-schemas.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "docs/CATEGORY_COVERAGE_REPORT.md");
const esc = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const legacyIssues = {
  goods: "Только generic condition",
  car: "Общий transport schema и текстовая model",
  passengerCar: "Model была text; неполное fuel",
  moto: "Только year/engine/mileage",
  parts: "Неструктурированная compatibility",
  phone: "Model была text",
  computer: "Дублировался тип устройства",
  property: "Дублировались сделка и тип объекта",
  job: "Не было salary range/education/work format",
  service: "Один generic set для всех услуг",
  fashion: "Дублировалась аудитория leaf-категории",
  kids: "Один set для разнородных товаров",
  animal: "Дублировался вид животного",
  business: "Готовый бизнес смешивался с оборудованием",
  free: "Минимальный schema",
  exchange: "Только пожелание обмена",
};

const rows = categoryOptions.map((category) => {
  const node = getCategoryBySlug(category.slug);
  const legacySet = node?.attributeSet ?? "inherited";
  const target = resolveCategoryAttributeSchema(category.slug, category.rootSlug);
  const required = target.attributes.filter((item) => item.required).map((item) => item.key);
  const filterable = target.attributes.filter((item) => item.filterable).map((item) => item.key);
  const searchable = target.attributes.filter((item) => item.searchable).map((item) => item.key);
  const optionCount = target.attributes.reduce((sum, item) => sum + (item.options?.length ?? 0), 0);
  const dependencies = target.attributes.filter((item) => item.dependsOnKey).map((item) => `${item.dependsOnKey}→${item.key}`);
  return {
    slug: category.slug,
    path: getCategoryPath(category.slug).map((item) => item.name.ru).join(" → "),
    root: category.rootSlug,
    kind: category.hasChildren ? "group" : "leaf",
    legacySet,
    legacyCount: legacySet in attributeSets ? attributeSets[legacySet].length : 0,
    issue: legacyIssues[legacySet] ?? "Наследовался общий schema",
    profiles: target.profileNames.join(" + "),
    attributes: target.attributes.map((item) => item.key),
    required,
    filterable,
    searchable,
    optionCount,
    dependencies,
  };
});

const totalAttributes = rows.reduce((sum, row) => sum + row.attributes.length, 0);
const totalOptions = rows.reduce((sum, row) => sum + row.optionCount, 0);
const dependentRelations = rows.reduce((sum, row) => sum + row.dependencies.length, 0);
const roots = [...new Set(rows.map((row) => row.root))];
const rootSummary = roots.map((root) => {
  const items = rows.filter((row) => row.root === root);
  return `| ${root} | ${items.length} | ${items.filter((item) => item.kind === "leaf").length} | ${items.reduce((sum, item) => sum + item.attributes.length, 0)} | ${items.reduce((sum, item) => sum + item.optionCount, 0)} |`;
}).join("\n");

const details = rows.map((row) => `| ${esc(row.slug)} | ${esc(row.path)} | ${row.kind} | ${esc(row.legacySet)} (${row.legacyCount}) | ${esc(row.issue)} | ${esc(row.profiles)} | ${esc(row.attributes.join(", "))} | ${esc(row.required.join(", ") || "—")} | ${esc(row.filterable.join(", ") || "—")} | ${esc(row.searchable.join(", ") || "—")} | ${row.optionCount} | ${esc(row.dependencies.join(", ") || "—")} |`).join("\n");

const report = `# Marketo v1.0 — Category Coverage Report

Сформировано автоматически из текущего дерева категорий и единого source-of-truth атрибутов. Runtime UI получает справочники из Supabase; этот документ является проверяемым инженерным отчётом, а не источником runtime-данных.

## Итог

- Категорий: **${rows.length}**.
- Root verticals: **${roots.length}**.
- Leaf-категорий: **${rows.filter((row) => row.kind === "leaf").length}**.
- Эффективных category-attribute связей: **${totalAttributes}**.
- Активных option rows в clean seed: **${totalOptions}**.
- Зависимых attribute relations: **${dependentRelations}**.
- Профили собраны композиционно; одинаковые ключи дедуплицируются последним профильным override.
- Leaf-category не спрашивает повторно тип, уже однозначно определённый путём категории.

## Покрытие по вертикалям

| Root | Категорий | Leaf | Attributes | Options |
|---|---:|---:|---:|---:|
${rootSummary}

## Полная матрица ${rows.length} категорий

| Slug | Полный путь | Тип | Было | Выявленный недостаток | Target profiles | Seller fields / listing display | Required | Buyer filters | Searchable | Options | Dependencies |
|---|---|---|---|---|---|---|---|---|---|---:|---|
${details}

## Принятые правила качества

1. \`select\` и \`multiselect\` не публикуются без options.
2. \`brand → model\` реализуется одной нормализованной option dependency, а не кастомным React-кодом.
3. Большие model dictionaries имеют \`deferred\` load mode; все модели не отправляются на страницу до выбора бренда.
4. \`range\` назначается только параметрам, где покупателю нужен интервал: цена, год, пробег, площадь, зарплата, этаж, мощность и размеры.
5. Значения, введённые продавцом, сохраняются типизированно и теми же metadata отображаются в карточке и фильтрах.
6. \`Другая модель\` доступна для неполного brand/model покрытия; свободный текст показывается только при её выборе.
7. KK значения заполнены. Терминология недвижимости, техники и профессиональных услуг требует финальной проверки носителем казахского языка до публичного content freeze.

## Benchmark

Логика сопоставлена с публичными vertical-фильтрами OLX Kazakhstan (авто, недвижимость, работа, услуги) и общими паттернами крупных классифайдов. Дизайн, тексты и код сторонних площадок не копировались.
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, report, "utf8");
process.stdout.write(`Generated ${outputPath}\n${rows.length} categories, ${totalAttributes} attributes, ${totalOptions} options\n`);
