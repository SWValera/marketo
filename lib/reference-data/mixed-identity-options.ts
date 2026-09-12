import type { SeedAttributeDefinition as Attribute, SeedAttributeOption as Option } from "./category-attribute-schemas.ts";
/** Reuse existing brand/model dictionaries in a mixed leaf, scoped by its type. */
export function mixedIdentityFields(parentKey: string, references: Record<string, { brands: readonly Option[]; models: readonly Option[] }>): Attribute[] {
  const brands = Object.entries(references).flatMap(([type, reference]) => reference.brands.filter(o => o.value !== "other").map(o => ({ ...o, value: `${type}:${o.value}`, parentValue: type })));
  const models = Object.entries(references).flatMap(([type, reference]) => reference.models.filter(o => o.parentValue).map(o => ({ ...o, value: `${type}:${o.value}`, parentValue: `${type}:${o.parentValue}` })));
  const custom = (key: string, parent: string, value: string, ru: string, kk: string): Attribute => ({ key, label: { ru, kk }, dataType: "text", searchable: true, validation: { maxLength: 100, placeholder: { ru: "Точное обозначение производителя", kk: "Өндірушінің нақты белгілеуі" }, visibleWhen: { key: parent, values: [value] }, requiredWhen: { key: parent, values: [value] } } });
  return [
    { key: "brand", label: { ru: "Бренд", kk: "Бренд" }, dataType: "select", filterable: true, searchable: true, filterMode: "exact", optionsLoadMode: "deferred", dependsOnKey: parentKey, options: [...brands, { value: "other", label: { ru: "Другой бренд", kk: "Басқа бренд" } }], validation: { fallbackOption: "other" } },
    custom("brand_other", "brand", "other", "Укажите бренд", "Брендті көрсетіңіз"),
    { key: "model", label: { ru: "Модель", kk: "Модель" }, dataType: "select", filterable: true, searchable: true, filterMode: "exact", optionsLoadMode: "deferred", dependsOnKey: "brand", options: [...models, { value: "other-model", label: { ru: "Другая модель", kk: "Басқа модель" } }], validation: { fallbackOption: "other-model" } },
    custom("model_other", "model", "other-model", "Укажите модель", "Модельді көрсетіңіз"),
  ];
}
