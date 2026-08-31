export type DependentReferenceOption = {
  value: string;
  label: { ru: string; kk: string };
  parentValue?: string;
};

const cyrillicSlugMap: Record<string, string> = {
  а: "a", ә: "a", б: "b", в: "v", г: "g", ғ: "gh", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", қ: "q", л: "l", м: "m", н: "n", ң: "ng", о: "o", ө: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ұ: "u", ү: "u", ф: "f", х: "h", һ: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", і: "i", ь: "", э: "e", ю: "yu", я: "ya",
};

const stableSlug = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("en")
  .replace(/[а-яәғқңөұүһі]/g, (character) => cyrillicSlugMap[character] ?? "")
  .replace(/&/g, " and ")
  .replace(/\+/g, " plus ")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

function dependentOptions(source: Record<string, readonly string[]>): DependentReferenceOption[] {
  return Object.entries(source).flatMap(([parentValue, labels]) => labels.map((label) => ({
    value: `${parentValue}:${stableSlug(label)}`,
    label: { ru: label, kk: label },
    parentValue,
  })));
}

// Curated Kazakhstan-market baseline. It intentionally prioritizes models
// commonly encountered in current and used-car listings. The generic fallback
// remains available for every one of the 141 brands in the brand dictionary.
export const passengerVehicleModels = [
  ...dependentOptions({
    acura: ["CL", "ILX", "Integra", "MDX", "RDX", "RL", "RLX", "TL", "TLX", "ZDX"],
    "alfa-romeo": ["145", "146", "147", "156", "159", "Giulia", "Giulietta", "Stelvio", "Tonale"],
    audi: ["80", "100", "A1", "A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q4 e-tron", "Q5", "Q7", "Q8", "e-tron", "S4", "S6", "TT"],
    avatr: ["07", "11", "12"],
    baic: ["BJ20", "BJ40", "BJ60", "EU5", "U5 Plus", "X35", "X55", "X7"],
    bentley: ["Bentayga", "Continental GT", "Flying Spur", "Mulsanne"],
    bestune: ["B70", "B70S", "T55", "T77", "T90"],
    bmw: ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "6 Series", "7 Series", "8 Series", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "XM", "Z4", "i3", "i4", "i5", "i7", "iX", "iX1", "iX3"],
    byd: ["Atto 3", "Dolphin", "Destroyer 05", "Han", "Qin Plus", "Seal", "Seagull", "Song L", "Song Plus", "Tang", "Yuan Plus"],
    cadillac: ["ATS", "CT4", "CT5", "CT6", "Escalade", "SRX", "XT4", "XT5", "XT6"],
    changan: ["Alsvin", "CS35 Plus", "CS55 Plus", "CS75 Plus", "CS85 Coupe", "CS95", "Eado Plus", "Hunter Plus", "UNI-K", "UNI-T", "UNI-V"],
    chery: ["Arrizo 5", "Arrizo 6", "Arrizo 8", "Tiggo 2", "Tiggo 4", "Tiggo 7", "Tiggo 7 Pro", "Tiggo 8", "Tiggo 8 Pro", "Tiggo 9"],
    chevrolet: ["Aveo", "Blazer", "Camaro", "Captiva", "Cobalt", "Cruze", "Damas", "Epica", "Equinox", "Lacetti", "Malibu", "Matiz", "Nexia", "Niva", "Onix", "Orlando", "Spark", "Tahoe", "Tracker", "TrailBlazer"],
    chrysler: ["200", "300C", "Grand Voyager", "Pacifica", "PT Cruiser", "Sebring", "Town & Country", "Voyager"],
    citroen: ["Berlingo", "C3", "C3 Aircross", "C4", "C4 Picasso", "C5", "C5 Aircross", "C-Elysee", "Jumpy", "Xsara Picasso"],
    daewoo: ["Damas", "Espero", "Gentra", "Lanos", "Leganza", "Matiz", "Nexia", "Nubira", "Tico"],
    daihatsu: ["Atrai", "Boon", "Cast", "Copen", "Cuore", "Hijet", "Mira", "Rocky", "Sirion", "Terios", "Tanto"],
    dodge: ["Caliber", "Caravan", "Challenger", "Charger", "Dakota", "Durango", "Journey", "Neon", "Nitro", "RAM", "Stratus"],
    dongfeng: ["580", "Aeolus Shine", "Aeolus Yixuan", "DF6", "DFSK 500", "DFSK 600", "Huge", "Rich", "Shine Max"],
    exeed: ["LX", "RX", "TXL", "VX"],
    faw: ["Besturn B50", "Besturn X40", "Besturn X80", "Bestune B70", "Bestune T55", "Bestune T77", "Bestune T90"],
    fiat: ["500", "Albea", "Bravo", "Doblo", "Ducato", "Linea", "Panda", "Punto", "Tipo"],
    ford: ["Bronco", "C-Max", "EcoSport", "Edge", "Escape", "Escort", "Everest", "Expedition", "Explorer", "F-150", "Fiesta", "Focus", "Fusion", "Galaxy", "Kuga", "Mondeo", "Mustang", "Ranger", "S-Max", "Tourneo", "Transit"],
    gac: ["Empow", "GS3", "GS4", "GS5", "GS8", "M8"],
    gaz: ["21 Волга", "24 Волга", "3102 Волга", "3110 Волга", "Газель", "Газель NEXT", "Соболь", "Соболь NN"],
    geely: ["Atlas", "Atlas Pro", "Coolray", "Emgrand", "Emgrand X7", "Geometry C", "Monjaro", "Okavango", "Preface", "Tugella"],
    genesis: ["G70", "G80", "G90", "GV60", "GV70", "GV80"],
    "great-wall": ["Deer", "Hover H3", "Hover H5", "Hover H6", "Poer", "Safe", "Wingle 5", "Wingle 7"],
    haval: ["Dargo", "F7", "F7x", "H2", "H5", "H6", "H9", "Jolion", "M6", "Raptor"],
    honda: ["Accord", "Avancier", "City", "Civic", "CR-V", "Crosstour", "Elysion", "Fit", "Freed", "HR-V", "Insight", "Integra", "Jazz", "Legend", "Odyssey", "Pilot", "Prelude", "Ridgeline", "Stepwgn", "Stream", "Vezel"],
    hongqi: ["E-HS9", "H5", "H6", "H9", "HS3", "HS5", "HS7"],
    hyundai: ["Accent", "Atos", "Avante", "Bayon", "Creta", "Elantra", "Equus", "Genesis", "Getz", "Grandeur", "H-1", "i10", "i20", "i30", "Ioniq", "Ioniq 5", "Ioniq 6", "Kona", "Matrix", "Palisade", "Santa Fe", "Solaris", "Sonata", "Staria", "Terracan", "Tucson", "Veloster", "Venue", "Verna"],
    infiniti: ["EX", "FX", "G", "JX", "M", "Q30", "Q50", "Q60", "Q70", "QX30", "QX50", "QX55", "QX56", "QX60", "QX70", "QX80"],
    isuzu: ["D-Max", "MU-X", "Trooper", "VehiCross"],
    jac: ["J7", "JS3", "JS4", "JS5", "JS6", "S3", "S5", "T6", "T8", "T9"],
    jaecoo: ["J7", "J8"],
    jaguar: ["E-Pace", "F-Pace", "F-Type", "I-Pace", "S-Type", "XE", "XF", "XJ", "X-Type"],
    jeep: ["Cherokee", "Commander", "Compass", "Gladiator", "Grand Cherokee", "Liberty", "Patriot", "Renegade", "Wrangler"],
    jetour: ["Dashing", "T1", "T2", "X70", "X70 Plus", "X90 Plus"],
    kia: ["Bongo", "Carens", "Carnival", "Ceed", "Cerato", "EV6", "EV9", "K5", "K7", "K8", "K9", "Magentis", "Mohave", "Morning", "Niro", "Opirus", "Optima", "Picanto", "ProCeed", "Rio", "Seltos", "Sorento", "Soul", "Spectra", "Sportage", "Stinger"],
    lada: ["2101", "2104", "2105", "2106", "2107", "2108", "2109", "21099", "2110", "2111", "2112", "2113", "2114", "2115", "4x4", "Granta", "Kalina", "Largus", "Niva", "Niva Travel", "Priora", "Vesta", "XRAY"],
    "land-rover": ["Defender", "Discovery", "Discovery Sport", "Freelander", "Range Rover", "Range Rover Evoque", "Range Rover Sport", "Range Rover Velar"],
    lexus: ["CT", "ES", "GS", "GX", "HS", "IS", "LC", "LM", "LS", "LX", "NX", "RC", "RX", "RZ", "UX"],
    "li-auto": ["L6", "L7", "L8", "L9", "Mega", "One"],
    mazda: ["2", "3", "5", "6", "626", "CX-3", "CX-30", "CX-5", "CX-7", "CX-8", "CX-9", "CX-50", "CX-60", "CX-90", "Demio", "MPV", "MX-5", "Premacy", "Tribute"],
    "mercedes-benz": ["A-Class", "B-Class", "C-Class", "CLA", "CLC", "CLK", "CLS", "E-Class", "EQA", "EQB", "EQC", "EQE", "EQS", "G-Class", "GL", "GLA", "GLB", "GLC", "GLE", "GLK", "GLS", "M-Class", "R-Class", "S-Class", "SL", "SLC", "SLK", "Sprinter", "V-Class", "Viano", "Vito"],
    mitsubishi: ["ASX", "Carisma", "Colt", "Delica", "Diamante", "Eclipse", "Eclipse Cross", "Galant", "Grandis", "L200", "Lancer", "Montero", "Outlander", "Pajero", "Pajero iO", "Pajero Sport", "RVR", "Space Star"],
    nissan: ["350Z", "370Z", "Almera", "Altima", "Armada", "Bluebird", "Cube", "Elgrand", "Frontier", "GT-R", "Juke", "Kicks", "Leaf", "Maxima", "Micra", "Murano", "Navara", "Note", "Pathfinder", "Patrol", "Primera", "Qashqai", "Sentra", "Serena", "Skyline", "Teana", "Terrano", "Tiida", "X-Trail"],
    omoda: ["C5", "C7", "S5"],
    opel: ["Antara", "Astra", "Calibra", "Corsa", "Crossland", "Frontera", "Grandland", "Insignia", "Kadett", "Meriva", "Mokka", "Omega", "Signum", "Sintra", "Vectra", "Vivaro", "Zafira"],
    peugeot: ["206", "207", "208", "301", "307", "308", "406", "407", "408", "508", "2008", "3008", "4007", "5008", "Partner", "Traveller"],
    porsche: ["718", "911", "Boxster", "Cayenne", "Cayman", "Macan", "Panamera", "Taycan"],
    ravon: ["Gentra", "Matiz", "Nexia R3", "R2", "R4"],
    renault: ["Arkana", "Captur", "Clio", "Duster", "Espace", "Fluence", "Kangoo", "Kaptur", "Koleos", "Laguna", "Logan", "Master", "Megane", "Sandero", "Scenic", "Symbol", "Trafic"],
    skoda: ["Fabia", "Karoq", "Kodiaq", "Octavia", "Rapid", "Roomster", "Scala", "Superb", "Yeti"],
    subaru: ["Ascent", "BRZ", "Forester", "Impreza", "Legacy", "Levorg", "Outback", "Tribeca", "WRX", "XV"],
    suzuki: ["Alto", "Baleno", "Celerio", "Escudo", "Grand Vitara", "Ignis", "Jimny", "S-Cross", "Solio", "Swift", "Vitara", "Wagon R"],
    tesla: ["Cybertruck", "Model 3", "Model S", "Model X", "Model Y"],
    toyota: ["4Runner", "Alphard", "Auris", "Avalon", "Avensis", "C-HR", "Camry", "Carina", "Celica", "Corolla", "Crown", "Fortuner", "Harrier", "Highlander", "Hilux", "Ipsum", "Land Cruiser", "Land Cruiser Prado", "Mark II", "Noah", "Passo", "Prius", "RAV4", "Sequoia", "Sienna", "Supra", "Tacoma", "Tundra", "Venza", "Vitz", "Yaris"],
    uaz: ["2206", "3151", "3303", "452", "469", "Hunter", "Patriot", "Pickup", "Profi"],
    volkswagen: ["Amarok", "Arteon", "Beetle", "Bora", "Caddy", "Caravelle", "Crafter", "Golf", "ID.3", "ID.4", "ID.6", "Jetta", "Multivan", "Passat", "Phaeton", "Polo", "Sharan", "Taos", "Teramont", "Tiguan", "Touareg", "Touran", "Transporter"],
    volvo: ["C30", "C40", "S40", "S60", "S80", "S90", "V40", "V60", "V70", "V90", "XC40", "XC60", "XC70", "XC90"],
    zeekr: ["001", "007", "009", "7X", "Mix", "X"],
  }),
  { value: "other-model", label: { ru: "Другая модель", kk: "Басқа модель" } },
] satisfies DependentReferenceOption[];

export const motorcycleBrands: DependentReferenceOption[] = [
  "Aprilia", "Bajaj", "Benelli", "BMW", "BRP", "CFMOTO", "Ducati", "Harley-Davidson",
  "Honda", "Husqvarna", "Indian", "Jawa", "Kawasaki", "KTM", "Kymco", "Moto Guzzi",
  "MV Agusta", "Piaggio", "Polaris", "Royal Enfield", "Suzuki", "Triumph", "Vespa", "Yamaha",
  "ИЖ", "Минск", "Урал", "Другая марка",
].map((label) => ({ value: label === "Другая марка" ? "other" : stableSlug(label), label: { ru: label, kk: label } }));

export const motorcycleModels = [
  ...dependentOptions({
    aprilia: ["RS 125", "RS 660", "RSV4", "Tuareg 660", "Tuono V4"],
    bajaj: ["Boxer", "Dominar 400", "Pulsar 150", "Pulsar 200 NS", "Pulsar 220"],
    benelli: ["302S", "502C", "Leoncino 500", "TRK 502", "TNT 600"],
    bmw: ["C 400", "F 750 GS", "F 850 GS", "G 310", "K 1600", "R 1250 GS", "R 1300 GS", "S 1000 RR"],
    brp: ["Can-Am Maverick", "Can-Am Outlander", "Can-Am Renegade", "Can-Am Ryker", "Can-Am Spyder"],
    cfmoto: ["250NK", "300SR", "450MT", "650MT", "700MT", "800MT", "CFORCE 500", "CFORCE 600", "CFORCE 800"],
    ducati: ["Diavel", "Hypermotard", "Monster", "Multistrada", "Panigale", "Scrambler"],
    "harley-davidson": ["Breakout", "Fat Boy", "Iron 883", "Pan America", "Road Glide", "Sportster", "Street Glide"],
    honda: ["Africa Twin", "CB 400", "CB 500", "CB 650R", "CBR 600RR", "CBR 1000RR", "CRF 250", "Dio", "Gold Wing", "NC 750X", "PCX", "Rebel", "VFR"],
    kawasaki: ["KLR 650", "Ninja 250", "Ninja 400", "Ninja 650", "Ninja ZX-6R", "Ninja ZX-10R", "Versys 650", "Vulcan", "Z650", "Z900"],
    ktm: ["125 Duke", "250 Duke", "390 Adventure", "390 Duke", "690 Enduro", "790 Adventure", "890 Adventure", "1290 Super Adventure"],
    suzuki: ["Address", "Bandit", "Boulevard", "Burgman", "DR-Z400", "GSX-R600", "GSX-R1000", "Hayabusa", "V-Strom 650", "V-Strom 1050"],
    triumph: ["Bonneville", "Rocket 3", "Scrambler", "Speed Triple", "Street Triple", "Tiger 900", "Tiger 1200"],
    yamaha: ["Aerox", "FZ6", "FZ8", "Grizzly", "MT-03", "MT-07", "MT-09", "NMAX", "R1", "R3", "R6", "TMAX", "Tracer 9", "WR250", "XMAX", "XTZ 750"],
  }),
  { value: "other-model", label: { ru: "Другая модель", kk: "Басқа модель" } },
] satisfies DependentReferenceOption[];

export const smartphoneBrands: DependentReferenceOption[] = [
  "Apple", "Samsung", "Xiaomi", "Redmi", "POCO", "Honor", "Huawei", "Google", "OnePlus",
  "OPPO", "realme", "vivo", "Nothing", "Nokia", "Motorola", "Tecno", "Infinix", "ZTE", "Другая марка",
].map((label) => ({ value: label === "Другая марка" ? "other" : stableSlug(label), label: { ru: label, kk: label } }));

export const smartphoneModels = [
  ...dependentOptions({
    apple: [
      "iPhone 8", "iPhone 8 Plus", "iPhone X", "iPhone XR", "iPhone XS", "iPhone XS Max",
      "iPhone SE (2nd generation)", "iPhone SE (3rd generation)",
      "iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max",
      "iPhone 12 mini", "iPhone 12", "iPhone 12 Pro", "iPhone 12 Pro Max",
      "iPhone 13 mini", "iPhone 13", "iPhone 13 Pro", "iPhone 13 Pro Max",
      "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max",
      "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max",
      "iPhone 16e", "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max",
      "iPhone 17e", "iPhone 17", "iPhone Air", "iPhone 17 Pro", "iPhone 17 Pro Max",
    ],
    samsung: ["Galaxy A05", "Galaxy A15", "Galaxy A25", "Galaxy A35", "Galaxy A55", "Galaxy M34", "Galaxy Note 20", "Galaxy S20", "Galaxy S21", "Galaxy S22", "Galaxy S23", "Galaxy S24", "Galaxy S25", "Galaxy S25 Edge", "Galaxy S26", "Galaxy S26+", "Galaxy S26 Ultra", "Galaxy S26 FE", "Galaxy Z Flip", "Galaxy Z Fold"],
    xiaomi: ["11 Lite", "12", "12T", "13", "13T", "14", "14T", "15", "Mi 10", "Mi 11"],
    redmi: ["Note 10", "Note 11", "Note 12", "Note 13", "Note 14", "Redmi 10", "Redmi 12", "Redmi 13", "Redmi 14C"],
    poco: ["C65", "F4", "F5", "F6", "M5", "M6", "X4 Pro", "X5 Pro", "X6 Pro", "X7 Pro"],
    honor: ["70", "90", "200", "Magic 5", "Magic 6", "Magic 7", "Magic V", "X7", "X8", "X9"],
    huawei: ["Mate 40", "Mate 50", "Mate 60", "Nova 9", "Nova 10", "Nova 11", "Nova 12", "P40", "P50", "P60", "Pura 70"],
    google: ["Pixel 6", "Pixel 6 Pro", "Pixel 7", "Pixel 7 Pro", "Pixel 8", "Pixel 8 Pro", "Pixel 9", "Pixel 9 Pro"],
    oneplus: ["9", "10 Pro", "11", "12", "13", "Nord 2", "Nord 3", "Nord 4"],
    oppo: ["A38", "A58", "A78", "Find N", "Find X5", "Find X6", "Find X7", "Reno 8", "Reno 10", "Reno 12"],
    realme: ["10", "11", "12", "C53", "C55", "C67", "GT 3", "GT 5", "GT 6"],
    vivo: ["V25", "V27", "V29", "V30", "X80", "X90", "X100", "Y22", "Y35", "Y36"],
    nothing: ["Phone (1)", "Phone (2)", "Phone (2a)", "Phone (3a)"],
    tecno: ["Camon 20", "Camon 30", "Phantom X2", "Pova 5", "Pova 6", "Spark 10", "Spark 20"],
    infinix: ["GT 10 Pro", "GT 20 Pro", "Hot 30", "Hot 40", "Note 30", "Note 40", "Zero 30"],
  }),
  { value: "other-model", label: { ru: "Другая модель", kk: "Басқа модель" } },
] satisfies DependentReferenceOption[];
