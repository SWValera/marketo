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
    const profileAttributeTypes = new Map();
    for (const profileName of resolved.profileNames) {
      for (const attribute of categorySchemaProfiles[profileName] ?? []) {
        const previousType = profileAttributeTypes.get(attribute.key);
        check(!previousType || previousType === attribute.dataType, `cross-profile attribute type collision: ${category.slug}.${attribute.key} (${previousType} -> ${attribute.dataType})`);
        profileAttributeTypes.set(attribute.key, attribute.dataType);
      }
    }
    const keys = new Set(resolved.attributes.map((attribute) => attribute.key));
    check(keys.size === resolved.attributes.length, `duplicate effective attribute key: ${category.slug}`);
    if (!category.hasChildren) {
      check(resolved.attributes.some((attribute) => attribute.filterable), `leaf has no buyer filter: ${category.slug}`);
      check(resolved.attributes.some((attribute) => attribute.required) || category.rootSlug === "free", `leaf has no meaningful required seller field: ${category.slug}`);
    }
    attributeAssignments += resolved.attributes.length;
    const visibleWhenParents = new Map();

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
      const validation = attribute.validation;
      const hasVisibleWhen = Boolean(
        validation
        && typeof validation === "object"
        && !Array.isArray(validation)
        && Object.prototype.hasOwnProperty.call(validation, "visibleWhen"),
      );
      if (hasVisibleWhen) {
        const rawVisibleWhen = validation.visibleWhen;
        const conditionIsObject = Boolean(rawVisibleWhen && typeof rawVisibleWhen === "object" && !Array.isArray(rawVisibleWhen));
        check(conditionIsObject, `visibleWhen must be an object: ${category.slug}.${attribute.key}`);
        if (!conditionIsObject) continue;

        const keyIsValid = typeof rawVisibleWhen.key === "string" && rawVisibleWhen.key.trim().length > 0 && rawVisibleWhen.key === rawVisibleWhen.key.trim();
        const valuesAreValid = Array.isArray(rawVisibleWhen.values)
          && rawVisibleWhen.values.length > 0
          && rawVisibleWhen.values.every((value) => typeof value === "string" && value.trim().length > 0 && value === value.trim());
        check(keyIsValid, `visibleWhen has an invalid controller key: ${category.slug}.${attribute.key}`);
        check(valuesAreValid, `visibleWhen must contain non-empty string values: ${category.slug}.${attribute.key}`);
        if (!keyIsValid || !valuesAreValid) continue;

        check(new Set(rawVisibleWhen.values).size === rawVisibleWhen.values.length, `visibleWhen contains duplicate values: ${category.slug}.${attribute.key}`);
        check(!attribute.required, `required conditional attribute is incompatible with DB submit semantics: ${category.slug}.${attribute.key}`);
        check(rawVisibleWhen.key !== attribute.key, `visibleWhen cannot reference itself: ${category.slug}.${attribute.key}`);
        const controlling = resolved.attributes.find((candidate) => candidate.key === rawVisibleWhen.key);
        check(Boolean(controlling), `visibleWhen references missing attribute: ${category.slug}.${attribute.key}`);
        check(["select", "multiselect"].includes(controlling?.dataType ?? ""), `visibleWhen controller is not option-backed: ${category.slug}.${attribute.key}`);
        const controllingValues = new Set(controlling?.options?.map((option) => option.value) ?? []);
        for (const value of rawVisibleWhen.values) check(controllingValues.has(value), `visibleWhen references missing option: ${category.slug}.${attribute.key}.${value}`);
        visibleWhenParents.set(attribute.key, rawVisibleWhen.key);
      }
    }

    for (const start of visibleWhenParents.keys()) {
      const visited = new Set();
      let current = start;
      while (visibleWhenParents.has(current)) {
        if (visited.has(current)) {
          check(false, `visibleWhen dependency cycle: ${category.slug}.${start}`);
          break;
        }
        visited.add(current);
        current = visibleWhenParents.get(current);
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

  const categoryContract = (slug, requiredProfiles, requiredKeys, forbiddenKeys = [], forbiddenProfiles = []) => {
    const category = categoryOptions.find((candidate) => candidate.slug === slug);
    check(Boolean(category) && !category?.hasChildren, `catalog contract target is not a leaf: ${slug}`);
    if (!category) return;
    const resolved = resolveCategoryAttributeSchema(slug, category.rootSlug);
    const keys = new Set(resolved.attributes.map((attribute) => attribute.key));
    for (const profile of requiredProfiles) check(resolved.profileNames.includes(profile), `missing profile ${slug}.${profile}`);
    for (const profile of forbiddenProfiles) check(!resolved.profileNames.includes(profile), `irrelevant profile ${slug}.${profile}`);
    for (const key of requiredKeys) check(keys.has(key), `missing catalog field ${slug}.${key}`);
    for (const key of forbiddenKeys) check(!keys.has(key), `irrelevant catalog field ${slug}.${key}`);
  };

  const conditionalFieldContract = (slug, key, controllerKey, controllerValues) => {
    const category = categoryOptions.find((candidate) => candidate.slug === slug);
    check(Boolean(category) && !category?.hasChildren, `conditional contract target is not a leaf: ${slug}`);
    if (!category) return;
    const resolved = resolveCategoryAttributeSchema(slug, category.rootSlug);
    const controller = resolved.attributes.find((attribute) => attribute.key === controllerKey);
    const attribute = resolved.attributes.find((candidate) => candidate.key === key);
    check(Boolean(controller?.required && controller.filterable), `conditional controller is not required/filterable: ${slug}.${controllerKey}`);
    const condition = attribute?.validation?.visibleWhen;
    check(condition?.key === controllerKey, `conditional field has wrong controller: ${slug}.${key}`);
    check(JSON.stringify(condition?.values ?? []) === JSON.stringify(controllerValues), `conditional field has wrong values: ${slug}.${key}`);
  };

  const optionValuesContract = (slug, key, expectedValues) => {
    const category = categoryOptions.find((candidate) => candidate.slug === slug);
    check(Boolean(category), `option contract target is missing: ${slug}`);
    if (!category) return;
    const attribute = resolveCategoryAttributeSchema(slug, category.rootSlug).attributes.find((candidate) => candidate.key === key);
    check(Boolean(attribute && ["select", "multiselect"].includes(attribute.dataType)), `option contract target is not option-backed: ${slug}.${key}`);
    check(JSON.stringify(attribute?.options?.map((option) => option.value) ?? []) === JSON.stringify(expectedValues), `stable option values changed: ${slug}.${key}`);
  };

  categoryContract("smartphones", ["smartphone", "deviceSpecs"], ["storage", "ram", "screen_size", "display_type", "operating_system", "network_generation", "nfc", "battery_capacity", "battery_health", "repair_history"], ["connectivity"]);
  categoryContract("tablets", ["tablet", "tabletDeviceSpecs"], ["storage", "screen_size", "connectivity", "network_generation", "stylus_included"]);
  categoryContract("smart-watches", ["smartWatch"], ["wearable_type", "brand", "watch_model", "case_size", "compatible_os", "gps", "nfc", "battery_life", "color", "condition", "package"], ["model", "storage", "ram", "sim"], ["smartphone"]);
  optionValuesContract("smart-watches", "wearable_type", ["smart-watch", "fitness-band"]);
  categoryContract("video-cameras", ["videoCamera"], ["brand", "model", "video_camera_type", "video_resolution", "frame_rate", "storage_media", "stabilization", "optical_zoom", "condition"], ["camera_type", "mount"], ["camera"]);
  optionValuesContract("video-cameras", "video_camera_type", ["camcorder", "cinema", "action", "360"]);
  categoryContract("action-cameras", ["videoCamera", "actionCamera"], ["brand", "model", "video_camera_type", "video_resolution", "frame_rate", "storage_media", "stabilization", "optical_zoom", "waterproof", "mounting_type", "condition"], ["camera_type", "mount"], ["camera"]);
  optionValuesContract("action-cameras", "video_camera_type", ["action", "360"]);
  categoryContract("projectors", ["projector"], ["brand", "model", "screen_size", "resolution", "projector_technology", "refresh_rate", "brightness_lumens", "contrast_ratio", "lamp_hours", "light_source", "throw_type", "smart_projector", "condition"], ["panel"], ["display"]);
  optionValuesContract("projectors", "projector_technology", ["lcd", "dlp", "lcos", "led", "laser"]);
  for (const slug of bodyLeafSlugs) categoryContract(slug, ["vehicleCompliance"], ["engine_power", "owners_count", "customs_cleared", "registration_status", "registration_country", "documents_status", "accident_history", "vin_available"], ["body", "body_type"]);
  categoryContract("washing-machines", ["appliance", "energyRatedAppliance", "laundryAppliance"], ["load_capacity", "installation_type", "energy_class", "max_spin_rpm"]);
  categoryContract("drying-machines", ["appliance", "energyRatedAppliance", "dryingAppliance"], ["load_capacity", "drying_type", "installation_type", "energy_class"]);
  for (const slug of ["vacuum-cleaners", "robot-vacuums"]) categoryContract(slug, ["appliance", "vacuumAppliance"], ["cleaning_type", "dust_collector", "dust_capacity", "cordless", "self_emptying"]);
  categoryContract("refrigerators", ["appliance", "energyRatedAppliance", "refrigeratorAppliance"], ["total_volume", "freezer_location", "no_frost", "energy_class"]);
  categoryContract("freezers", ["appliance", "energyRatedAppliance", "freezerAppliance"], ["freezer_type", "total_volume", "freezing_capacity", "minimum_temperature", "energy_class"], ["freezer_location"]);
  categoryContract("cookers-hobs", ["appliance", "energyRatedAppliance", "cookerHobAppliance"], ["cooking_device_type", "energy_source", "burners", "oven_volume", "energy_class"]);
  conditionalFieldContract("cookers-hobs", "oven_volume", "cooking_device_type", ["cooker"]);
  categoryContract("ovens", ["appliance", "energyRatedAppliance", "ovenAppliance"], ["oven_volume", "grill", "convection", "cleaning_type", "energy_class"], ["burners", "cooking_device_type"]);
  categoryContract("dishwashers", ["appliance", "energyRatedAppliance", "dishwasherAppliance"], ["place_settings", "installation_type", "width", "half_load", "energy_class"]);
  categoryContract("microwave-ovens", ["appliance", "microwaveAppliance"], ["oven_volume", "grill", "convection"], ["burners"]);
  categoryContract("kitchen-hoods", ["appliance", "hoodAppliance"], ["installation_type", "width", "extraction_rate", "noise_level", "recirculation"], ["energy_class"]);
  categoryContract("air-conditioners", ["appliance", "energyRatedAppliance", "climateAppliance"], ["room_area", "inverter", "cooling_capacity", "energy_class"]);
  categoryContract("heaters", ["appliance", "heatingAppliance"], ["room_area", "heater_kind", "thermostat"], ["cooling_capacity", "inverter"]);
  categoryContract("humidifiers-purifiers", ["appliance", "airTreatmentAppliance"], ["treatment_type", "room_area", "tank_volume", "filter_type"], ["cooling_capacity", "inverter"]);
  categoryContract("household-fans", ["appliance", "fanAppliance"], ["fan_type", "speed_levels", "oscillation", "remote_control"], ["cooling_capacity", "inverter", "heating_mode"]);
  categoryContract("water-heaters", ["appliance", "energyRatedAppliance", "waterHeaterAppliance"], ["tank_volume", "heater_type", "energy_source", "energy_class"]);
  categoryContract("irons-steamers", ["appliance", "ironSteamerAppliance"], ["iron_device_type", "steam_output", "tank_volume", "auto_shutoff"], ["energy_class"]);
  categoryContract("sewing-machines", ["appliance", "sewingAppliance"], ["sewing_device_type", "control_type", "operations_count"], ["energy_class"]);
  categoryContract("small-kitchen-appliances", ["appliance", "smallKitchenAppliance"], ["kitchen_device_type", "capacity", "attachments"], ["energy_class"]);
  categoryContract("hair-styling-devices", ["appliance", "hairStylingAppliance"], ["hair_device_type", "temperature_levels", "ionization", "cold_air", "attachments"], ["energy_class"]);
  categoryContract("shavers-trimmers", ["appliance", "groomingAppliance"], ["grooming_device_type", "power_source", "wet_use", "attachments_count"], ["energy_class"]);
  categoryContract("epilators-care", ["appliance", "skinCareAppliance"], ["skincare_device_type", "power_source", "wet_use", "attachments_count"], ["energy_class"]);
  categoryContract("electric-toothbrushes", ["appliance", "toothbrushAppliance"], ["toothbrush_type", "modes_count", "pressure_sensor", "timer", "heads_count"], ["energy_class"]);
  categoryContract("health-electronics", ["appliance", "healthAppliance", "regulatedSafety"], ["health_device_type", "measurement_scope", "smart_sync", "certification"], ["energy_class"]);
  categoryContract("feeding-breast-pumps", ["appliance", "breastPumpAppliance", "regulatedSafety"], ["breast_pump_item_type", "year", "power", "warranty", "pump_type", "double_pumping", "modes_count", "certification"], ["energy_class"]);
  optionValuesContract("feeding-breast-pumps", "breast_pump_item_type", ["pump", "accessory"]);
  for (const key of ["year", "power", "warranty", "pump_type", "double_pumping", "modes_count"]) conditionalFieldContract("feeding-breast-pumps", key, "breast_pump_item_type", ["pump"]);
  categoryContract("feeding-sterilizers-heaters", ["appliance", "sterilizerWarmerAppliance", "regulatedSafety"], ["baby_heating_device_type", "bottle_capacity", "auto_shutoff"], ["energy_class"]);
  categoryContract("baby-monitors-scales", ["appliance", "babyMonitoringAppliance", "regulatedSafety"], ["baby_device_type", "connection", "range_meters", "night_vision", "smart_sync"], ["energy_class"]);
  optionValuesContract("baby-monitors-scales", "baby_device_type", ["audio-monitor", "video-monitor", "scale", "thermometer"]);
  for (const key of ["connection", "range_meters"]) conditionalFieldContract("baby-monitors-scales", key, "baby_device_type", ["audio-monitor", "video-monitor"]);
  conditionalFieldContract("baby-monitors-scales", "night_vision", "baby_device_type", ["video-monitor"]);
  for (const slug of ["pet-aquariums", "pet-aquarium-equipment", "pet-bird-cages", "pet-rodent-cages", "pet-terrariums"]) {
    categoryContract(slug, ["animalSupply"], ["animal_type", "supply_type", "dimensions", "material", "condition"], ["species", "age_months", "gender", "documents"], ["smallAnimal"]);
  }
  categoryContract("books-fiction", ["bookMedia"], ["author", "language", "book_format", "publication_year", "isbn", "condition"], ["model", "warranty"]);
  categoryContract("books-magazines", ["bookMedia"], ["language", "publication_year", "issue_number", "condition"], ["model", "warranty"]);
  for (const slug of ["food-farm-products", "beauty-face-care"]) categoryContract(slug, ["consumableLot", "regulatedSafety"], ["net_quantity", "quantity_unit", "manufacture_date", "expiry_date", "storage_conditions", "certification"], ["model", "warranty"]);
  categoryContract("pet-food", ["consumableLot", "petConsumable", "regulatedSafety"], ["animal_type", "net_quantity", "quantity_unit", "expiry_date", "certification"], ["model", "warranty"]);
  categoryContract("business-medical-consumables", ["consumableLot", "regulatedSafety"], ["expiry_date", "certification", "sterile"], ["model", "warranty"]);
  categoryContract("rental-passenger-cars", ["rentalGoods", "passengerCar", "vehicleCompliance"], ["billing_period", "minimum_term", "deposit", "brand", "model", "year", "engine_power", "condition"]);
  categoryContract("rental-home-appliances", ["rentalGoods", "appliance", "genericAppliance"], ["billing_period", "brand", "model", "appliance_type", "condition"], ["energy_class"]);
  categoryContract("free-home-appliances", ["free", "appliance", "genericAppliance"], ["condition", "brand", "model", "appliance_type"], ["energy_class"]);
  categoryContract("exchange-cars", ["exchange", "passengerCarExchange", "vehicleCompliance"], ["wanted", "brand", "model", "year", "engine_power", "condition"], ["model_other"]);
  categoryContract("exchange-appliances", ["exchange", "appliance", "genericAppliance"], ["wanted", "brand", "model", "appliance_type", "condition"], ["energy_class"]);
  categoryContract("jobs-driver", ["job", "professionalRequirements"], ["employment", "schedule", "experience", "contract_type", "skills", "languages", "license_categories"]);
  categoryContract("renovation-turnkey", ["serviceBase", "serviceProfessional"], ["provider_type", "contract_available", "documents_available", "payment_method", "service_area"]);
  categoryContract("flats-sale", ["flatSale", "propertyDocsUtilities"], ["seller_role", "ownership_type", "property_documents", "property_encumbrance", "address_visibility", "electricity", "water", "internet"]);
  categoryContract("commercial-rent", ["commercialRentalProperty", "rentTerms", "propertyDocsUtilities"], ["commercial_type", "total_area", "utilities_connected", "utilities"]);
  const commercialRentAttributes = resolveCategoryAttributeSchema("commercial-rent", "real-estate").attributes;
  check(commercialRentAttributes.find((attribute) => attribute.key === "utilities")?.dataType === "select", "commercial rent utilities payment field changed type");
  check(commercialRentAttributes.find((attribute) => attribute.key === "utilities_connected")?.dataType === "boolean", "commercial rent connection field changed type");

  categoryContract("rental-bikes-scooters", ["rentalBicycleScooter"], ["rental_vehicle_type", "bicycle_type", "wheel_size", "frame_size", "frame_material", "scooter_drive_type", "max_load", "max_speed", "range_km"]);
  optionValuesContract("rental-bikes-scooters", "rental_vehicle_type", ["bicycle", "scooter"]);
  for (const key of ["bicycle_type", "frame_size", "frame_material"]) conditionalFieldContract("rental-bikes-scooters", key, "rental_vehicle_type", ["bicycle"]);
  for (const key of ["scooter_drive_type", "max_speed", "range_km"]) conditionalFieldContract("rental-bikes-scooters", key, "rental_vehicle_type", ["scooter"]);

  categoryContract("rental-event-furniture", ["rentalEventFurniture"], ["event_furnishing_type", "furniture_type", "material", "dimensions", "textile_type", "textile_material"]);
  optionValuesContract("rental-event-furniture", "event_furnishing_type", ["furniture", "textile"]);
  for (const key of ["furniture_type", "material"]) conditionalFieldContract("rental-event-furniture", key, "event_furnishing_type", ["furniture"]);
  for (const key of ["textile_type", "textile_material"]) conditionalFieldContract("rental-event-furniture", key, "event_furnishing_type", ["textile"]);

  categoryContract("rental-photo-video", ["rentalPhotoVideo"], ["photo_video_type", "camera_type", "mount", "video_camera_type", "action_camera_type", "video_resolution", "waterproof"]);
  optionValuesContract("rental-photo-video", "photo_video_type", ["photo", "video", "action"]);
  for (const key of ["camera_type", "mount"]) conditionalFieldContract("rental-photo-video", key, "photo_video_type", ["photo"]);
  conditionalFieldContract("rental-photo-video", "video_camera_type", "photo_video_type", ["video"]);
  conditionalFieldContract("rental-photo-video", "action_camera_type", "photo_video_type", ["action"]);
  conditionalFieldContract("rental-photo-video", "video_resolution", "photo_video_type", ["video", "action"]);
  conditionalFieldContract("rental-photo-video", "waterproof", "photo_video_type", ["action"]);

  categoryContract("rental-generators-compressors", ["rentalGeneratorCompressor"], ["power_equipment_type", "power", "capacity", "fuel", "phase_count", "compressor_pressure", "air_delivery", "receiver_volume"]);
  optionValuesContract("rental-generators-compressors", "power_equipment_type", ["generator", "compressor"]);
  for (const key of ["fuel", "phase_count"]) conditionalFieldContract("rental-generators-compressors", key, "power_equipment_type", ["generator"]);
  for (const key of ["compressor_pressure", "air_delivery", "receiver_volume"]) conditionalFieldContract("rental-generators-compressors", key, "power_equipment_type", ["compressor"]);

  categoryContract("rental-game-consoles", ["rentalGamingDevice"], ["gaming_rental_type", "platform", "brand", "model", "console_form", "vr_type", "controllers_included"]);
  optionValuesContract("rental-game-consoles", "gaming_rental_type", ["console", "vr"]);
  conditionalFieldContract("rental-game-consoles", "console_form", "gaming_rental_type", ["console"]);
  conditionalFieldContract("rental-game-consoles", "vr_type", "gaming_rental_type", ["vr"]);

  categoryContract("free-kids-gear", ["freeKidsGear"], ["kids_gear_type", "stroller_type", "furniture_type", "care_item_type", "condition"]);
  optionValuesContract("free-kids-gear", "kids_gear_type", ["stroller", "furniture", "care"]);
  conditionalFieldContract("free-kids-gear", "stroller_type", "kids_gear_type", ["stroller"]);
  conditionalFieldContract("free-kids-gear", "furniture_type", "kids_gear_type", ["furniture"]);
  conditionalFieldContract("free-kids-gear", "care_item_type", "kids_gear_type", ["care"]);

  categoryContract("free-phones-computers", ["freePhoneComputer"], ["free_device_type", "brand", "model", "condition", "storage", "ram", "sim", "screen_size", "cpu", "gpu"]);
  optionValuesContract("free-phones-computers", "free_device_type", ["phone", "tablet", "laptop", "desktop", "accessory"]);
  for (const key of ["storage", "ram"]) conditionalFieldContract("free-phones-computers", key, "free_device_type", ["phone", "tablet", "laptop", "desktop"]);
  conditionalFieldContract("free-phones-computers", "sim", "free_device_type", ["phone", "tablet"]);
  conditionalFieldContract("free-phones-computers", "screen_size", "free_device_type", ["phone", "tablet", "laptop"]);
  for (const key of ["cpu", "gpu"]) conditionalFieldContract("free-phones-computers", key, "free_device_type", ["laptop", "desktop"]);

  categoryContract("exchange-gaming", ["exchangeGaming"], ["wanted", "gaming_item_type", "platform", "brand", "model", "condition", "console_form", "game_title", "edition", "vr_type"]);
  optionValuesContract("exchange-gaming", "gaming_item_type", ["console", "game", "vr", "accessory"]);
  conditionalFieldContract("exchange-gaming", "console_form", "gaming_item_type", ["console"]);
  for (const key of ["game_title", "edition"]) conditionalFieldContract("exchange-gaming", key, "gaming_item_type", ["game"]);
  conditionalFieldContract("exchange-gaming", "vr_type", "gaming_item_type", ["vr"]);

  categoryContract("rental-costumes-decor", ["rentalCostumeDecor"], ["rental_item_type", "size", "season", "decor_style", "dimensions"]);
  for (const key of ["size", "season"]) conditionalFieldContract("rental-costumes-decor", key, "rental_item_type", ["costume"]);
  for (const key of ["decor_style", "dimensions"]) conditionalFieldContract("rental-costumes-decor", key, "rental_item_type", ["decor"]);
  categoryContract("rental-strollers-seats", ["rentalStrollerSeat"], ["child_item_type", "stroller_type", "age_group", "weight_group", "isofix"]);
  for (const key of ["stroller_type", "age_group"]) conditionalFieldContract("rental-strollers-seats", key, "child_item_type", ["stroller"]);
  for (const key of ["weight_group", "isofix"]) conditionalFieldContract("rental-strollers-seats", key, "child_item_type", ["car-seat"]);
  categoryContract("rental-computers-projectors", ["rentalComputerProjector"], ["rental_equipment_type", "cpu", "ram", "gpu", "storage_capacity", "screen_size", "resolution", "projector_technology", "refresh_rate"], ["panel"], ["display"]);
  optionValuesContract("rental-computers-projectors", "projector_technology", ["lcd", "dlp", "lcos", "led", "laser"]);
  for (const key of ["cpu", "ram", "gpu", "storage_capacity"]) conditionalFieldContract("rental-computers-projectors", key, "rental_equipment_type", ["computer"]);
  for (const key of ["screen_size", "resolution", "projector_technology", "refresh_rate"]) conditionalFieldContract("rental-computers-projectors", key, "rental_equipment_type", ["projector"]);
  categoryContract("rental-sound-light", ["rentalSoundLight"], ["event_equipment_type", "audio_type", "connection", "lighting_type", "light_source", "power"]);
  for (const key of ["audio_type", "connection"]) conditionalFieldContract("rental-sound-light", key, "event_equipment_type", ["sound"]);
  for (const key of ["lighting_type", "light_source", "power"]) conditionalFieldContract("rental-sound-light", key, "event_equipment_type", ["light"]);
  categoryContract("rental-sports-tourism", ["rentalSportsTourism"], ["rental_activity_type", "sport", "product_type", "gear_type", "season", "capacity", "dimensions", "material", "waterproof"]);
  for (const key of ["sport", "product_type"]) conditionalFieldContract("rental-sports-tourism", key, "rental_activity_type", ["sport"]);
  for (const key of ["gear_type", "season", "capacity", "dimensions", "material", "waterproof"]) conditionalFieldContract("rental-sports-tourism", key, "rental_activity_type", ["tourism"]);
  categoryContract("exchange-phones", ["exchangeMobileDevice"], ["mobile_device_type", "storage", "ram", "sim", "stylus_included", "network_generation"]);
  conditionalFieldContract("exchange-phones", "sim", "mobile_device_type", ["phone"]);
  conditionalFieldContract("exchange-phones", "stylus_included", "mobile_device_type", ["tablet"]);
  categoryContract("exchange-land-commercial", ["exchangePropertyMixed"], ["exchange_property_type", "land_area", "land_purpose", "access_road", "commercial_type", "total_area", "floor", "separate_entrance", "renovation", "parking", "utilities"]);
  for (const key of ["land_area", "land_purpose", "access_road"]) conditionalFieldContract("exchange-land-commercial", key, "exchange_property_type", ["land"]);
  for (const key of ["commercial_type", "total_area", "floor", "separate_entrance", "renovation", "parking", "utilities"]) conditionalFieldContract("exchange-land-commercial", key, "exchange_property_type", ["commercial"]);

  for (const [slug, keys] of [
    ["smartphones", ["screen_size", "battery_capacity", "battery_health"]],
    ["cars-sedan", ["engine_power"]],
    ["washing-machines", ["load_capacity", "max_spin_rpm"]],
    ["refrigerators", ["total_volume"]],
  ]) {
    const category = categoryOptions.find((candidate) => candidate.slug === slug);
    const attributes = resolveCategoryAttributeSchema(slug, category.rootSlug).attributes;
    for (const key of keys) {
      const attribute = attributes.find((candidate) => candidate.key === key);
      check(attribute?.dataType === "number" && attribute.filterable && attribute.filterMode === "range", `range filter metadata mismatch: ${slug}.${key}`);
    }
  }
  for (const [slug, key] of [["smart-watches", "gps"], ["smart-watches", "nfc"], ["cars-sedan", "vin_available"], ["cars-sedan", "customs_cleared"], ["refrigerators", "no_frost"], ["air-conditioners", "inverter"]]) {
    const category = categoryOptions.find((candidate) => candidate.slug === slug);
    const attribute = resolveCategoryAttributeSchema(slug, category.rootSlug).attributes.find((candidate) => candidate.key === key);
    check(attribute?.dataType === "boolean" && attribute.filterable && attribute.filterMode === "exact", `boolean filter metadata mismatch: ${slug}.${key}`);
  }
  const foodExpiry = resolveCategoryAttributeSchema("food-farm-products", "home-garden").attributes.find((attribute) => attribute.key === "expiry_date");
  check(foodExpiry?.dataType === "date" && foodExpiry.filterable && foodExpiry.filterMode === "range", "expiry date filter metadata mismatch");

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
  check(searchPageSource.includes("sanitizeAttributeFilters") && searchPageSource.includes("attributeFilters: initialDynamicFilters"), "search page does not sanitize and pass dynamic buyer filters to repository");
  check(categoryPageSource.includes("sanitizeAttributeFilters") && categoryPageSource.includes("attributeFilters: initialDynamicFilters"), "category page does not sanitize and pass dynamic buyer filters to repository");

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
