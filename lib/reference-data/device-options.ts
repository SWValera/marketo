import type { DependentReferenceOption } from "./dependent-options.ts";

const slug = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("en")
  .replace(/\+/g, " plus ")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const brands = (labels: readonly string[]): DependentReferenceOption[] => labels.map((label) => ({
  value: label === "Другая марка" ? "other" : slug(label),
  label: { ru: label, kk: label },
}));

const models = (source: Record<string, readonly string[]>): DependentReferenceOption[] => [
  ...Object.entries(source).flatMap(([parentValue, labels]) => labels.map((label) => ({
    value: `${parentValue}:${slug(label)}`,
    label: { ru: label, kk: label },
    parentValue,
  }))),
  { value: "other-model", label: { ru: "Другая модель", kk: "Басқа модель" } },
];

export const tabletBrands = brands([
  "Apple", "Samsung", "Xiaomi", "Redmi", "Huawei", "Honor", "Lenovo", "Microsoft",
  "OnePlus", "OPPO", "realme", "TCL", "Amazon", "Другая марка",
]);

export const tabletModels = models({
  apple: [
    "iPad Pro 13-inch (M5)", "iPad Pro 11-inch (M5)",
    "iPad Air 13-inch (M4)", "iPad Air 11-inch (M4)",
    "iPad (A16)", "iPad mini (A17 Pro)",
    "iPad Pro 13-inch (M4)", "iPad Pro 11-inch (M4)",
    "iPad Air 13-inch (M3)", "iPad Air 11-inch (M3)",
    "iPad Air 13-inch (M2)", "iPad Air 11-inch (M2)",
    "iPad (10th generation)", "iPad (9th generation)",
    "iPad mini (6th generation)", "iPad Pro 12.9-inch (6th generation)",
  ],
  samsung: [
    "Galaxy Tab S11", "Galaxy Tab S11 Ultra", "Galaxy Tab S10+", "Galaxy Tab S10 Ultra",
    "Galaxy Tab S10 FE", "Galaxy Tab S10 FE+", "Galaxy Tab S9", "Galaxy Tab S9+",
    "Galaxy Tab S9 Ultra", "Galaxy Tab S9 FE", "Galaxy Tab A9", "Galaxy Tab A9+",
  ],
  xiaomi: ["Xiaomi Pad 5", "Xiaomi Pad 6", "Xiaomi Pad 6S Pro", "Xiaomi Pad 7", "Xiaomi Pad 7 Pro"],
  redmi: ["Redmi Pad", "Redmi Pad SE", "Redmi Pad Pro", "Redmi Pad 2"],
  huawei: ["MatePad 11", "MatePad 11.5", "MatePad 12 X", "MatePad Pro 12.2", "MatePad SE"],
  honor: ["Honor Pad 9", "Honor Pad X8", "Honor Pad X9", "Honor MagicPad 2"],
  lenovo: ["Tab M9", "Tab M10", "Tab M11", "Tab P11", "Tab P12", "Yoga Tab 13", "Legion Tab"],
  microsoft: ["Surface Go 3", "Surface Go 4", "Surface Pro 8", "Surface Pro 9", "Surface Pro 10", "Surface Pro 11"],
  oneplus: ["OnePlus Pad", "OnePlus Pad 2", "OnePlus Pad Go"],
  oppo: ["OPPO Pad 2", "OPPO Pad 3", "OPPO Pad Air"],
  realme: ["realme Pad", "realme Pad 2", "realme Pad Mini"],
  tcl: ["TCL NXTPAPER 11", "TCL NXTPAPER 14", "TCL Tab 10"],
  amazon: ["Fire 7", "Fire HD 8", "Fire HD 10", "Fire Max 11"],
});

export const ereaderBrands = brands([
  "Amazon Kindle", "PocketBook", "ONYX BOOX", "Kobo", "Digma", "Ritmix", "Другая марка",
]);

export const ereaderModels = models({
  "amazon-kindle": ["Kindle", "Kindle Paperwhite", "Kindle Paperwhite Signature Edition", "Kindle Colorsoft", "Kindle Scribe", "Kindle Oasis"],
  pocketbook: ["Basic Lux", "Verse", "Verse Pro", "Era", "Era Color", "InkPad 4", "InkPad Color 3", "Color Note"],
  "onyx-boox": ["Go 6", "Go Color 7", "Page", "Note Air 3", "Note Air 4 C", "Tab Ultra C Pro", "Palma", "Palma 2"],
  kobo: ["Clara BW", "Clara Colour", "Libra Colour", "Sage", "Elipsa 2E", "Nia"],
  digma: ["E63W", "K1", "K2", "X1", "X2"],
  ritmix: ["RBK-617", "RBK-676FL", "RBK-678FL"],
});

export const fastMovingReferenceSources = [
  {
    dictionary: "smartphoneModels.apple",
    checkedAt: "2026-08-28",
    maxAgeDays: 120,
    source: "https://www.apple.com/iphone/compare/",
    requiredValues: ["apple:iphone-17", "apple:iphone-air", "apple:iphone-17-pro", "apple:iphone-17-pro-max", "apple:iphone-17e"],
  },
  {
    dictionary: "smartphoneModels.samsung",
    checkedAt: "2026-08-28",
    maxAgeDays: 120,
    source: "https://www.samsung.com/us/smartphones/",
    requiredValues: ["samsung:galaxy-s26", "samsung:galaxy-s26-plus", "samsung:galaxy-s26-ultra", "samsung:galaxy-s26-fe"],
  },
  {
    dictionary: "tabletModels.apple",
    checkedAt: "2026-08-28",
    maxAgeDays: 120,
    source: "https://www.apple.com/ipad/compare/",
    requiredValues: ["apple:ipad-pro-13-inch-m5", "apple:ipad-air-13-inch-m4", "apple:ipad-a16", "apple:ipad-mini-a17-pro"],
  },
  {
    dictionary: "tabletModels.samsung",
    checkedAt: "2026-08-28",
    maxAgeDays: 120,
    source: "https://www.samsung.com/us/tablets/galaxy-tab-s11/",
    requiredValues: ["samsung:galaxy-tab-s11", "samsung:galaxy-tab-s11-ultra"],
  },
] as const;
