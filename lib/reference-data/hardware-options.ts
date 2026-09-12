import type { SeedAttributeOption } from "./category-attribute-schemas.ts";
import { intelLaptopProcessorNames } from "./dictionaries/intel-laptop-processors.ts";
import { intelUltraLaptopProcessorNames } from "./dictionaries/intel-ultra-laptop-processors.ts";
import { intelDesktopProcessorNames } from "./dictionaries/intel-desktop-processors.ts";
import { amdProcessors } from "./dictionaries/amd-processors.ts";
import { amdGraphics } from "./dictionaries/amd-graphics.ts";
import { amdProfessionalGraphics } from "./dictionaries/amd-professional-graphics.ts";
import { nvidiaGraphics } from "./dictionaries/nvidia-graphics.ts";

export type HardwarePlatform = "laptop" | "desktop";
type HardwareModel = { name: string; platforms: readonly HardwarePlatform[]; source: string };
const named = (names: readonly string[], platforms: readonly HardwarePlatform[], source: string): HardwareModel[] =>
  names.map((name) => ({ name, platforms, source }));
const intelLaptopSource = "https://cdrdv2-public.intel.com/841783/Intel-Core-Comparsion.pdf";
const appleLaptopSource = "https://support.apple.com/en-gb/108052";
const appleDesktopSource = "https://support.apple.com/en-lamr/122211";

export const processorReferences: readonly HardwareModel[] = [
  ...named(intelUltraLaptopProcessorNames, ["laptop"], "https://cdrdv2-public.intel.com/851467/Intel-Core-Ultra-Series1-Series2-Series3-Comparison.pdf"),
  ...named(intelLaptopProcessorNames, ["laptop"], intelLaptopSource),
  ...named(intelDesktopProcessorNames, ["desktop"], "https://cdrdv2-public.intel.com/841923/Intel-Core-Desktop-Boxed-Processors-Comparison-Chart.pdf"),
  ...amdProcessors,
  ...named(["MediaTek Kompanio 500", "MediaTek Kompanio 520", "MediaTek Kompanio 528", "MediaTek Kompanio 540", "MediaTek Kompanio 820", "MediaTek Kompanio 828", "MediaTek Kompanio 838", "MediaTek Kompanio Ultra 910"], ["laptop"], "https://www.mediatek.com/products/personal-computing/kompanio-chromebooks"),
  ...named(["MediaTek Kompanio 1200"], ["laptop"], "https://i.mediatek.com/in/smart-devices"),
  ...named(["Apple M2", "Apple M2 Pro"], ["desktop"], "https://support.apple.com/en-au/111837"),
  ...named(["Intel Pentium Silver N6000", "Intel Celeron N5100", "Intel Celeron N4500"], ["laptop"], "https://www.intel.com/content/dam/www/public/us/en/documents/product-briefs/pentium-silver-and-celeron-processors-product-brief.pdf"),
  ...named(["Intel Celeron N4020"], ["laptop"], "https://www.intel.com/content/www/us/en/products/sku/197310/intel-celeron-processor-n4020-4m-cache-up-to-2-80-ghz/specifications.html"),
  ...named(["Intel Atom x5-Z8350"], ["laptop"], "https://www.intel.com/content/www/us/en/products/sku/93361/intel-atom-x5z8350-processor-2m-cache-up-to-1-92-ghz/specifications.html"),
  ...named(["Intel Xeon E3-1505M v5"], ["laptop"], "https://www.intel.com/content/www/us/en/products/sku/89608/intel-xeon-processor-e31505m-v5-8m-cache-2-80-ghz/specifications.html"),
  ...named(["Apple M1", "Apple M1 Pro", "Apple M1 Max", "Apple M2", "Apple M2 Pro", "Apple M2 Max", "Apple M3", "Apple M3 Pro", "Apple M3 Max", "Apple M4", "Apple M4 Pro", "Apple M4 Max", "Apple M5", "Apple M5 Pro", "Apple M5 Max"], ["laptop"], appleLaptopSource),
  ...named(["Apple A18 Pro"], ["laptop"], "https://support.apple.com/en-afri/122867"),
  ...named(["Apple M1 Max", "Apple M1 Ultra", "Apple M2 Max", "Apple M2 Ultra"], ["desktop"], "https://support.apple.com/id-id/102027"),
  ...named(["Apple M4", "Apple M4 Pro"], ["desktop"], "https://support.apple.com/en-au/121555"),
  ...named(["Apple M3 Ultra", "Apple M4 Max"], ["desktop"], appleDesktopSource),
  ...named(["Qualcomm Snapdragon X Elite X1E-84-100", "Qualcomm Snapdragon X Elite X1E-80-100", "Qualcomm Snapdragon X Elite X1E-78-100"], ["laptop"], "https://www.qualcomm.com/laptops/products/snapdragon-x-elite"),
  ...named(["Qualcomm Snapdragon X Plus X1P-64-100", "Qualcomm Snapdragon X Plus X1P-46-100", "Qualcomm Snapdragon X X1-26-100"], ["laptop"], "https://www.qualcomm.com/id/id/snapdragon/laptops"),
];

export const graphicsReferences: readonly HardwareModel[] = [
  ...nvidiaGraphics, ...amdGraphics, ...amdProfessionalGraphics,
  ...named(["NVIDIA RTX PRO 5000 Blackwell Laptop GPU", "NVIDIA RTX PRO 4000 Blackwell Laptop GPU", "NVIDIA RTX PRO 3000 Blackwell Laptop GPU", "NVIDIA RTX PRO 2000 Blackwell Laptop GPU", "NVIDIA RTX PRO 1000 Blackwell Laptop GPU", "NVIDIA RTX PRO 500 Blackwell Laptop GPU", "NVIDIA RTX 5000 Ada Laptop GPU", "NVIDIA RTX 4000 Ada Laptop GPU", "NVIDIA RTX 3500 Ada Laptop GPU", "NVIDIA RTX 3000 Ada Laptop GPU", "NVIDIA RTX 2000 Ada Laptop GPU", "NVIDIA RTX 1000 Ada Laptop GPU", "NVIDIA RTX 500 Ada Laptop GPU"], ["laptop"], "https://www.nvidia.com/en-gb/products/workstations/professional-laptops/compare/"),
  ...named(["NVIDIA RTX PRO 5000 Blackwell"], ["desktop"], "https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/quadro-product-literature/workstation-datasheet-blackwell-rtx-pro-5000-gtc25-spring-nvidia-3658700.pdf"),
  ...named(["Intel Arc A350M", "Intel Arc A370M", "Intel Arc A550M", "Intel Arc A730M", "Intel Arc A770M"], ["laptop"], "https://www.intel.com/content/www/us/en/support/articles/000091109/graphics.html"),
  ...named(["Intel Arc A310", "Intel Arc A380", "Intel Arc A580", "Intel Arc A750", "Intel Arc A770", "Intel Arc B570", "Intel Arc B580"], ["desktop"], "https://www.intel.com/content/www/us/en/ark/products/series/227960/intel-arc-dedicated-graphics-family.html"),
];

export function hardwareKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function optionsFor(references: readonly HardwareModel[], platform: HardwarePlatform): SeedAttributeOption[] {
  const options = new Map<string, SeedAttributeOption>();
  for (const reference of references) {
    if (!reference.platforms.includes(platform)) continue;
    const value = hardwareKey(reference.name);
    if (!value || value.length > 100) throw new Error(`Invalid hardware key: ${value}`);
    options.set(value, { value, label: { ru: reference.name, kk: reference.name } });
  }
  return [...options.values()];
}
export function processorOptions(platform: HardwarePlatform): SeedAttributeOption[] {
  return [...optionsFor(processorReferences, platform), { value: "other-cpu", label: { ru: "Другой процессор", kk: "Басқа процессор" } }];
}
export function graphicsOptions(platform: HardwarePlatform): SeedAttributeOption[] {
  return [
    { value: "integrated", label: { ru: "Встроенная графика", kk: "Кіріктірілген графика" } },
    ...optionsFor(graphicsReferences, platform),
    { value: "other-gpu", label: { ru: "Другая видеокарта", kk: "Басқа бейне карта" } },
  ];
}
