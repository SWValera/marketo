import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  categoryOptions,
  categoryTree,
  getCategoryPath,
} from "../lib/catalog-config.ts";
import {
  categorySchemaProfiles,
  resolveCategoryAttributeSchema,
} from "../lib/reference-data/category-attribute-schemas.ts";
import {
  motorcycleModels,
  passengerVehicleModels,
  smartphoneModels,
} from "../lib/reference-data/dependent-options.ts";
import {
  ereaderModels,
  fastMovingReferenceSources,
  tabletModels,
} from "../lib/reference-data/device-options.ts";
import {
  passengerVehicleBodyScopes,
  passengerVehicleModelsByBody,
  vehicleBodyReference,
} from "../lib/reference-data/vehicle-body-models.ts";
import { validateContextualCategoryMetadata } from "../lib/catalog-presentation-validation.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localizedPresent = (value) => Boolean(value?.ru?.trim() && value?.kk?.trim());
const normalizedName = (value) => value
  .normalize("NFKC")
  .toLocaleLowerCase("ru")
  .replace(/[^a-zа-яәғқңөұүһіёа-я0-9]+/g, "")
  .trim();

const requiredRoots = [
  "transport", "parts", "real-estate", "jobs", "services", "construction-repair",
  "goods-rental", "electronics", "home-garden", "personal", "kids", "hobby",
  "animals", "business", "exchange", "free",
];

const requiredCoverage = [
  // Transport and vehicle types.
  "cars-sedan", "cars-suv", "cars-hatchback", "cars-liftback", "cars-wagon",
  "cars-minivan", "cars-coupe", "cars-cabriolet", "cars-pickup", "cars-other-body",
  "road-motorcycles", "trucks", "buses", "minibuses", "trailers",
  "construction-machinery", "tractors", "water-transport", "air-transport",
  // Marketplace verticals.
  "flats-sale", "houses-rent", "commercial-rent", "jobs-it", "jobs-agriculture",
  "construction-repair", "construction-plumbing", "ventilation-building",
  "goods-rental", "rental-power-tools", "rental-special-machinery",
  "smartphones", "tablets", "ereaders", "washing-machines", "air-conditioners",
  "business-ready-production", "exchange-cars", "free-furniture",
  // Deep services benchmark.
  "plumber-emergency", "electrical-wiring", "air-conditioner-installation",
  "air-conditioner-repair", "air-conditioner-cleaning", "air-conditioner-refill",
  "air-conditioner-maintenance", "washing-machine-repair", "smartphone-repair",
  "engine-repair-service", "cargo-transport-intercity", "moving-services",
  "haircut-service", "math-tutor", "website-development", "legal-consultation",
  "bookkeeping-service", "wedding-photography", "event-planning",
  "apartment-cleaning", "physical-security-service", "veterinary-service",
  "custom-kitchen-service", "soil-tillage-service", "business-consulting-service",
];

const requiredLeafCoverage = [
  "cars-sedan", "cars-suv", "cars-other-body", "air-conditioner-installation",
  "air-conditioner-repair", "air-conditioner-cleaning", "air-conditioner-refill",
  "air-conditioner-maintenance", "washing-machine-repair", "smartphone-repair",
  "cargo-transport-intercity", "math-tutor", "website-development",
  "legal-consultation", "bookkeeping-service", "wedding-photography",
  "event-planning", "apartment-cleaning", "physical-security-service",
  "veterinary-service", "custom-kitchen-service", "soil-tillage-service",
  "business-consulting-service", "tablets", "ereaders", "rental-power-tools",
];

const broadMustBeBranches = [
  "services", "repair-construction-services", "household-services", "appliance-repair",
  "auto-services", "transport-services", "beauty-health-services", "education-services",
  "it-services", "photo-video-services", "legal-services", "accounting-services",
  "event-services", "cleaning-services", "pet-services", "furniture-services",
  "agro-services", "business-services", "ventilation-conditioning-services",
  "air-conditioning-services", "construction-repair", "goods-rental",
  "tablets-ereaders", "home-appliances", "kitchen-appliances", "climate-equipment",
  "furniture", "sports", "farm-animals", "ready-business",
];

const intentionalFallbacks = [
  "cars-other-body", "other-transport-unlisted", "other-services",
  "other-home-furniture", "free-other", "exchange-other",
  "other-construction-goods", "other-rental-goods",
];

const bodyLeafSlugs = [
  "cars-sedan", "cars-suv", "cars-hatchback", "cars-liftback", "cars-wagon",
  "cars-minivan", "cars-coupe", "cars-cabriolet", "cars-pickup", "cars-other-body",
];

function optionExists(options, parentValue, label) {
  return options.some((option) => option.parentValue === parentValue && option.label.ru === label);
}

export function validateMasterCatalog() {
  const failures = [];
  let assertions = 0;
  let attributeAssignments = 0;
  let optionAssignments = 0;
  const check = (condition, message) => {
    assertions += 1;
    if (!condition) failures.push(message);
  };

  const nodesBySlug = new Map();
  const parentBySlug = new Map();
  const rootBySlug = new Map();
  const leaves = [];

  function visit(nodes, parent = null, root = null, ancestors = new Set()) {
    check(Array.isArray(nodes) && nodes.length > 0, `empty category children under ${parent?.slug ?? "ROOT"}`);
    const siblingSlugs = new Set();
    const siblingNamesRu = new Set();
    const siblingNamesKk = new Set();
    for (const node of nodes) {
      check(!ancestors.has(node), `category cycle at ${node.slug}`);
      if (ancestors.has(node)) continue;
      check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(node.slug), `invalid category slug: ${node.slug}`);
      check(!nodesBySlug.has(node.slug), `duplicate category slug: ${node.slug}`);
      check(!siblingSlugs.has(node.slug), `duplicate sibling slug: ${node.slug}`);
      check(localizedPresent(node.name), `missing RU/KK category name: ${node.slug}`);
      const ruKey = normalizedName(node.name?.ru ?? "");
      const kkKey = normalizedName(node.name?.kk ?? "");
      check(Boolean(ruKey) && !siblingNamesRu.has(ruKey), `semantic RU sibling duplicate: ${node.slug}`);
      check(Boolean(kkKey) && !siblingNamesKk.has(kkKey), `semantic KK sibling duplicate: ${node.slug}`);
      siblingSlugs.add(node.slug);
      siblingNamesRu.add(ruKey);
      siblingNamesKk.add(kkKey);
      nodesBySlug.set(node.slug, node);
      parentBySlug.set(node.slug, parent?.slug ?? null);
      rootBySlug.set(node.slug, root?.slug ?? node.slug);
      if (node.children?.length) {
        visit(node.children, node, root ?? node, new Set([...ancestors, node]));
      } else {
        leaves.push(node);
      }
    }
  }

  visit(categoryTree);
  check(nodesBySlug.size === categoryOptions.length, "tree/index category count mismatch");
  check(leaves.length === categoryOptions.filter((category) => !category.hasChildren).length, "tree/index leaf count mismatch");
  check(categoryTree.length === requiredRoots.length, "unexpected root vertical count");
  check(new Set(requiredRoots).size === requiredRoots.length, "duplicate required root declaration");
  for (const rootSlug of requiredRoots) {
    const node = nodesBySlug.get(rootSlug);
    check(Boolean(node), `missing root vertical: ${rootSlug}`);
    check(parentBySlug.get(rootSlug) === null, `root has a parent: ${rootSlug}`);
  }
  check(categoryTree.map((node) => node.slug).sort().join("|") === [...requiredRoots].sort().join("|"), "root vertical set differs from Master Catalog contract");

  for (const category of categoryOptions) {
    check(nodesBySlug.has(category.slug), `orphan indexed category: ${category.slug}`);
    check(category.parentSlug === parentBySlug.get(category.slug) || (!category.parentSlug && parentBySlug.get(category.slug) === null), `invalid parent relation: ${category.slug}`);
    check(category.rootSlug === rootBySlug.get(category.slug), `invalid root relation: ${category.slug}`);
    const path = getCategoryPath(category.slug);
    check(path.length === category.depth + 1, `invalid path depth: ${category.slug}`);
    check(path.at(-1)?.slug === category.slug, `path does not end at category: ${category.slug}`);
    check(new Set(path.map((node) => node.slug)).size === path.length, `cycle in category path: ${category.slug}`);
  }

  for (const slug of requiredCoverage) {
    const category = categoryOptions.find((candidate) => candidate.slug === slug);
    check(Boolean(category), `benchmark coverage missing: ${slug}`);
  }
  for (const slug of requiredLeafCoverage) {
    const category = categoryOptions.find((candidate) => candidate.slug === slug);
    check(Boolean(category) && !category.hasChildren, `popular task does not end at a meaningful leaf: ${slug}`);
  }
  for (const slug of broadMustBeBranches) {
    const node = nodesBySlug.get(slug);
    check(Boolean(node?.children?.length), `meaningless broad dead end: ${slug}`);
    check((node?.children?.length ?? 0) >= 2, `broad group is not meaningfully split: ${slug}`);
  }
  for (const slug of intentionalFallbacks) {
    const node = nodesBySlug.get(slug);
    check(Boolean(node) && !node.children?.length, `fallback must be a leaf: ${slug}`);
    check(node?.intentionalFallback === true, `fallback is not explicitly intentional: ${slug}`);
  }

  const airRepairPath = getCategoryPath("air-conditioner-repair").map((node) => node.slug);
  check(airRepairPath.join("/") === "services/repair-construction-services/ventilation-conditioning-services/air-conditioning-services/air-conditioner-repair", "air-conditioner repair discoverability path regressed");
  const serviceLeaves = categoryOptions.filter((category) => category.rootSlug === "services" && !category.hasChildren);
  check(serviceLeaves.length >= 250, "service taxonomy unexpectedly lost practical leaf coverage");
  check(Math.max(...serviceLeaves.map((category) => category.depth)) >= 4, "service taxonomy lost deep discoverability");

  for (const category of categoryOptions) {
    const resolved = resolveCategoryAttributeSchema(category.slug, category.rootSlug);
    check(resolved.profileNames.length > 0, `no schema profile: ${category.slug}`);
    check(resolved.attributes.length > 0, `no seller attributes: ${category.slug}`);
    check(new Set(resolved.profileNames).size === resolved.profileNames.length, `duplicate profile assignment: ${category.slug}`);
    check(resolved.profileNames.every((profile) => profile in categorySchemaProfiles), `unknown profile assignment: ${category.slug}`);
    const keys = new Set(resolved.attributes.map((attribute) => attribute.key));
    check(keys.size === resolved.attributes.length, `duplicate effective attribute key: ${category.slug}`);
    if (!category.hasChildren) {
      check(resolved.attributes.some((attribute) => attribute.filterable), `leaf has no buyer filter: ${category.slug}`);
      check(resolved.attributes.some((attribute) => attribute.required) || category.rootSlug === "free", `leaf has no meaningful required seller field: ${category.slug}`);
    }
    attributeAssignments += resolved.attributes.length;

    for (const attribute of resolved.attributes) {
      check(/^[a-z][A-Za-z0-9_]*$/.test(attribute.key), `invalid attribute key: ${category.slug}.${attribute.key}`);
      check(localizedPresent(attribute.label), `missing RU/KK attribute label: ${category.slug}.${attribute.key}`);
      check(!attribute.unit || localizedPresent(attribute.unit), `incomplete RU/KK attribute unit: ${category.slug}.${attribute.key}`);
      check(["text", "number", "boolean", "select", "multiselect", "range", "date"].includes(attribute.dataType), `unsupported seller attribute type: ${category.slug}.${attribute.key}`);
      if (attribute.filterable) {
        check(["exact", "range", "search"].includes(attribute.filterMode ?? "exact"), `buyer filter mode missing: ${category.slug}.${attribute.key}`);
        if (attribute.filterMode === "range") check(["number", "range", "date"].includes(attribute.dataType), `range buyer filter has invalid type: ${category.slug}.${attribute.key}`);
        if (attribute.filterMode === "search") check(attribute.dataType === "text", `search buyer filter has invalid type: ${category.slug}.${attribute.key}`);
      }
      if (["select", "multiselect"].includes(attribute.dataType)) {
        check(Boolean(attribute.options?.length), `select/multiselect has no options: ${category.slug}.${attribute.key}`);
      }
      const optionValues = new Set();
      for (const option of attribute.options ?? []) {
        optionAssignments += 1;
        check(Boolean(option.value) && option.value === option.value.trim(), `unstable blank/padded option value: ${category.slug}.${attribute.key}`);
        check(!optionValues.has(option.value), `duplicate stable option value: ${category.slug}.${attribute.key}.${option.value}`);
        check(localizedPresent(option.label), `missing RU/KK option label: ${category.slug}.${attribute.key}.${option.value}`);
        optionValues.add(option.value);
      }
      if (attribute.dependsOnKey) {
        const parent = resolved.attributes.find((candidate) => candidate.key === attribute.dependsOnKey);
        check(Boolean(parent), `dependent attribute has no parent: ${category.slug}.${attribute.key}`);
        check(["select", "multiselect"].includes(parent?.dataType ?? ""), `dependent parent is not option-backed: ${category.slug}.${attribute.key}`);
        const parentValues = new Set(parent?.options?.map((option) => option.value) ?? []);
        for (const option of attribute.options ?? []) {
          if (option.value === "other-model") continue;
          check(Boolean(option.parentValue), `dependent option has no parent value: ${category.slug}.${attribute.key}.${option.value}`);
          check(parentValues.has(option.parentValue), `dependent option references invalid parent: ${category.slug}.${attribute.key}.${option.value}`);
        }
        const fallback = attribute.options?.find((option) => option.value === "other-model");
        check(Boolean(fallback), `dependent dictionary has no fallback: ${category.slug}.${attribute.key}`);
        check(attribute.validation?.fallbackOption === "other-model", `dependent fallback metadata missing: ${category.slug}.${attribute.key}`);
        const manual = resolved.attributes.find((candidate) => candidate.key === `${attribute.key}_other`);
        check(Boolean(manual), `dependent fallback has no manual value field: ${category.slug}.${attribute.key}`);
        const visibleWhen = manual?.validation?.visibleWhen;
        check(visibleWhen?.key === attribute.key && visibleWhen?.values?.includes("other-model"), `manual fallback visibility is invalid: ${category.slug}.${attribute.key}`);
      }
      const visibleWhen = attribute.validation?.visibleWhen;
      if (visibleWhen && typeof visibleWhen === "object" && "key" in visibleWhen) {
        check(!attribute.required, `required conditional attribute is incompatible with DB submit semantics: ${category.slug}.${attribute.key}`);
        const controlling = resolved.attributes.find((candidate) => candidate.key === visibleWhen.key);
        check(Boolean(controlling), `visibleWhen references missing attribute: ${category.slug}.${attribute.key}`);
        const controllingValues = new Set(controlling?.options?.map((option) => option.value) ?? []);
        for (const value of visibleWhen.values ?? []) check(controllingValues.has(value), `visibleWhen references missing option: ${category.slug}.${attribute.key}.${value}`);
      }
    }
  }

  for (const slug of bodyLeafSlugs) {
    const keys = new Set(resolveCategoryAttributeSchema(slug, "transport").attributes.map((attribute) => attribute.key));
    check(!keys.has("body") && !keys.has("body_type"), `body leaf asks seller for body again: ${slug}`);
  }
  for (const slug of ["air-conditioner-installation", "air-conditioner-repair", "air-conditioner-cleaning", "air-conditioner-refill", "air-conditioner-maintenance"]) {
    const keys = new Set(resolveCategoryAttributeSchema(slug, "services").attributes.map((attribute) => attribute.key));
    check(!keys.has("service_type") && !keys.has("work_type"), `service leaf asks seller for taxonomy choice again: ${slug}`);
  }
  for (const category of categoryOptions.filter((candidate) => candidate.rootSlug === "services" && !candidate.hasChildren)) {
    const keys = new Set(resolveCategoryAttributeSchema(category.slug, "services").attributes.map((attribute) => attribute.key));
    check(!keys.has("service_type"), `deep service leaf repeats service type: ${category.slug}`);
  }
  for (const slug of ["washing-machines", "vacuum-cleaners", "refrigerators", "air-conditioners"]) {
    const keys = new Set(resolveCategoryAttributeSchema(slug, "electronics").attributes.map((attribute) => attribute.key));
    check(!keys.has("appliance_type"), `device leaf asks seller for device type again: ${slug}`);
  }

  const allBodies = Object.keys(passengerVehicleModelsByBody);
  check(vehicleBodyReference.strategy === "reviewed-explicit-multi-body", "vehicle body source is not explicit and reviewed");
  check(vehicleBodyReference.fallbackBody === "other", "vehicle body fallback scope changed");
  for (const [body, models] of Object.entries(passengerVehicleModelsByBody)) {
    check(new Set(models.map((option) => option.value)).size === models.length, `duplicate vehicle model in ${body}`);
    check(models.some((option) => option.value === "other-model"), `vehicle body dictionary lacks fallback: ${body}`);
  }
  for (const option of passengerVehicleModels) {
    check(Boolean(option.value) && localizedPresent(option.label), `invalid passenger vehicle model: ${option.value}`);
    if (option.value === "other-model") continue;
    const scopes = passengerVehicleBodyScopes.get(option.value) ?? [];
    check(scopes.length > 0, `vehicle model has no reviewed body scope: ${option.value}`);
    check(new Set(scopes).size === scopes.length, `vehicle model has duplicate body scope: ${option.value}`);
    for (const body of scopes) check(allBodies.includes(body), `vehicle model has unknown body scope: ${option.value}.${body}`);
    for (const body of allBodies) {
      check(passengerVehicleModelsByBody[body].some((candidate) => candidate.value === option.value) === scopes.includes(body), `vehicle body dictionary mismatch: ${option.value}.${body}`);
    }
  }
  check(optionExists(passengerVehicleModelsByBody.sedan, "toyota", "Camry"), "Camry missing from sedan");
  check(!optionExists(passengerVehicleModelsByBody.suv, "toyota", "Camry"), "Camry incorrectly available in SUV");
  check(optionExists(passengerVehicleModelsByBody.suv, "bmw", "X5"), "BMW X5 missing from SUV");
  check(optionExists(passengerVehicleModelsByBody.sedan, "audi", "A3") && optionExists(passengerVehicleModelsByBody.hatchback, "audi", "A3"), "Audi A3 multi-body scope regressed");
  check(optionExists(passengerVehicleModelsByBody.sedan, "toyota", "Corolla") && optionExists(passengerVehicleModelsByBody.wagon, "toyota", "Corolla"), "Toyota Corolla multi-body scope regressed");

  for (const dictionary of [passengerVehicleModels, motorcycleModels, smartphoneModels, tabletModels, ereaderModels]) {
    check(new Set(dictionary.map((option) => option.value)).size === dictionary.length, "reference dictionary has duplicate stable values");
    check(dictionary.some((option) => option.value === "other-model"), "reference dictionary has no generic model fallback");
  }
  check(smartphoneModels.every((option) => !/^iPad\b/i.test(option.label.ru)), "iPad leaked into smartphone dictionary");
  check(tabletModels.every((option) => !/^iPhone\b/i.test(option.label.ru)), "iPhone leaked into tablet dictionary");
  check(ereaderModels.every((option) => !/^(iPhone|iPad)\b/i.test(option.label.ru)), "phone/tablet model leaked into e-reader dictionary");
  const smartphoneRequired = ["apple:iphone-17", "apple:iphone-air", "apple:iphone-17-pro", "apple:iphone-17-pro-max", "apple:iphone-17e"];
  for (const value of smartphoneRequired) check(smartphoneModels.some((option) => option.value === value), `current Apple smartphone missing: ${value}`);

  for (const category of categoryOptions.filter((candidate) => candidate.path.includes("tablets-ereaders"))) {
    const attributes = resolveCategoryAttributeSchema(category.slug, category.rootSlug).attributes;
    const optionLabels = attributes.flatMap((attribute) => attribute.options ?? []).map((option) => option.label.ru);
    check(optionLabels.every((label) => !/^iPhone\b/i.test(label)), `iPhone option leaked into tablet/e-reader category: ${category.slug}`);
  }
  const tabletProfiles = resolveCategoryAttributeSchema("tablets", "electronics").profileNames;
  const ereaderProfiles = resolveCategoryAttributeSchema("ereaders", "electronics").profileNames;
  check(tabletProfiles.includes("tablet") && !tabletProfiles.includes("smartphone"), "tablet leaf does not use isolated device profile");
  check(ereaderProfiles.includes("ereader") && !ereaderProfiles.includes("smartphone"), "e-reader leaf does not use isolated device profile");

  const dictionaryValues = {
    "smartphoneModels.apple": smartphoneModels.filter((option) => option.parentValue === "apple").map((option) => option.value),
    "smartphoneModels.samsung": smartphoneModels.filter((option) => option.parentValue === "samsung").map((option) => option.value),
    "tabletModels.apple": tabletModels.filter((option) => option.parentValue === "apple").map((option) => option.value),
    "tabletModels.samsung": tabletModels.filter((option) => option.parentValue === "samsung").map((option) => option.value),
  };
  const validationDate = new Date(process.env.MARKETO_VALIDATION_DATE ?? Date.now());
  check(!Number.isNaN(validationDate.getTime()), "invalid Master Catalog validation date");
  for (const source of fastMovingReferenceSources) {
    const checkedAt = new Date(`${source.checkedAt}T00:00:00Z`);
    const ageDays = Math.floor((validationDate.getTime() - checkedAt.getTime()) / 86_400_000);
    check(/^https:\/\//.test(source.source), `reference freshness source is not public HTTPS: ${source.dictionary}`);
    check(!Number.isNaN(checkedAt.getTime()), `invalid freshness date: ${source.dictionary}`);
    check(ageDays >= 0 && ageDays <= source.maxAgeDays, `reference dictionary freshness expired: ${source.dictionary} (${ageDays} days)`);
    const values = new Set(dictionaryValues[source.dictionary] ?? []);
    check(values.size > 0, `freshness assertion references unknown dictionary: ${source.dictionary}`);
    for (const value of source.requiredValues) check(values.has(value), `freshness-required reference value missing: ${source.dictionary}.${value}`);
  }

  const migrationSource = readFileSync(resolve(projectRoot, "supabase/migrations/0017_master_catalog.sql"), "utf8");
  const listingSource = readFileSync(resolve(projectRoot, "lib/data/supabase/listings.ts"), "utf8");
  const searchPageSource = readFileSync(resolve(projectRoot, "app/search/page.tsx"), "utf8");
  const categoryPageSource = readFileSync(resolve(projectRoot, "app/category/[slug]/page.tsx"), "utf8");
  check(migrationSource.includes("security invoker"), "catalog filter RPC does not preserve RLS");
  check(migrationSource.includes("attribute.is_filterable"), "catalog filter RPC ignores buyer-filter metadata");
  check(migrationSource.includes("listing_attribute_option_values") && migrationSource.includes("listing_attribute_values"), "catalog filter RPC does not cover scalar and option seller values");
  check(listingSource.includes('rpc("search_catalog_listing_cards"'), "listing repository does not use full-dataset catalog filter RPC");
  check(searchPageSource.includes("attributeFilters: parsed.dynamicFilters"), "search page does not pass dynamic buyer filters to repository");
  check(categoryPageSource.includes("attributeFilters: parsed.dynamicFilters"), "category page does not pass dynamic buyer filters to repository");

  const contextualMetadata = validateContextualCategoryMetadata();
  assertions += contextualMetadata.assertions;
  failures.push(...contextualMetadata.failures);

  return {
    ok: failures.length === 0,
    failures,
    assertions,
    categories: nodesBySlug.size,
    leaves: leaves.length,
    roots: categoryTree.length,
    serviceLeaves: serviceLeaves.length,
    attributeAssignments,
    optionAssignments,
    contextualMetadataAssignments: contextualMetadata.assignments,
    profiles: Object.keys(categorySchemaProfiles).length,
  };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const result = validateMasterCatalog();
  if (!result.ok) {
    process.stderr.write(`Master Catalog semantic validation failed (${result.failures.length}):\n${result.failures.map((failure) => `- ${failure}`).join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Master Catalog semantic validation passed: ${result.categories} categories, ${result.leaves} leaves, ${result.assertions} assertions, ${result.contextualMetadataAssignments} contextual RU/KK metadata assignments, ${result.attributeAssignments} seller-attribute assignments, ${result.optionAssignments} option assignments.\n`);
  }
}
