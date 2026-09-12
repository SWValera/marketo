import type { ReferenceCategoryAttribute } from "./types.ts";

export type ReferenceAttributeValue = string | number | boolean | string[] | { min: string | number; max: string | number };
type AttributeValues = Record<string, ReferenceAttributeValue>;

type AttributeValidation = {
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  fallbackOption?: string;
  requiredForNewListingsSince?: string;
  requiredWhenSince?: string;
  placeholder?: { ru: string; kk: string };
  visibleWhen?: { key: string; values: string[] };
  requiredWhen?: { key: string; values: string[] };
};

export function getAttributeValidation(attribute: ReferenceCategoryAttribute): AttributeValidation {
  return attribute.validation && typeof attribute.validation === "object" && !Array.isArray(attribute.validation)
    ? attribute.validation as AttributeValidation
    : {};
}

export function isAttributeVisible(attribute: ReferenceCategoryAttribute, values: AttributeValues) {
  if (!attribute.visible) return false;
  const condition = getAttributeValidation(attribute).visibleWhen;
  if (!condition?.key || !condition.values?.length) return true;
  const selected = values[condition.key];
  return (Array.isArray(selected) ? selected : [String(selected ?? "")]).some(value => condition.values.includes(value));
}

export function isAttributeRequired(attribute: ReferenceCategoryAttribute, values: AttributeValues, createdAt?: string) {
  if (attribute.required) return true;
  const validation = getAttributeValidation(attribute);
  const appliesSince = (since?: string) => !since || !createdAt || Date.parse(createdAt) >= Date.parse(since);
  if (validation.requiredForNewListingsSince && appliesSince(validation.requiredForNewListingsSince)) return true;
  const condition = validation.requiredWhen;
  if (!condition?.key || !condition.values?.length || !appliesSince(validation.requiredWhenSince)) return false;
  const selected = values[condition.key];
  return (Array.isArray(selected) ? selected : [String(selected ?? "")]).some(value => condition.values.includes(value));
}

export function sanitizeAttributeFilters(
  attributes: ReferenceCategoryAttribute[],
  values: Record<string, string>,
) {
  const attributesByKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    const rangeMatch = key.match(/^(.*)_(min|max)$/);
    const attribute = attributesByKey.get(rangeMatch?.[1] ?? key);
    if (!attribute?.visible || !attribute.filterable) continue;
    if (rangeMatch ? attribute.filterMode !== "range" : attribute.filterMode === "range") continue;
    next[key] = value;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const attribute of attributes) {
      const parentMissing = attribute.dependsOnKey && next[attribute.dependsOnKey] === undefined;
      if (!parentMissing && isAttributeVisible(attribute, next)) continue;
      for (const key of [attribute.key, `${attribute.key}_min`, `${attribute.key}_max`]) {
        if (next[key] === undefined) continue;
        delete next[key];
        changed = true;
      }
    }
  }

  return next;
}

export function getDependentParentOptionId(
  attribute: ReferenceCategoryAttribute,
  attributes: ReferenceCategoryAttribute[],
  values: AttributeValues,
) {
  if (!attribute.dependsOnKey) return undefined;
  const parent = attributes.find((item) => item.key === attribute.dependsOnKey);
  const parentValue = String(values[attribute.dependsOnKey] ?? "");
  return parent?.options.find((option) => option.value === parentValue)?.id;
}

export function clearDependentValues<T extends ReferenceAttributeValue>(
  changedKey: string,
  nextValue: T,
  attributes: ReferenceCategoryAttribute[],
  current: Record<string, T>,
) {
  const next = { ...current, [changedKey]: nextValue };
  const queue = [changedKey];
  const processed = new Set<string>();
  while (queue.length) {
    const parentKey = queue.shift();
    if (!parentKey || processed.has(parentKey)) continue;
    processed.add(parentKey);
    for (const attribute of attributes) {
      const dependencyChanged = attribute.dependsOnKey === parentKey;
      const condition = getAttributeValidation(attribute).visibleWhen;
      const conditionChanged = condition?.key === parentKey;
      const conditionSatisfied = !conditionChanged || (Array.isArray(next[parentKey]) ? next[parentKey] as string[] : [String(next[parentKey] ?? "")]).some(value => condition.values?.includes(value));
      if (!dependencyChanged && conditionSatisfied) continue;
      if (next[attribute.key] !== undefined) delete next[attribute.key];
      delete next[attribute.key + "_min"];
      delete next[attribute.key + "_max"];
      queue.push(attribute.key);
    }
  }
  return next;
}

// A deferred parent has no eagerly serialized options. Its stable value is
// sufficient for the server to resolve the existing catalog relationship.
export function getDependentParentValue(attribute: ReferenceCategoryAttribute, values: AttributeValues) {
  if (!attribute.dependsOnKey) return undefined;
  const value = values[attribute.dependsOnKey];
  return typeof value === "string" && value ? value : undefined;
}
