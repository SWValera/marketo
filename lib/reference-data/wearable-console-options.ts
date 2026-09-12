import type { laptopFamilies } from "./computer-model-options.ts";

// Manufacturer support catalogs. Codes/edition names are kept verbatim and are
// independent from localized field labels; missing models use explicit Other.
export const wearableFamilies: typeof laptopFamilies = {
  apple: { names: ["Apple Watch (1st generation)", "Apple Watch Series 1", "Apple Watch Series 2", "Apple Watch Series 3", "Apple Watch Series 4", "Apple Watch Series 5", "Apple Watch Series 6", "Apple Watch Series 7", "Apple Watch Series 8", "Apple Watch Series 9", "Apple Watch Series 10", "Apple Watch Series 11", "Apple Watch SE", "Apple Watch SE 2", "Apple Watch SE 3", "Apple Watch Ultra", "Apple Watch Ultra 2", "Apple Watch Ultra 3"], source: "https://support.apple.com/en-us/108056" },
  samsung: { names: ["Galaxy Watch", "Galaxy Watch Active", "Galaxy Watch Active2", "Galaxy Watch3", "Galaxy Watch4", "Galaxy Watch4 Classic", "Galaxy Watch5", "Galaxy Watch5 Pro", "Galaxy Watch6", "Galaxy Watch6 Classic", "Galaxy Watch7", "Galaxy Watch Ultra", "Galaxy Watch FE", "Galaxy Fit3", "Gear S2", "Gear S3", "Gear Sport", "Gear Fit2", "Gear Fit2 Pro"], source: "https://www.samsung.com/us/support/answer/ANS10004668/" },
  xiaomi: { names: ["Xiaomi Watch S1", "Xiaomi Watch S1 Active", "Xiaomi Watch S1 Pro", "Xiaomi Watch 2", "Xiaomi Watch 2 Pro", "Xiaomi Watch S3", "Xiaomi Watch S4", "Xiaomi Watch S4 41mm", "Xiaomi Watch S5 46mm", "Xiaomi Watch 5", "Redmi Watch 2 Lite", "Redmi Watch 3", "Redmi Watch 3 Active", "Redmi Watch 4", "Redmi Watch 5", "Redmi Watch 5 Lite", "Redmi Watch 5 Active", "Redmi Watch 6", "Redmi Watch 6 NFC"], source: "https://www.mi.com/global/product-list/watches/watch/" },
  huawei: { names: ["HUAWEI WATCH FIT", "HUAWEI WATCH FIT 5", "HUAWEI WATCH FIT 5 Pro", "HUAWEI WATCH 5", "HUAWEI WATCH GT 6", "HUAWEI WATCH GT 6 Pro", "HUAWEI WATCH D2", "HUAWEI WATCH KIDS 4 Pro"], source: "https://consumer.huawei.com/bh/wearables/watch-fit-new/specs/" },
  garmin: { names: ["vivoactive 5", "Venu 3", "Venu 3S", "Instinct 2", "Instinct 2S", "Instinct Crossover"], source: "https://www.garmin.com/en-US/which-watch/stay-active/compare/" },
  amazfit: { names: ["Balance", "Balance 2", "GTR 4", "GTR Mini", "GTS 4 Mini", "T-Rex 2", "T-Rex 3", "T-Rex Ultra", "Bip 3 Pro", "Bip 5", "Bip 5 Unity", "Active", "Active Edge"], source: "https://us.amazfit.com/products/" },
  fitbit: { names: ["Charge 6", "Inspire 3", "Versa 4", "Sense 2", "Ace LTE", "Air"], source: "https://store.google.com/us/category/watches_trackers?hl=en-US" },
  google: { names: ["Pixel Watch 3", "Pixel Watch 4"], source: "https://store.google.com/us/category/watches_trackers?hl=en-US" },
  suunto: { names: ["Vertical 2", "Race 2", "9 Peak Pro"], source: "https://www.suunto.com/en-ca/Product-search/See-all-Sports-Watches/" },
  polar: { names: ["Grit X", "Grit X Pro", "Grit X2", "Grit X2 Pro", "Ignite", "Ignite 2", "Ignite 3", "Pacer", "Pacer Pro", "Unite", "Vantage M", "Vantage M2", "Vantage M3", "Vantage V2", "Vantage V3", "Street X", "M430"], source: "https://support.polar.com/us-en/supported-polar-products" },
};

export const consoleFamilies: typeof laptopFamilies = {
  valve: { names: ["Steam Deck"], source: "https://store.steampowered.com/steamdeck" },
  asus: { names: ["ROG Ally", "ROG Ally X"], source: "https://rog.asus.com/gaming-handhelds/rog-ally/rog-ally-x-2024/" },
  lenovo: { names: ["Legion Go 8APU1"], source: "https://psref.lenovo.com/Product/Legion/Legion_Go_8APU1" },
  msi: { names: ["Claw A1M"], source: "https://storage-asset.msi.com/specSheet/ar/hh/Claw%20A1M-208AE.pdf" },
  sega: { names: ["Mega Drive / Genesis", "Saturn", "Dreamcast", "Game Gear", "Master System"], source: "https://www.sega.jp/history/hard/" },
  atari: { names: ["Atari 2600", "Atari 5200", "Atari 7800", "Atari Jaguar", "Atari Lynx"], source: "https://atari.com/products/atari-50th-the-anniversary-celebration" },
  sony: { names: ["PlayStation", "PlayStation 2", "PlayStation 3", "PlayStation 4", "PlayStation 5", "PlayStation 5 Digital Edition", "PlayStation 5 Pro", "PSP", "PlayStation Vita"], source: "https://sonyinteractive.com/en/our-company/expanded-company-timeline/" },
  microsoft: { names: ["Xbox One", "Xbox Series X", "Xbox Series S"], source: "https://www.xbox.com/en-US/consoles/all-consoles" },
  nintendo: { names: ["Nintendo Switch", "Nintendo Switch Lite", "Nintendo Switch OLED", "Nintendo Switch 2", "Nintendo 3DS"], source: "https://en-americas-support.nintendo.com/app/answers/detail/a_id/58879" },
};
export const kartFamilies: typeof laptopFamilies = {
  crg: { names: ["KT4", "Heron"], source: "https://www.fiakarting.com/sites/default/files/2020-05/Homol-materiel-2018-2021.pdf" },
  "tony-kart": { names: ["Vektor"], source: "https://www.fiakarting.com/sites/default/files/2020-05/Homol-materiel-2018-2021.pdf" },
  sodikart: { names: ["SIGMA"], source: "https://www.fiakarting.com/sites/default/files/2020-05/Homol-materiel-2018-2021.pdf" },
  "birel-art": { names: ["RY 32", "FY 30"], source: "https://www.fiakarting.com/sites/default/files/2020-03/Homol-materiel-2018-2021.pdf" },
  "evo-kart": { names: ["EK-01"], source: "https://www.fiakarting.com/sites/default/files/2020-03/Homol-materiel-2018-2021.pdf" },
  praga: { names: ["Tacho Evo"], source: "https://www.fiakarting.com/sites/default/files/2020-05/Homol-materiel-2018-2021.pdf" },
};
