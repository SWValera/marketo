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
  "Acer", "Alldocube", "Amazon", "Apple", "ASUS", "Blackview", "Chuwi", "Dell",
  "DEXP", "DOOGEE", "Google", "Honor", "Huawei", "Lenovo", "Microsoft", "Nokia",
  "OnePlus", "OPPO", "Oukitel", "Prestigio", "realme", "Redmi", "Samsung", "TCL",
  "Teclast", "Xiaomi", "ZTE", "Другая марка",
]);

export const tabletModels = models({
  acer: [
    "Iconia Tab A1-810", "Iconia Tab A3-A10", "Iconia Tab A500", "Iconia Tab A510",
    "Iconia Tab A700", "Iconia One 7", "Iconia One 8", "Iconia One 10", "Iconia Tab 10",
  ],
  alldocube: [
    "iPlay 20", "iPlay 30", "iPlay 40", "iPlay 40 Pro", "iPlay 50", "iPlay 50 Mini",
    "iPlay 50 Pro", "iPlay 60 Mini Pro", "iPlay 60 Pad Pro", "X Game",
  ],
  amazon: [
    "Fire 7", "Fire HD 8", "Fire HD 8 Plus", "Fire HD 10", "Fire HD 10 Plus",
    "Fire Max 11",
  ],
  apple: [
    "iPad (1st generation)", "iPad 2", "iPad (3rd generation)", "iPad (4th generation)",
    "iPad (5th generation)", "iPad (6th generation)", "iPad (7th generation)",
    "iPad (8th generation)", "iPad (9th generation)", "iPad (10th generation)", "iPad (A16)",
    "iPad Air (1st generation)", "iPad Air 2", "iPad Air (3rd generation)",
    "iPad Air (4th generation)", "iPad Air (5th generation)",
    "iPad Air 11-inch (M2)", "iPad Air 13-inch (M2)",
    "iPad Air 11-inch (M3)", "iPad Air 13-inch (M3)",
    "iPad Pro 13-inch (M5)", "iPad Pro 11-inch (M5)",
    "iPad Air 13-inch (M4)", "iPad Air 11-inch (M4)",
    "iPad mini (1st generation)", "iPad mini 2", "iPad mini 3", "iPad mini 4",
    "iPad mini (5th generation)", "iPad mini (6th generation)", "iPad mini (A17 Pro)",
    "iPad Pro 9.7-inch", "iPad Pro 10.5-inch",
    "iPad Pro 11-inch (1st generation)", "iPad Pro 11-inch (2nd generation)",
    "iPad Pro 11-inch (3rd generation)", "iPad Pro 11-inch (4th generation)",
    "iPad Pro 12.9-inch (1st generation)", "iPad Pro 12.9-inch (2nd generation)",
    "iPad Pro 12.9-inch (3rd generation)", "iPad Pro 12.9-inch (4th generation)",
    "iPad Pro 12.9-inch (5th generation)", "iPad Pro 12.9-inch (6th generation)",
    "iPad Pro 13-inch (M4)", "iPad Pro 11-inch (M4)",
  ],
  asus: [
    "Eee Pad Transformer TF101", "Google Nexus 7 (2012)", "Google Nexus 7 (2013)",
    "Memo Pad 7", "Memo Pad 8", "Transformer Pad TF300", "Transformer Pad TF700",
    "Transformer Book T100", "ZenPad 3S 10", "ZenPad 7", "ZenPad 8", "ZenPad 10",
  ],
  blackview: ["Active 8 Pro", "Active 10 Pro", "Mega 1", "Tab 6", "Tab 7", "Tab 8", "Tab 10", "Tab 11", "Tab 12", "Tab 13", "Tab 16 Pro", "Tab 18"],
  chuwi: ["Hi10 Air", "Hi10 Go", "Hi10 Max", "HiPad Air", "HiPad Max", "HiPad Plus", "UBook", "UBook X", "UBook XPro"],
  dell: ["Latitude 5290 2-in-1", "Venue 7", "Venue 8", "Venue 8 Pro", "Venue 10", "Venue 11 Pro", "XPS 10", "XPS 12"],
  dexp: ["Ursus 7", "Ursus 8", "Ursus 9", "Ursus 10", "Ursus KX210", "Ursus N310", "Ursus S180", "Ursus VA110"],
  doogee: ["R10", "T10", "T10 Plus", "T20", "T20 Mini", "T20 Ultra", "T30 Pro", "T30 Ultra", "U10", "U10 Kid"],
  google: ["Nexus 7 (2012)", "Nexus 7 (2013)", "Nexus 9", "Nexus 10", "Pixel C", "Pixel Slate", "Pixel Tablet"],
  samsung: [
    "Galaxy Note 8.0", "Galaxy Note 10.1", "Galaxy Note Pro 12.2",
    "Galaxy Tab 2 7.0", "Galaxy Tab 2 10.1", "Galaxy Tab 3 7.0", "Galaxy Tab 3 8.0",
    "Galaxy Tab 3 10.1", "Galaxy Tab 4 7.0", "Galaxy Tab 4 8.0", "Galaxy Tab 4 10.1",
    "Galaxy Tab A 7.0", "Galaxy Tab A 8.0", "Galaxy Tab A 10.1", "Galaxy Tab A 10.5",
    "Galaxy Tab A7", "Galaxy Tab A7 Lite", "Galaxy Tab A8", "Galaxy Tab Active",
    "Galaxy Tab Active2", "Galaxy Tab Active3", "Galaxy Tab Active4 Pro", "Galaxy Tab E",
    "Galaxy Tab S 8.4", "Galaxy Tab S 10.5", "Galaxy Tab S2 8.0", "Galaxy Tab S2 9.7",
    "Galaxy Tab S3", "Galaxy Tab S4", "Galaxy Tab S5e", "Galaxy Tab S6", "Galaxy Tab S6 Lite",
    "Galaxy Tab S7", "Galaxy Tab S7+", "Galaxy Tab S7 FE", "Galaxy Tab S8", "Galaxy Tab S8+",
    "Galaxy Tab S8 Ultra",
    "Galaxy Tab S11", "Galaxy Tab S11 Ultra", "Galaxy Tab S10+", "Galaxy Tab S10 Ultra",
    "Galaxy Tab S10 FE", "Galaxy Tab S10 FE+", "Galaxy Tab S9", "Galaxy Tab S9+",
    "Galaxy Tab S9 Ultra", "Galaxy Tab S9 FE", "Galaxy Tab S9 FE+", "Galaxy Tab A9", "Galaxy Tab A9+",
  ],
  xiaomi: [
    "Mi Pad", "Mi Pad 2", "Mi Pad 3", "Mi Pad 4", "Mi Pad 4 Plus", "Xiaomi Pad 5",
    "Xiaomi Pad 5 Pro", "Xiaomi Pad 6", "Xiaomi Pad 6 Pro", "Xiaomi Pad 6 Max",
    "Xiaomi Pad 6S Pro", "Xiaomi Pad 7", "Xiaomi Pad 7 Pro",
  ],
  redmi: ["Redmi Pad", "Redmi Pad SE", "Redmi Pad SE 8.7", "Redmi Pad Pro", "Redmi Pad 2"],
  huawei: [
    "MediaPad 7 Youth", "MediaPad M2", "MediaPad M3", "MediaPad M5", "MediaPad M5 Lite",
    "MediaPad T1", "MediaPad T3", "MediaPad T5", "MatePad 10.4", "MatePad 11",
    "MatePad 11.5", "MatePad 12 X", "MatePad Air", "MatePad Pro 10.8",
    "MatePad Pro 11", "MatePad Pro 12.2", "MatePad SE",
  ],
  honor: ["Honor Pad 5", "Honor Pad 6", "Honor Pad 8", "Honor Pad 9", "Honor Pad V8", "Honor Pad X7", "Honor Pad X8", "Honor Pad X8a", "Honor Pad X9", "Honor MagicPad 2"],
  lenovo: [
    "IdeaTab A1000", "IdeaTab A3000", "IdeaTab S6000", "Legion Tab", "Tab 2 A7", "Tab 2 A10",
    "Tab 3 7", "Tab 3 8", "Tab 4 8", "Tab 4 10", "Tab 4 10 Plus", "Tab M7", "Tab M8",
    "Tab M9", "Tab M10", "Tab M10 Plus", "Tab M11", "Tab P11", "Tab P11 Plus",
    "Tab P11 Pro", "Tab P12", "Tab P12 Pro", "Yoga Smart Tab", "Yoga Tab 3", "Yoga Tab 11", "Yoga Tab 13",
  ],
  microsoft: [
    "Surface 2", "Surface 3", "Surface Go", "Surface Go 2", "Surface Go 3", "Surface Go 4",
    "Surface Pro 3", "Surface Pro 4", "Surface Pro 5", "Surface Pro 6", "Surface Pro 7",
    "Surface Pro 7+", "Surface Pro 8", "Surface Pro 9", "Surface Pro 10", "Surface Pro 11",
    "Surface Pro X",
  ],
  nokia: ["Lumia 2520", "N1", "T10", "T20", "T21"],
  oneplus: ["OnePlus Pad", "OnePlus Pad 2", "OnePlus Pad 3", "OnePlus Pad Go"],
  oppo: ["OPPO Pad", "OPPO Pad 2", "OPPO Pad 3", "OPPO Pad Air", "OPPO Pad Air 2", "OPPO Pad Neo"],
  oukitel: ["OT5", "OT6", "OT8", "OT11", "RT2", "RT3", "RT6", "RT7 Titan", "RT8"],
  prestigio: ["MultiPad 4", "MultiPad Color", "MultiPad Grace", "MultiPad Muze", "Node A8", "Q Pro"],
  realme: ["realme Pad", "realme Pad 2", "realme Pad Mini", "realme Pad X"],
  tcl: ["TCL NXTPAPER 10s", "TCL NXTPAPER 11", "TCL NXTPAPER 14", "TCL Tab 8", "TCL Tab 10", "TCL Tab 10L", "TCL Tab 10s"],
  teclast: ["M40", "M40 Pro", "P20HD", "P30", "P30T", "P40HD", "T40 Plus", "T40 Pro", "T50", "T50 Pro", "T60"],
  zte: ["Axon Pad", "Blade X10", "K87CA", "K92", "Nubia Pad 3D", "Nubia RedMagic Tablet", "Optik", "Trek 2 HD"],
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
