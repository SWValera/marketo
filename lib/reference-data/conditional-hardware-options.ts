import type { SeedAttributeDefinition as Attribute } from "./category-attribute-schemas.ts";
import { graphicsOptions, processorOptions, type HardwarePlatform } from "./hardware-options.ts";

/** Mixed leaves keep the hardware platform tied to their device-type selection. */
export function conditionalHardwareFields(parentKey: string, platforms: Record<string, HardwarePlatform>): Attribute[] {
  return (["cpu", "gpu"] as const).flatMap(key => {
    const fallback = key === "cpu" ? "other-cpu" : "other-gpu";
    const known = Object.entries(platforms).flatMap(([parentValue, platform]) =>
      (key === "cpu" ? processorOptions(platform) : graphicsOptions(platform)).filter(option => option.value !== fallback).map(option => ({
        ...option, value: `${parentValue}:${option.value}`, parentValue,
      })));
    return [
      { key, label: { ru: key === "cpu" ? "Процессор" : "Видеокарта", kk: key === "cpu" ? "Процессор" : "Бейне карта" },
        dataType: "select" as const, filterable: true, searchable: true, filterMode: "exact" as const, optionsLoadMode: "deferred" as const,
        dependsOnKey: parentKey, options: [...known, { value: fallback, label: { ru: "Другая модель", kk: "Басқа модель" } }],
        validation: { fallbackOption: fallback, visibleWhen: { key: parentKey, values: Object.keys(platforms) } } },
      { key: `${key}_other`, label: { ru: "Укажите точную модель", kk: "Нақты модельді көрсетіңіз" }, dataType: "text" as const,
        searchable: true, validation: { maxLength: 120, placeholder: { ru: "Полное обозначение модели", kk: "Модельдің толық белгіленуі" },
          visibleWhen: { key, values: [fallback] }, requiredWhen: { key, values: [fallback] } } },
    ];
  });
}
