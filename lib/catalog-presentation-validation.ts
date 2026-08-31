import {
  categoryOptions,
  categoryTree,
  getCategoryBySlug,
  getCategoryPresentation,
  type CategoryNode,
} from "./catalog-config.ts";
import {
  buildContextualCategoryPresentation,
  CATEGORY_PRESENTATION_PROFILES,
} from "./catalog-presentation.ts";
import { resolveCategoryAttributeSchema } from "./reference-data/category-attribute-schemas.ts";
import { passengerVehicleModels, smartphoneModels } from "./reference-data/dependent-options.ts";
import { ereaderModels, tabletModels } from "./reference-data/device-options.ts";

const EXPECTED_CATEGORIES = 1_356;
const EXPECTED_LEAVES = 1_137;
const metadataFields = ["searchPlaceholder", "titlePlaceholder", "descriptionHint"] as const;
const locales = ["ru", "kk"] as const;
const vehicleBodyLeaves = [
  "cars-sedan", "cars-suv", "cars-hatchback", "cars-liftback", "cars-wagon",
  "cars-minivan", "cars-coupe", "cars-cabriolet", "cars-pickup", "cars-other-body",
];

const normalized = (value: string) => value
  .normalize("NFKC")
  .toLocaleLowerCase("ru")
  .replaceAll("ё", "е")
  .replace(/[^a-zа-яәғқңөұүһі0-9]+/g, "")
  .trim();

function collectReachable(nodes: CategoryNode[], target = new Set<string>()) {
  for (const node of nodes) {
    target.add(node.slug);
    if (node.children?.length) collectReachable(node.children, target);
  }
  return target;
}

export function validateContextualCategoryMetadata() {
  const failures: string[] = [];
  let assertions = 0;
  let assignments = 0;
  const check = (condition: unknown, message: string) => {
    assertions += 1;
    if (!condition) failures.push(message);
  };

  const reachable = collectReachable(categoryTree);
  const leaves = categoryOptions.filter((category) => !category.hasChildren);
  check(categoryOptions.length === EXPECTED_CATEGORIES, `Master Catalog shrank: ${categoryOptions.length}/${EXPECTED_CATEGORIES}`);
  check(leaves.length === EXPECTED_LEAVES, `Master Catalog leaf count changed: ${leaves.length}/${EXPECTED_LEAVES}`);
  check(reachable.size === EXPECTED_CATEGORIES, `not all Master Catalog categories are reachable: ${reachable.size}/${EXPECTED_CATEGORIES}`);
  check(categoryOptions.every((category) => reachable.has(category.slug)), "category index contains an unreachable category");

  for (const category of categoryOptions) {
    const node = getCategoryBySlug(category.slug);
    check(Boolean(node), `category lookup failed: ${category.slug}`);
    if (!node) continue;
    const presentation = getCategoryPresentation(category.slug);
    const expected = buildContextualCategoryPresentation(node, category.rootSlug);
    check(Boolean(CATEGORY_PRESENTATION_PROFILES[category.rootSlug]), `missing presentation profile: ${category.rootSlug}`);
    for (const field of metadataFields) {
      check(Boolean(node[field]), `contextual field is inherited instead of explicit: ${category.slug}.${field}`);
      for (const locale of locales) {
        assignments += 1;
        const value = presentation[field]?.[locale] ?? "";
        check(Boolean(value.trim()), `missing metadata locale: ${category.slug}.${field}.${locale}`);
        check(value === expected[field][locale], `metadata source-of-truth mismatch: ${category.slug}.${field}.${locale}`);
        check(normalized(value).includes(normalized(category.name[locale])), `metadata lacks category context: ${category.slug}.${field}.${locale}`);
      }
    }
  }

  const metadataText = (slug: string) => normalized(metadataFields
    .flatMap((field) => locales.map((locale) => getCategoryPresentation(slug)[field]?.[locale] ?? ""))
    .join(" "));
  const mentioned = <T extends { value: string; label: { ru: string; kk: string } }>(text: string, options: T[]) =>
    options.filter((option) => option.value !== "other-model" && [option.label.ru, option.label.kk]
      .map(normalized)
      .filter((label) => label.length >= 4)
      .some((label) => text.includes(label)));

  for (const slug of vehicleBodyLeaves) {
    const allowed = new Set(resolveCategoryAttributeSchema(slug, "transport").attributes
      .find((attribute) => attribute.key === "model")?.options?.map((option) => option.value) ?? []);
    const invalid = mentioned(metadataText(slug), passengerVehicleModels).filter((option) => !allowed.has(option.value));
    check(invalid.length === 0, `vehicle metadata has out-of-scope models: ${slug}.${invalid.map((option) => option.value).join(",")}`);
  }

  const allDeviceModels = [...smartphoneModels, ...tabletModels, ...ereaderModels];
  for (const slug of ["smartphones", "tablets", "ereaders"]) {
    const allowed = new Set(resolveCategoryAttributeSchema(slug, "electronics").attributes
      .find((attribute) => attribute.key === "model")?.options?.map((option) => option.value) ?? []);
    const invalid = mentioned(metadataText(slug), allDeviceModels).filter((option) => !allowed.has(option.value));
    check(invalid.length === 0, `device metadata has out-of-scope models: ${slug}.${invalid.map((option) => option.value).join(",")}`);
  }

  check(!/camry|камри/.test(metadataText("cars-suv")), "cars-suv metadata contains Camry");
  const airConditionerTerms = /кондицион|aircondition|желдеткіш/;
  check(!airConditionerTerms.test(metadataText("manicure-service")), "manicure metadata contains air-conditioner context");
  check(!airConditionerTerms.test(metadataText("legal-services")), "legal-services metadata contains air-conditioner context");

  for (const category of categoryOptions.filter((candidate) => candidate.rootSlug === "jobs")) {
    const presentation = getCategoryPresentation(category.slug);
    for (const field of metadataFields) {
      check(/ваканс|должност|работ/.test((presentation[field]?.ru ?? "").toLocaleLowerCase("ru")), `job RU context missing: ${category.slug}.${field}`);
      check(/бос орын|лауазым|жұмыс/.test((presentation[field]?.kk ?? "").toLocaleLowerCase("kk")), `job KK context missing: ${category.slug}.${field}`);
    }
  }

  const smartphone = metadataText("smartphones");
  const tablet = metadataText("tablets");
  check(/смартфон/.test(smartphone) && !/планшет|ipad/.test(smartphone), "smartphone metadata uses tablet context");
  check(/планшет/.test(tablet) && !/смартфон|iphone/.test(tablet), "tablet metadata uses smartphone context");

  return { failures, assertions, assignments };
}
