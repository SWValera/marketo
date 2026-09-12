import type { SeedAttributeOption } from "./category-attribute-schemas.ts";

// Real tablet SoCs, not inferred desktop CPU combinations.
export const tabletProcessorReferences = [
  { source: "https://www.apple.com/ipad/compare/", names: ["Apple M5", "Apple M4", "Apple M3", "Apple M2", "Apple M1", "Apple A17 Pro", "Apple A16", "Apple A15 Bionic", "Apple A14 Bionic", "Apple A13 Bionic", "Apple A12 Bionic", "Apple A12X Bionic", "Apple A12Z Bionic", "Apple A10 Fusion", "Apple A10X Fusion", "Apple A9", "Apple A9X", "Apple A8", "Apple A8X", "Apple A7"] },
  { source: "https://www.samsung.com/us/app/tablets/compare/", names: ["Qualcomm Snapdragon 8 Gen 2", "Qualcomm Snapdragon 8 Gen 1", "Qualcomm Snapdragon 778G", "Qualcomm Snapdragon 750G", "Qualcomm Snapdragon 720G", "UNISOC T618", "MediaTek MT8768N", "MediaTek MT8768T"] },
  { source: "https://www.samsung.com/ae/support/mobile-devices/galaxy-comparison-between-tab-s10-and-tab-s9/", names: ["MediaTek Dimensity 9300+"] },
  { source: "https://psref.lenovo.com/Detail/Lenovo_Tablets/Tab_P12?M=ZACH0134PL", names: ["MediaTek Dimensity 7050"] },
  { source: "https://psref.lenovo.com/Detail/Tab_M11?M=ZADB0319CZ", names: ["MediaTek Helio G88"] },
];
export const chipsetReferences = [
  { source: "https://docs.amd.com/r/en-US/68886-ryzen-master-user-guide/Supported-Chipset-Models", names: ["AMD B650E", "AMD B650", "AMD TRX50", "AMD WRX80", "AMD WRX90"] },
  { source: "https://www.amd.com/en/products/processors/chipsets/am5.html", names: ["AMD X870E", "AMD X870", "AMD B850", "AMD B840", "AMD X670E", "AMD X670", "AMD A620", "AMD A620A", "AMD PRO 600", "AMD PRO 665"] },
  { source: "https://www.amd.com/en/products/processors/chipsets/am4.html", names: ["AMD X570", "AMD B550", "AMD A520", "AMD X470", "AMD B450", "AMD X370", "AMD B350", "AMD A320", "AMD X300", "AMD A300", "AMD PRO 500", "AMD PRO 565", "AMD PRO 560", "AMD B550A", "AMD B300"] },
  { source: "https://www.intel.com/content/www/us/en/support/articles/000099260/processors/intel-core-processors.html", names: ["Intel W790", "Intel B760", "Intel H770", "Intel Z790", "Intel W680", "Intel B660", "Intel H610", "Intel Z690"] },
  { source: "https://www.intel.com/content/www/us/en/ark/products/series/237776/intel-800-series-desktop-chipsets.html", names: ["Intel B860", "Intel H810", "Intel Z890"] },
];
const options = (references: { names: string[] }[]): SeedAttributeOption[] => references.flatMap(({ names }) => names.map(name => ({
  value: name.toLowerCase().replaceAll("+", " plus ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  label: { ru: name, kk: name },
})));
export const tabletProcessorOptions = [...options(tabletProcessorReferences), { value: "other-cpu", label: { ru: "Другой процессор", kk: "Басқа процессор" } }];
export const chipsetOptions = [...options(chipsetReferences), { value: "other-chipset", label: { ru: "Другой чипсет", kk: "Басқа чипсет" } }];
