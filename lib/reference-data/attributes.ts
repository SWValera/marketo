import type { ReferenceCategoryAttribute } from "./types.ts";

export type ReferenceAttributeValue = string | number | boolean | string[] | { min: string | number; max: string | number };
type AttributeValues = Record<string, ReferenceAttributeValue>;

type AttributeValidation = {
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  visibleWhen?: { key?: string; values?: string[] };
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
  return condition.values.includes(String(values[condition.key] ?? ""));
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
  while (queue.length) {
    const parentKey = queue.shift();
    for (const attribute of attributes) {
      if (attribute.dependsOnKey !== parentKey) continue;
      if (next[attribute.key] !== undefined) delete next[attribute.key];
      queue.push(attribute.key);
    }
  }
  return next;
}
