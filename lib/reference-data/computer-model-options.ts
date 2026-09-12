import type { SeedAttributeDefinition, SeedAttributeOption } from "./category-attribute-schemas.ts";

// Manufacturer product families, not guessed configurations. The exact factory
// model code remains a separate optional value when a family contains variants.
export const laptopFamilies: Record<string, { names: string[]; source: string }> = {
  apple: { names: ["MacBook Air", "MacBook Pro", "MacBook", "MacBook Neo"], source: "https://support.apple.com/en-la/docs/mac" },
  lenovo: { names: ["ThinkPad", "ThinkPad X1 Carbon", "ThinkPad X1 Yoga", "ThinkPad T14", "ThinkPad T14s", "ThinkPad T16", "ThinkPad E14", "ThinkPad E16", "ThinkPad L14", "ThinkPad P16", "IdeaPad", "IdeaPad Slim 3", "IdeaPad Slim 5", "IdeaPad Pro 5", "Yoga", "Yoga Slim 7", "Yoga Pro 7", "Yoga Pro 9", "Yoga Book 9", "Legion", "Legion 5", "Legion Pro 5", "Legion Pro 7", "LOQ", "ThinkBook", "ThinkBook 14", "ThinkBook 16"], source: "https://support.lenovo.com/vg/en/solutions/lenovo-ai-apps" },
  asus: { names: ["Zenbook", "Zenbook S 16", "Zenbook 14", "Zenbook Duo", "Vivobook", "Vivobook S 14", "Vivobook S 15", "Vivobook S 16", "Vivobook Pro", "ProArt", "ProArt P16", "ProArt PX13", "ProArt PZ13", "ROG Strix", "ROG Zephyrus", "TUF Gaming", "ExpertBook"], source: "https://press.asus.com/news/press-releases/asus-computex-2024-ai-copilot-pcs-proart-zenbook-vivobook-tuf/" },
  dell: { names: ["XPS", "XPS 13", "XPS 14", "XPS 15", "XPS 16", "Inspiron", "Latitude", "Precision", "Vostro", "Alienware", "Dell 14 Plus", "Dell 16 Plus", "Dell 14 Premium", "Dell 16 Premium", "Dell Pro"], source: "https://www.dell.com/en-us/shop/dell-laptops/scr/laptops" },
  hp: { names: ["Pavilion", "Envy", "Spectre", "EliteBook", "ProBook", "ZBook", "Victus", "OMEN", "OmniBook", "OmniBook X", "OmniBook Ultra", "HP 15", "HP 250"], source: "https://www.hp.com/us-en/shop/cat/laptops" },
  acer: { names: ["Aspire", "Swift", "Spin", "Nitro", "Predator Helios", "Predator Triton", "TravelMate", "Extensa", "Vero", "Chromebook"], source: "https://www.acer.com/in-en/laptops" },
  msi: { names: ["Titan", "Raider", "Stealth", "Vector", "Crosshair", "Pulse", "Katana", "Sword", "Cyborg", "Thin", "Prestige", "Modern", "Summit", "Creator", "Venture"], source: "https://sg-store.msi.com/collections/all-laptops" },
  honor: { names: ["MagicBook", "MagicBook X 14", "MagicBook X 16", "MagicBook Pro 16"], source: "https://www.honor.com/global/laptops/" },
  huawei: { names: ["MateBook D 14", "MateBook D 15", "MateBook D 16", "MateBook 14", "MateBook 16s", "MateBook X Pro", "MateBook E"], source: "https://consumer.huawei.com/en/laptops/" },
  microsoft: { names: ["Surface Laptop", "Surface Laptop Go", "Surface Laptop Studio", "Surface Book", "Surface Pro"], source: "https://www.microsoft.com/en-us/surface/devices" },
  samsung: { names: ["Galaxy Book", "Galaxy Book2", "Galaxy Book3", "Galaxy Book4", "Galaxy Book5", "Galaxy Book Pro", "Galaxy Book Ultra", "Galaxy Book Flex", "Galaxy Book Ion"], source: "https://www.samsung.com/us/computing/galaxy-books/" },
  gigabyte: { names: ["AERO", "AORUS", "G5", "G6", "G7"], source: "https://www.gigabyte.com/Laptop" },
  razer: { names: ["Blade Stealth 13", "Blade 14", "Blade 15", "Blade 16", "Blade 17", "Blade 18"], source: "https://www.razer.com/gaming-laptops" },
  framework: { names: ["Laptop 12", "Laptop 13", "Laptop 16"], source: "https://frame.work/" },
  lg: { names: ["gram", "gram Pro", "gram 2-in-1", "UltraPC"], source: "https://www.lg.com/us/laptops" },
};

export const desktopFamilies: typeof laptopFamilies = {
  apple: { names: ["iMac", "iMac Pro", "Mac mini", "Mac Studio", "Mac Pro"], source: "https://support.apple.com/en-la/docs/mac" },
  lenovo: { names: ["ThinkCentre", "ThinkStation", "IdeaCentre", "Legion Tower", "LOQ Tower", "Yoga AIO"], source: "https://www.lenovo.com/us/en/desktops/" },
  dell: { names: ["OptiPlex", "Precision", "Inspiron", "XPS Desktop", "Alienware Aurora", "Dell Pro Tower", "Dell Pro Slim", "Dell Pro Micro"], source: "https://www.dell.com/en-us/shop/desktop-computers/scr/desktops" },
  hp: { names: ["ProDesk", "EliteDesk", "ProOne", "EliteOne", "Z Workstation", "Pavilion Desktop", "OMEN", "Victus", "Envy Desktop"], source: "https://www.hp.com/us-en/shop/cat/desktops" },
  asus: { names: ["ExpertCenter", "ROG Strix", "ProArt Station", "Mini PC", "NUC"], source: "https://www.asus.com/displays-desktops/" },
  acer: { names: ["Aspire TC", "Aspire XC", "Veriton", "Nitro", "Predator Orion"], source: "https://www.acer.com/us-en/desktops-and-all-in-ones" },
  msi: { names: ["MAG Infinite", "MEG Trident", "MPG Trident", "Codex", "Cubi", "PRO DP", "Modern AM"], source: "https://www.msi.com/Desktop" },
};

export function familyModelFields(families: typeof laptopFamilies, modelKey = "model"): SeedAttributeDefinition[] {
  const options: SeedAttributeOption[] = Object.entries(families).flatMap(([brand, { names }]) => names.map(name => ({
    value: `${brand}:${name.toLowerCase().replaceAll("+", " plus ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    parentValue: brand, label: { ru: name, kk: name },
  })));
  options.push({ value: "other-model", label: { ru: "Другая модель", kk: "Басқа модель" } });
  return [
    { key: modelKey, label: { ru: "Модель / семейство", kk: "Модель / топтама" }, dataType: "select",
      dependsOnKey: "brand", optionsLoadMode: "deferred", filterable: true, searchable: true, filterMode: "exact", options,
      validation: { fallbackOption: "other-model", dictionary: "manufacturer-model-families" } },
    { key: `${modelKey}_other`, label: { ru: "Укажите модель", kk: "Модельді көрсетіңіз" }, dataType: "text", searchable: true,
      validation: { maxLength: 100, placeholder: { ru: "Модель с этикетки устройства", kk: "Құрылғы жапсырмасындағы модель" },
        visibleWhen: { key: modelKey, values: ["other-model"] }, requiredWhen: { key: modelKey, values: ["other-model"] } } },
    { key: "model_code", label: { ru: "Заводской номер модели", kk: "Зауыттық модель нөмірі" }, dataType: "text", searchable: true,
      validation: { maxLength: 100, placeholder: { ru: "Точный код модели с заводской наклейки; не серийный номер", kk: "Зауыт жапсырмасындағы нақты модель коды; сериялық нөмір емес" } } },
  ];
}
