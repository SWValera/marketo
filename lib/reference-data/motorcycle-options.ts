import type { DependentReferenceOption } from "./dependent-options.ts";

export type MotorcycleReference = {
  brands: DependentReferenceOption[];
  models: DependentReferenceOption[];
};

const brandLabels: Record<string, string> = {
  alpha: "Alpha",
  aprilia: "Aprilia",
  "arctic-cat": "Arctic Cat",
  bajaj: "Bajaj",
  benelli: "Benelli",
  beta: "Beta",
  bmw: "BMW",
  brp: "BRP / Can-Am",
  cfmoto: "CFMOTO",
  delta: "Delta",
  ducati: "Ducati",
  gasgas: "GasGas",
  "harley-davidson": "Harley-Davidson",
  honda: "Honda",
  horwin: "Horwin",
  husqvarna: "Husqvarna",
  indian: "Indian",
  izh: "ИЖ",
  jawa: "Jawa",
  kawasaki: "Kawasaki",
  kayo: "Kayo",
  keeway: "Keeway",
  ktm: "KTM",
  kymco: "Kymco",
  lynx: "Lynx",
  minsk: "Минск",
  motoland: "Motoland",
  niu: "NIU",
  orion: "Orion",
  peugeot: "Peugeot",
  piaggio: "Piaggio",
  polaris: "Polaris",
  racer: "Racer",
  "royal-enfield": "Royal Enfield",
  "russian-mechanics": "Русская механика",
  segway: "Segway Powersports",
  sherco: "Sherco",
  silence: "Silence",
  "ski-doo": "Ski-Doo",
  stels: "Stels",
  suzuki: "Suzuki",
  sym: "SYM",
  "super-soco": "Super Soco",
  taiga: "Тайга",
  triumph: "Triumph",
  ural: "Урал",
  vespa: "Vespa",
  vmoto: "Vmoto",
  yadea: "Yadea",
  yamaha: "Yamaha",
  zontes: "Zontes",
};

type ModelSource = Record<string, readonly string[]>;

const cyrillicToLatin: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function stableSlug(value: string) {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("ru")
    .replace(/[а-яё]/g, (letter) => cyrillicToLatin[letter] ?? "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function reference(source: ModelSource): MotorcycleReference {
  const brands = Object.keys(source).map((value) => ({
    value,
    label: { ru: brandLabels[value] ?? value, kk: brandLabels[value] ?? value },
  }));
  brands.push({ value: "other", label: { ru: "Другая марка", kk: "Басқа марка" } });
  const models: DependentReferenceOption[] = Object.entries(source).flatMap(([parentValue, labels]) => labels.map((label) => ({
    value: `${parentValue}:${stableSlug(label)}`,
    label: { ru: label, kk: label },
    parentValue,
  })));
  models.push({ value: "other-model", label: { ru: "Другая модель", kk: "Басқа модель" } });
  return { brands, models };
}

function merge(...sources: ModelSource[]): ModelSource {
  const result: Record<string, string[]> = {};
  for (const source of sources) {
    for (const [brand, models] of Object.entries(source)) {
      const values = result[brand] ?? [];
      for (const model of models) if (!values.includes(model)) values.push(model);
      result[brand] = values;
    }
  }
  return result;
}

const sport: ModelSource = {
  aprilia: ["RS 125", "RS 457", "RS 660", "RSV4"],
  bmw: ["M 1000 RR", "S 1000 RR"],
  ducati: ["Panigale V2", "Panigale V4", "SuperSport"],
  honda: ["CBR 250R", "CBR 500R", "CBR 600RR", "CBR 1000RR", "RC 51"],
  kawasaki: ["Ninja 250", "Ninja 300", "Ninja 400", "Ninja 500", "Ninja 650", "Ninja ZX-6R", "Ninja ZX-10R", "Ninja H2"],
  ktm: ["RC 125", "RC 200", "RC 390", "RC 8C"],
  suzuki: ["GSX-8R", "GSX-R600", "GSX-R750", "GSX-R1000", "Hayabusa"],
  triumph: ["Daytona 660", "Daytona 675", "Speed Triple 1200 RR"],
  yamaha: ["R1", "R3", "R6", "R7", "R15"],
};

const naked: ModelSource = {
  aprilia: ["Shiver 750", "Tuono 125", "Tuono 660", "Tuono V4"],
  bajaj: ["Dominar 250", "Dominar 400", "Pulsar 150", "Pulsar NS200"],
  benelli: ["302S", "502C", "Leoncino 500", "TNT 600"],
  bmw: ["F 800 R", "F 900 R", "G 310 R", "R nineT"],
  cfmoto: ["250NK", "300NK", "450NK", "650NK", "800NK"],
  ducati: ["Diavel", "Monster", "Streetfighter V2", "Streetfighter V4"],
  honda: ["CB 400", "CB 500F", "CB 600F Hornet", "CB 650R", "CB 1000R"],
  kawasaki: ["ER-6N", "Z400", "Z650", "Z900", "Z1000"],
  ktm: ["125 Duke", "200 Duke", "250 Duke", "390 Duke", "790 Duke", "890 Duke", "1290 Super Duke"],
  suzuki: ["Bandit 400", "Bandit 600", "Bandit 1200", "GSX-8S", "GSX-S750", "GSX-S1000"],
  triumph: ["Speed Triple", "Street Triple", "Trident 660"],
  yamaha: ["FZ6", "FZ8", "FZ1", "MT-03", "MT-07", "MT-09", "MT-10", "XSR700", "XSR900"],
  zontes: ["R250", "R350", "U1-200", "U1-350"],
};

const touring: ModelSource = {
  bmw: ["F 750 GS", "F 800 GS", "F 850 GS", "K 1600 GT", "R 1200 GS", "R 1250 GS", "R 1300 GS", "R 1250 RT"],
  cfmoto: ["450MT", "650MT", "700MT", "800MT"],
  ducati: ["Multistrada 950", "Multistrada V2", "Multistrada V4"],
  honda: ["Africa Twin", "Gold Wing", "NC 700X", "NC 750X", "Transalp"],
  kawasaki: ["KLR 650", "Versys 650", "Versys 1000"],
  ktm: ["390 Adventure", "690 Enduro R", "790 Adventure", "890 Adventure", "1290 Super Adventure"],
  suzuki: ["V-Strom 250", "V-Strom 650", "V-Strom 800", "V-Strom 1050"],
  triumph: ["Tiger 660", "Tiger 800", "Tiger 900", "Tiger 1200"],
  yamaha: ["FJR1300", "Super Tenere", "Tracer 7", "Tracer 9", "Tenere 700", "XTZ 750"],
};

const cruiser: ModelSource = {
  "harley-davidson": ["Breakout", "Fat Bob", "Fat Boy", "Iron 883", "Low Rider", "Road Glide", "Softail", "Sportster", "Street Glide"],
  honda: ["Fury", "Magna", "Rebel 300", "Rebel 500", "Rebel 1100", "Shadow"],
  indian: ["Challenger", "Chief", "FTR", "Roadmaster", "Scout", "Springfield"],
  kawasaki: ["Eliminator", "Vulcan 400", "Vulcan 650", "Vulcan 900", "Vulcan 1700"],
  "royal-enfield": ["Bullet 350", "Classic 350", "Meteor 350", "Super Meteor 650"],
  suzuki: ["Boulevard C50", "Boulevard C90", "Boulevard M50", "Intruder"],
  triumph: ["Bonneville", "Rocket 3", "Speedmaster"],
  ural: ["Gear Up", "M 67", "Retro", "Solo", "Tourist"],
  yamaha: ["Bolt", "Drag Star", "Royal Star", "V-Max", "Virago", "V-Star"],
};

const enduro: ModelSource = {
  aprilia: ["Pegaso 650", "Tuareg 660"],
  beta: ["RR 125", "RR 250", "RR 300", "RR 390", "RR 480"],
  bmw: ["G 310 GS", "G 650 GS", "F 650 GS", "F 800 GS"],
  honda: ["CRF 250L", "CRF 300L", "CRF 450L", "XR 250", "XR 650L"],
  husqvarna: ["701 Enduro", "FE 250", "FE 350", "FE 450", "TE 250", "TE 300"],
  kawasaki: ["KLX 230", "KLX 250", "KLX 300", "KLR 650"],
  ktm: ["EXC 250", "EXC 300", "EXC-F 350", "EXC-F 500", "690 Enduro R"],
  sherco: ["125 SE", "250 SE", "300 SE", "450 SEF"],
  suzuki: ["DR 250", "DR 650", "DR-Z400"],
  yamaha: ["TTR 250", "WR250R", "WR450F", "XT 250", "XT 600"],
};

const motocross: ModelSource = {
  gasgas: ["MC 125", "MC 250", "MC 250F", "MC 450F"],
  honda: ["CR 125", "CR 250", "CRF 150R", "CRF 250R", "CRF 450R"],
  husqvarna: ["FC 250", "FC 350", "FC 450", "TC 125", "TC 250"],
  kawasaki: ["KX 65", "KX 85", "KX 250", "KX 450"],
  kayo: ["K1", "K2", "T2", "T4", "TTR 125", "TTR 250"],
  ktm: ["65 SX", "85 SX", "125 SX", "250 SX", "250 SX-F", "450 SX-F"],
  motoland: ["CRF 125", "CRF 190", "XT 250", "XR 250"],
  suzuki: ["RM 85", "RM 125", "RM-Z250", "RM-Z450"],
  yamaha: ["YZ 65", "YZ 85", "YZ 125", "YZ 250", "YZ250F", "YZ450F"],
};

const classic: ModelSource = {
  izh: ["ИЖ-49", "Планета", "Планета-5", "Юпитер", "Юпитер-5"],
  jawa: ["250", "350", "350 OHC", "Perak"],
  minsk: ["M1A", "ММВЗ-3.112", "С4 125", "С4 250"],
  "royal-enfield": ["Bullet 350", "Classic 350", "Continental GT 650", "Interceptor 650"],
  triumph: ["Bonneville T100", "Bonneville T120", "Scrambler 900", "Thruxton"],
  ural: ["Gear Up", "M 61", "M 62", "M 63", "M 67", "Retro", "Tourist"],
};

const scooter: ModelSource = {
  aprilia: ["SR 50", "SR GT 125", "SR GT 200"],
  honda: ["Dio AF27", "Dio AF34", "Dio AF35", "Lead 50", "Lead 90", "PCX 125", "PCX 150", "Tact"],
  keeway: ["Cityblade 125", "Fact Evo 50", "Vieste 125"],
  kymco: ["Agility 50", "Agility 125", "Like 125", "People S 125"],
  peugeot: ["Kisbee 50", "Speedfight 4", "Tweet 125"],
  piaggio: ["Beverly 300", "Liberty 50", "Liberty 125", "Medley 150", "Zip 50"],
  suzuki: ["Address 50", "Address 110", "Let's", "Sepia"],
  sym: ["Fiddle 125", "Jet 14", "Orbit 50", "Symphony 125"],
  vespa: ["GTS 125", "Primavera 50", "Primavera 125", "Sprint 50", "Sprint 125"],
  yamaha: ["Aerox 50", "BWS 50", "Gear 50", "Jog", "NMAX 125", "Vino 50"],
};

const maxiScooter: ModelSource = {
  bmw: ["C 400 GT", "C 400 X", "C 600 Sport", "C 650 GT"],
  honda: ["ADV 350", "Forza 250", "Forza 300", "Forza 350", "Silver Wing"],
  kymco: ["AK 550", "Downtown 350", "Xciting 400"],
  piaggio: ["Beverly 400", "MP3 300", "MP3 500"],
  suzuki: ["Burgman 200", "Burgman 400", "Burgman 650"],
  sym: ["Cruisym 300", "Maxsym 400", "Maxsym TL 500"],
  vespa: ["GTS 300", "GTV 300"],
  yamaha: ["TMAX 500", "TMAX 530", "TMAX 560", "XMAX 250", "XMAX 300", "XMAX 400"],
};

const moped: ModelSource = {
  alpha: ["Alpha 50", "Alpha 72", "Alpha 110"],
  delta: ["Delta 50", "Delta 72", "Delta 110"],
  honda: ["Benly 50", "Dream 50", "Little Cub", "Solo", "Super Cub 50", "Super Cub 110"],
  jawa: ["Babetta 207", "Babetta 210", "Stadion S11"],
  minsk: ["D4 50", "D4 125"],
  motoland: ["Alpha RX", "Delta", "Forester 125"],
  orion: ["Orion 50", "Orion 72", "Orion 110"],
  racer: ["Alpha RC50", "Delta RC50", "Trophy RC110"],
  suzuki: ["Birdie 50", "K50", "Smash 110"],
  yamaha: ["Town Mate 50", "Town Mate 80", "V50"],
};

const electricScooter: ModelSource = {
  horwin: ["EK1", "EK3", "SK1", "SK3"],
  niu: ["MQi GT", "NQi GTS", "NQi Sport", "RQi", "UQi GT"],
  segway: ["E110S", "E125S", "E300SE"],
  silence: ["S01", "S02", "S04"],
  "super-soco": ["CPx", "CUx", "TC Max", "TS Street Hunter"],
  vmoto: ["CPx Explorer", "Stash"],
  yadea: ["C1S", "G5", "Keeness VFD", "VoltGuard"],
};

const atv: ModelSource = {
  "arctic-cat": ["Alterra 450", "Alterra 600", "Alterra 700"],
  brp: ["Can-Am Outlander 500", "Can-Am Outlander 700", "Can-Am Outlander 850", "Can-Am Renegade 1000"],
  cfmoto: ["CFORCE 400", "CFORCE 500", "CFORCE 600", "CFORCE 800", "CFORCE 1000"],
  honda: ["FourTrax Foreman", "FourTrax Rancher", "TRX 250", "TRX 420"],
  kawasaki: ["Brute Force 300", "Brute Force 750"],
  kayo: ["AU150", "AU200", "Bull 2B", "Bull 3C"],
  polaris: ["Sportsman 450", "Sportsman 570", "Sportsman 850", "Scrambler XP 1000"],
  segway: ["Snarler AT5", "Snarler AT6", "Snarler AT10"],
  stels: ["ATV 500", "ATV 650", "ATV 800"],
  suzuki: ["KingQuad 400", "KingQuad 500", "KingQuad 750"],
  yamaha: ["Grizzly 700", "Kodiak 450", "Kodiak 700", "Raptor 700"],
};

const utv: ModelSource = {
  brp: ["Can-Am Commander", "Can-Am Defender", "Can-Am Maverick Sport", "Can-Am Maverick X3"],
  cfmoto: ["UFORCE 600", "UFORCE 1000", "ZFORCE 800", "ZFORCE 950"],
  honda: ["Pioneer 500", "Pioneer 700", "Pioneer 1000"],
  kawasaki: ["Mule Pro-DXT", "Mule Pro-FXT", "Teryx KRX 1000"],
  polaris: ["General 1000", "Ranger 570", "Ranger 1000", "RZR 1000", "RZR Pro R"],
  segway: ["Fugleman UT6", "Fugleman UT10", "Villain SX10"],
  yamaha: ["Viking", "Wolverine RMAX", "YXZ1000R"],
};

const buggy: ModelSource = {
  brp: ["Can-Am Maverick R", "Can-Am Maverick X3"],
  cfmoto: ["ZFORCE 800", "ZFORCE 950", "ZFORCE Z10"],
  kayo: ["S200", "S250"],
  polaris: ["RZR 900", "RZR 1000", "RZR Pro R", "RZR Turbo R"],
  segway: ["Villain SX10", "Villain SX20"],
  yamaha: ["Wolverine X2", "Wolverine X4", "YXZ1000R"],
};

const snowmobile: ModelSource = {
  "arctic-cat": ["Blast", "M 6000", "M 8000", "Norseman", "Pantera", "ZR 6000"],
  brp: ["Ski-Doo Expedition", "Ski-Doo Freeride", "Ski-Doo Renegade", "Ski-Doo Summit"],
  lynx: ["49 Ranger", "59 Ranger", "Adventure", "Boondocker", "Commander", "Shredder"],
  polaris: ["850 PRO RMK", "Indy", "Patriot 9R RMK", "Switchback", "Titan", "Voyageur"],
  "russian-mechanics": ["Буран А", "Буран Лидер", "Тайга Варяг", "Тайга Патруль"],
  "ski-doo": ["Expedition", "Freeride", "Renegade", "Skandic", "Summit", "Tundra"],
  taiga: ["Атака", "Варяг 500", "Варяг 550", "Патруль 551", "Тайга 500"],
  yamaha: ["Apex", "Mountain Max", "Sidewinder", "Transporter", "Venture", "VK540"],
};

export const motorcycleReferences = {
  road: reference(merge(sport, naked, touring, cruiser, enduro, motocross, classic)),
  sport: reference(sport),
  naked: reference(naked),
  touring: reference(touring),
  cruiser: reference(cruiser),
  enduro: reference(enduro),
  motocross: reference(motocross),
  classic: reference(classic),
  scooter: reference(scooter),
  maxiScooter: reference(maxiScooter),
  moped: reference(moped),
  electricScooter: reference(electricScooter),
  atv: reference(atv),
  utv: reference(utv),
  buggy: reference(buggy),
  snowmobile: reference(snowmobile),
} as const;
