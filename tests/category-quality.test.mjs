import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { categoryOptions, getCategoryBySlug, getCategoryPath } from "../lib/catalog-config.ts";
import { resolveCategoryAttributeSchema } from "../lib/reference-data/category-attribute-schemas.ts";
import { motorcycleModels, passengerVehicleModels, smartphoneModels } from "../lib/reference-data/dependent-options.ts";
import { ereaderModels, tabletModels } from "../lib/reference-data/device-options.ts";

const dependentSets = [passengerVehicleModels, motorcycleModels, smartphoneModels, tabletModels, ereaderModels];

test("all 1,356 Master Catalog contracts are localized, composable and filter-safe", () => {
  assert.equal(categoryOptions.length, 1356);
  assert.equal(new Set(categoryOptions.map((category) => category.slug)).size, 1356);

  for (const category of categoryOptions) {
    assert.ok(getCategoryBySlug(category.slug), `missing category node: ${category.slug}`);
    assert.ok(getCategoryPath(category.slug).length > 0, `orphan category path: ${category.slug}`);
    const resolved = resolveCategoryAttributeSchema(category.slug, category.rootSlug);
    assert.ok(resolved.profileNames.length > 0, `no composable profile assignment: ${category.slug}`);
    assert.ok(resolved.attributes.length > 0, `no effective attributes: ${category.slug}`);
    assert.equal(new Set(resolved.attributes.map((attribute) => attribute.key)).size, resolved.attributes.length, `duplicate effective attribute key: ${category.slug}`);

    for (const attribute of resolved.attributes) {
      assert.ok(attribute.label.ru.trim() && attribute.label.kk.trim(), `attribute localization gap: ${category.slug}.${attribute.key}`);
      if (attribute.filterMode === "range") assert.ok(["number", "range", "date"].includes(attribute.dataType), `invalid range widget: ${category.slug}.${attribute.key}`);
      if (["select", "multiselect"].includes(attribute.dataType)) {
        assert.ok(attribute.options?.length, `empty option dictionary: ${category.slug}.${attribute.key}`);
        assert.equal(new Set(attribute.options.map((option) => option.value)).size, attribute.options.length, `duplicate option value: ${category.slug}.${attribute.key}`);
        for (const option of attribute.options) assert.ok(option.label.ru.trim() && option.label.kk.trim(), `option localization gap: ${category.slug}.${attribute.key}.${option.value}`);
      }
      if (attribute.dependsOnKey) {
        const parent = resolved.attributes.find((candidate) => candidate.key === attribute.dependsOnKey);
        assert.ok(parent, `missing dependency parent: ${category.slug}.${attribute.key}`);
        const parentValues = new Set(parent.options?.map((option) => option.value));
        for (const option of attribute.options ?? []) {
          if (option.value === "other-model") continue;
          assert.ok(option.parentValue && parentValues.has(option.parentValue), `orphan dependent option: ${category.slug}.${attribute.key}.${option.value}`);
        }
      }
    }
  }
});

test("brand-model dictionaries have stable non-empty values and generic fallback", () => {
  for (const options of dependentSets) {
    assert.ok(options.length > 20);
    assert.equal(new Set(options.map((option) => option.value)).size, options.length);
    assert.ok(options.every((option) => option.value.length > 0));
    assert.ok(options.some((option) => option.value === "other-model"));
    assert.ok(options.filter((option) => option.value !== "other-model").every((option) => Boolean(option.parentValue)));
  }
  assert.ok(passengerVehicleModels.length >= 750, "passenger model baseline unexpectedly shrank");
});

test("every root vertical has a representative leaf with domain-specific seller fields and buyer filters", () => {
  const cases = [
    ["transport", "cars-sedan", ["brand", "model", "year", "mileage", "transmission"], ["salary_from", "rooms"]],
    ["parts", "engine-block-head", ["part_type", "part_number", "compatible_brand", "condition"], ["rooms", "employment"]],
    ["real-estate", "flats-sale", ["rooms", "total_area", "floor", "building_type", "renovation"], ["mileage", "employment"]],
    ["jobs", "jobs-driver", ["salary_from", "salary_to", "employment", "schedule", "experience"], ["brand", "condition"]],
    ["services", "renovation-turnkey", ["price_type", "service_format", "visit", "object_type", "materials_included"], ["mileage", "rooms", "service_type"]],
    ["construction-repair", "building-brick", ["material", "size_spec", "quantity", "sale_unit", "condition"], ["employment", "mileage"]],
    ["goods-rental", "rental-power-tools", ["billing_period", "minimum_term", "deposit", "documents_required", "condition"], ["rooms", "salary_from"]],
    ["electronics", "smartphones", ["brand", "model", "storage", "ram", "condition"], ["salary_from", "total_area"]],
    ["home-garden", "home-sofas", ["furniture_type", "material", "dimensions", "delivery"], ["employment", "mileage"]],
    ["personal", "women-dresses", ["brand", "size", "season", "material"], ["rooms", "salary_from"]],
    ["kids", "baby-clothing", ["age_group", "size", "gender", "season"], ["engine_volume", "employment"]],
    ["hobby", "sports-fitness-equipment", ["sport", "product_type", "brand", "condition"], ["rooms", "salary_from"]],
    ["animals", "cats", ["breed", "age_months", "vaccinated", "pedigree"], ["mileage", "floor"]],
    ["business", "business-showcases-counters", ["brand", "model", "power", "capacity"], ["rooms", "employment"]],
    ["free", "free-furniture", ["condition", "furniture_type", "material", "delivery"], ["salary_from", "engine_volume"]],
    ["exchange", "exchange-cars", ["wanted", "brand", "model", "year"], ["rooms", "employment"]],
  ];

  assert.deepEqual([...new Set(categoryOptions.map((category) => category.rootSlug))].sort(), cases.map(([root]) => root).sort());
  for (const [root, slug, requiredKeys, forbiddenKeys] of cases) {
    const category = categoryOptions.find((candidate) => candidate.slug === slug);
    assert.ok(category && category.rootSlug === root && !category.hasChildren, `invalid representative leaf: ${root}/${slug}`);
    const attributes = resolveCategoryAttributeSchema(slug, root).attributes;
    const keys = new Set(attributes.map((attribute) => attribute.key));
    for (const key of requiredKeys) assert.ok(keys.has(key), `missing ${slug}.${key}`);
    for (const key of forbiddenKeys) assert.ok(!keys.has(key), `irrelevant ${slug}.${key}`);
    assert.ok(attributes.some((attribute) => attribute.required) || root === "free", `no required seller field: ${slug}`);
    assert.ok(attributes.some((attribute) => attribute.filterable), `no buyer filter: ${slug}`);
  }
});

test("generated coverage report contains one auditable row per category", async () => {
  const report = await readFile(new URL("../docs/CATEGORY_COVERAGE_REPORT.md", import.meta.url), "utf8");
  assert.match(report, /Категорий: \*\*1356\*\*/);
  assert.match(report, /Эффективных category-attribute связей: \*\*9373\*\*/);
  assert.match(report, /Активных option rows в clean seed: \*\*87150\*\*/);
  const matrix = report.split("## Полная матрица 1356 категорий\n")[1]?.split("## Принятые правила качества\n")[0] ?? "";
  const dataRows = matrix.split("\n").filter((line) => /^\| [a-z0-9-]+ \|/.test(line));
  assert.equal(dataRows.length, 1356);
});
