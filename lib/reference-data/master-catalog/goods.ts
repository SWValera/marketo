import type { MasterCatalogNode } from "./types.ts";
import { branch, fallbackLeaf, leaves, overlay, tx } from "./types.ts";

const goods = (entries: Parameters<typeof leaves>[0], profiles: readonly string[] = ["goodsBrand"]) =>
  leaves(entries, profiles);

/** Product vertical missing from the original Marketo tree. */
const constructionRoot: MasterCatalogNode = {
  slug: "construction-repair",
  name: tx("Строительство и ремонт", "Құрылыс және жөндеу"),
  icon: "hammer",
  tone: "amber",
  searchPlaceholder: tx("Стройматериалы, сантехника или инструмент", "Құрылыс материалы, сантехника немесе құрал"),
  titlePlaceholder: tx("Например, керамогранит 60×60", "Мысалы, 60×60 керамогранит"),
  descriptionHint: tx("Укажите материал, размер, объём, состояние и доставку.", "Материалды, өлшемді, көлемді, күйін және жеткізуді көрсетіңіз."),
  schemaProfiles: ["buildingMaterial"],
  children: [
    branch("construction-plumbing", "Сантехника", "Сантехника", goods([
      ["sanitary-ware", "Унитазы, раковины и биде", "Унитаз, шұнқыр және биде"],
      ["baths-showers", "Ванны и душевые", "Ванна және душ"],
      ["faucets-showers", "Смесители и душевые системы", "Араластырғыштар және душ жүйелері"],
      ["pipes-fittings", "Трубы и фитинги", "Құбырлар мен фитингтер"],
      ["water-supply-sewer", "Водоснабжение и канализация", "Сумен жабдықтау және кәріз"],
      ["plumbing-installation", "Инсталляции и комплектующие", "Инсталляциялар мен жинақтаушылар"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("construction-tools", "Инструменты и оборудование", "Құралдар мен жабдықтар", goods([
      ["construction-power-tools", "Электроинструмент", "Электр құралы"], ["construction-hand-tools", "Ручной инструмент", "Қол құралы"],
      ["welding-equipment", "Сварочное оборудование", "Дәнекерлеу жабдығы"], ["compressors-generators", "Компрессоры и генераторы", "Компрессорлар мен генераторлар"],
      ["ladders-scaffolding", "Лестницы, леса и вышки", "Саты, сатылар және мұнаралар"], ["measuring-tools", "Измерительный инструмент", "Өлшеу құралы"],
    ], ["tool"]), ["tool"]),
    branch("finishing-facing-materials", "Отделочные и облицовочные материалы", "Әрлеу және қаптау материалдары", goods([
      ["ceramic-tile", "Плитка и керамогранит", "Плитка және керамогранит"], ["wallpaper", "Обои", "Тұсқағаз"], ["laminate-parquet", "Ламинат и паркет", "Ламинат және паркет"],
      ["linoleum-carpet", "Линолеум и ковролин", "Линолеум және ковролин"], ["wall-panels", "Стеновые панели", "Қабырға панельдері"], ["decorative-stone", "Декоративный камень", "Сәндік тас"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("windows-doors-building", "Окна, двери, балконы и зеркала", "Терезе, есік, балкон және айна", goods([
      ["plastic-windows", "Пластиковые окна", "Пластик терезелер"], ["wood-aluminum-windows", "Деревянные и алюминиевые окна", "Ағаш және алюминий терезелер"],
      ["interior-doors", "Межкомнатные двери", "Бөлмеаралық есіктер"], ["entrance-doors", "Входные двери", "Кіреберіс есіктері"], ["door-hardware", "Дверная и оконная фурнитура", "Есік пен терезе фурнитурасы"], ["mirrors-glass", "Зеркала и стекло", "Айна және әйнек"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("lumber-wood-materials", "Пиломатериалы", "Ағаш материалдары", goods([
      ["boards-beams", "Доска и брус", "Тақтай және брус"], ["plywood-osb", "Фанера, OSB и ДСП", "Фанера, OSB және ДСП"], ["lining-blockhouse", "Вагонка и блок-хаус", "Вагонка және блок-хаус"], ["wood-products", "Столярные изделия", "Ағаш бұйымдары"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("construction-electrics", "Электрика", "Электрика", goods([
      ["cables-wires", "Кабели и провода", "Кабельдер мен сымдар"], ["sockets-switches", "Розетки и выключатели", "Розеткалар мен ажыратқыштар"], ["electrical-panels-breakers", "Щиты, автоматы и УЗО", "Қалқандар, автоматтар және ҚҚҚ"], ["electrical-accessories", "Электромонтажные материалы", "Электр монтаждау материалдары"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("heating-building", "Отопление", "Жылыту", goods([
      ["heating-boilers", "Котлы", "Қазандықтар"], ["radiators-convectors", "Радиаторы и конвекторы", "Радиаторлар мен конвекторлар"], ["underfloor-heating", "Тёплый пол", "Жылы еден"], ["heating-pumps-accessories", "Насосы и комплектующие", "Сорғылар мен жинақтаушылар"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("dry-mixes-building", "Сухие строительные смеси", "Құрғақ құрылыс қоспалары", goods([
      ["cement-building", "Цемент", "Цемент"], ["plaster-putty", "Штукатурка и шпаклёвка", "Сылақ және тегістегіш"], ["tile-adhesive-grout", "Клей и затирка", "Желім және тігіс толтырғыш"], ["floor-screed-leveler", "Стяжка и наливной пол", "Еден тегістегіш қоспалары"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("roofing-building", "Кровля и водосток", "Шатыр және су ағызғыш", goods([
      ["metal-roofing", "Металлочерепица и профнастил", "Металл шатыр және профнастил"], ["flexible-roofing", "Мягкая кровля", "Жұмсақ шатыр"], ["slate-roofing", "Шифер и ондулин", "Шифер және ондулин"], ["gutters-roof-accessories", "Водостоки и доборные элементы", "Су ағызғыштар мен қосымша элементтер"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("masonry-building", "Кирпич, блоки и железобетон", "Кірпіш, блок және темірбетон", goods([
      ["building-brick", "Кирпич", "Кірпіш"], ["gas-foam-blocks", "Газоблок и пеноблок", "Газоблок және пеноблок"], ["foundation-blocks", "Фундаментные блоки", "Іргетас блоктары"], ["reinforced-concrete-products", "Плиты, кольца и ЖБИ", "Плиталар, сақиналар және ТББ"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("fasteners-metal-building", "Крепёж и металлопрокат", "Бекіткіш және металл прокаты", goods([
      ["fasteners-hardware", "Крепёж и метизы", "Бекіткіштер мен метиздер"], ["rebar-mesh", "Арматура и сетка", "Арматура және тор"], ["steel-pipes-profiles", "Трубы и профиль", "Құбырлар мен профиль"], ["sheet-metal", "Листовой металл", "Табақ металл"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("insulation-chemistry", "Изоляция и строительная химия", "Оқшаулау және құрылыс химиясы", goods([
      ["thermal-insulation", "Теплоизоляция", "Жылу оқшаулау"], ["waterproofing", "Гидроизоляция", "Су оқшаулау"], ["soundproofing", "Шумоизоляция", "Дыбыс оқшаулау"], ["sealants-foam", "Герметики и монтажная пена", "Герметиктер мен монтаж көбігі"], ["construction-adhesives", "Клеи и грунтовки", "Желімдер мен астарлар"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("paint-materials", "Лакокрасочные материалы", "Бояу-лак материалдары", goods([
      ["interior-paint", "Интерьерные краски", "Интерьерлік бояулар"], ["facade-paint", "Фасадные краски", "Қасбет бояулары"], ["varnish-stain", "Лаки и пропитки", "Лактар мен сіңдіргіштер"], ["paint-tools", "Малярный инструмент", "Сырлау құралы"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("bulk-road-materials", "Сыпучие и дорожные материалы", "Сусымалы және жол материалдары", goods([
      ["sand-building", "Песок", "Құм"], ["crushed-stone", "Щебень и гравий", "Қиыршық тас және қиыршық"], ["ready-mix-concrete", "Готовый бетон и раствор", "Дайын бетон және ерітінді"], ["paving-road-materials", "Асфальт и дорожные смеси", "Асфальт және жол қоспалары"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    branch("ventilation-building", "Вентиляция и кондиционирование", "Желдету және ауа баптау", goods([
      ["ventilation-ducts", "Воздуховоды и фасонные части", "Ауа арналары мен бөлшектер"], ["ventilation-fans", "Вентиляторы и вытяжки", "Желдеткіштер мен сорғыштар"], ["air-handling-units", "Приточные и канальные установки", "Ағындық және арналық қондырғылар"], ["hvac-components", "Комплектующие HVAC", "HVAC жинақтаушылары"],
    ], ["buildingMaterial"]), ["buildingMaterial"]),
    fallbackLeaf("other-construction-goods", "Другие стройматериалы", "Басқа құрылыс материалдары", ["buildingMaterial"]),
  ],
};

/** Product rental is intentionally separate from real-estate rent and services. */
const rentalsRoot: MasterCatalogNode = {
  slug: "goods-rental",
  name: tx("Аренда и прокат товаров", "Тауарларды жалға беру"),
  icon: "calendar",
  tone: "teal",
  searchPlaceholder: tx("Что нужно взять в аренду?", "Нені жалға алу керек?"),
  titlePlaceholder: tx("Например, прокат перфоратора", "Мысалы, перфораторды жалға беру"),
  descriptionHint: tx("Укажите срок, залог, доставку, комплект и состояние.", "Мерзімді, кепілді, жеткізуді, жинақты және күйді көрсетіңіз."),
  schemaProfiles: ["rentalGoods"],
  children: [
    branch("rental-tools-equipment", "Инструменты и оборудование", "Құралдар мен жабдық", goods([
      ["rental-power-tools", "Электроинструмент", "Электр құралы", ["rentalGoods", "tool"]],
      ["rental-construction-equipment", "Строительное оборудование", "Құрылыс жабдығы", ["rentalGoods", "equipment"]],
      ["rental-generators-compressors", "Генераторы и компрессоры", "Генераторлар мен компрессорлар", ["rentalGoods", "equipment", "rentalGeneratorCompressor"]],
      ["rental-garden-tools", "Садовая техника", "Бақша техникасы", ["rentalGoods", "tool"]],
    ], ["rentalGoods"]), ["rentalGoods"]),
    branch("rental-special-machinery", "Спецтехника", "Арнайы техника", goods([
      ["rental-excavators-loaders", "Экскаваторы и погрузчики", "Экскаваторлар мен тиегіштер"], ["rental-cranes-lifts", "Краны и автовышки", "Крандар мен автомұнаралар"], ["rental-aerial-platforms", "Подъёмники и вышки", "Көтергіштер мен мұнаралар"], ["rental-road-machinery", "Дорожная техника", "Жол техникасы"],
    ], ["rentalGoods", "machinery"]), ["rentalGoods", "machinery"]),
    branch("rental-vehicles", "Транспорт", "Көлік", goods([
      ["rental-passenger-cars", "Легковые автомобили", "Жеңіл автомобильдер", ["rentalGoods", "passengerCar", "vehicleCompliance"]],
      ["rental-minibuses-buses", "Микроавтобусы и автобусы", "Шағын автобустар мен автобустар", ["rentalGoods", "commercialVehicle", "passengerCommercial"]],
      ["rental-trucks", "Грузовой транспорт", "Жүк көлігі", ["rentalGoods", "commercialVehicle"]],
      ["rental-bikes-scooters", "Велосипеды и самокаты", "Велосипедтер мен самокаттар", ["rentalGoods", "bicycle", "rentalBicycleScooter"]],
    ], ["rentalGoods"]), ["rentalGoods"]),
    branch("rental-events-leisure", "Мероприятия и отдых", "Іс-шаралар мен демалыс", goods([
      ["rental-event-furniture", "Мебель и текстиль для мероприятий", "Іс-шараға арналған жиһаз бен тоқыма", ["rentalGoods", "furniture", "rentalEventFurniture"]],
      ["rental-sound-light", "Звуковое и световое оборудование", "Дыбыс және жарық жабдығы", ["rentalGoods", "audio", "lighting", "rentalSoundLight"]],
      ["rental-tents-pavilions", "Шатры и павильоны", "Шатырлар мен павильондар", ["rentalGoods", "outdoorGear"]],
      ["rental-costumes-decor", "Костюмы и декор", "Костюмдер мен безендіру", ["rentalGoods", "clothing", "rentalCostumeDecor"]],
      ["rental-sports-tourism", "Спортивный и туристический инвентарь", "Спорт және туризм құралдары", ["rentalGoods", "sportsGoods", "outdoorGear", "rentalSportsTourism"]],
    ], ["rentalGoods"]), ["rentalGoods"]),
    branch("rental-electronics", "Электроника", "Электроника", goods([
      ["rental-photo-video", "Фото- и видеотехника", "Фото және бейне техникасы", ["rentalGoods", "camera", "rentalPhotoVideo"]],
      ["rental-computers-projectors", "Компьютеры и проекторы", "Компьютерлер мен проекторлар", ["rentalGoods", "computer", "rentalComputerProjector"]],
      ["rental-game-consoles", "Игровые приставки и VR", "Ойын консольдары және VR", ["rentalGoods", "gaming", "rentalGamingDevice"]],
      ["rental-home-appliances", "Бытовая техника", "Тұрмыстық техника", ["rentalGoods", "appliance", "genericAppliance"]],
    ], ["rentalGoods"]), ["rentalGoods"]),
    branch("rental-kids-goods", "Детские товары", "Балалар тауарлары", goods([
      ["rental-strollers-seats", "Коляски и автокресла", "Арбалар мен автоорындықтар", ["rentalGoods", "stroller", "regulatedSafety", "rentalStrollerSeat"]],
      ["rental-kids-furniture", "Детская мебель", "Балалар жиһазы", ["rentalGoods", "furniture"]],
      ["rental-kids-party", "Товары для детских праздников", "Балалар мерекесіне арналған тауарлар", ["rentalGoods", "productCore"]],
      ["rental-kids-transport", "Детский транспорт", "Балалар көлігі", ["rentalGoods", "bicycle"]],
    ], ["rentalGoods"]), ["rentalGoods"]),
    fallbackLeaf("other-rental-goods", "Другие товары напрокат", "Жалға берілетін басқа тауарлар", ["rentalGoods"]),
  ],
};

const electronicsOverlay = overlay("electronics", [
  branch("tablets-ereaders", "Планшеты и электронные книги", "Планшеттер мен электронды кітаптар", [
    ...goods([["tablets", "Планшеты", "Планшеттер"]], ["tablet", "tabletDeviceSpecs"]),
    ...goods([["ereaders", "Электронные книги", "Электронды кітаптар"]], ["ereader"]),
    ...goods([["tablet-accessories", "Аксессуары для планшетов", "Планшет аксессуарлары"]], ["goodsBrand"]),
  ], ["goodsBrand"]),
  branch("home-appliances", "Техника для дома", "Үйге арналған техника", goods([
    ["washing-machines", "Стиральные машины", "Кір жуғыш машиналар", ["appliance", "energyRatedAppliance", "laundryAppliance"]],
    ["drying-machines", "Сушильные машины", "Кептіргіш машиналар", ["appliance", "energyRatedAppliance", "dryingAppliance"]],
    ["vacuum-cleaners", "Пылесосы", "Шаңсорғыштар", ["appliance", "vacuumAppliance"]],
    ["robot-vacuums", "Роботы-пылесосы", "Робот шаңсорғыштар", ["appliance", "vacuumAppliance"]],
    ["irons-steamers", "Утюги и отпариватели", "Үтіктер мен булағыштар", ["appliance", "ironSteamerAppliance"]],
    ["sewing-machines", "Швейные и вязальные машины", "Тігін және тоқу машиналары", ["appliance", "sewingAppliance"]],
  ], ["appliance"]), ["appliance"]),
  branch("kitchen-appliances", "Техника для кухни", "Асүй техникасы", goods([
    ["refrigerators", "Холодильники", "Тоңазытқыштар", ["appliance", "energyRatedAppliance", "refrigeratorAppliance"]],
    ["freezers", "Морозильники", "Мұздатқыштар", ["appliance", "energyRatedAppliance", "freezerAppliance"]],
    ["cookers-hobs", "Плиты и варочные панели", "Плиталар мен пісіру панельдері", ["appliance", "energyRatedAppliance", "cookerHobAppliance"]],
    ["ovens", "Духовые шкафы", "Пештер", ["appliance", "energyRatedAppliance", "ovenAppliance"]],
    ["dishwashers", "Посудомоечные машины", "Ыдыс жуғыш машиналар", ["appliance", "energyRatedAppliance", "dishwasherAppliance"]],
    ["microwave-ovens", "Микроволновые печи", "Микротолқынды пештер", ["appliance", "microwaveAppliance"]],
    ["kitchen-hoods", "Вытяжки", "Сорғыштар", ["appliance", "hoodAppliance"]],
    ["small-kitchen-appliances", "Мелкая техника", "Шағын асүй техникасы", ["appliance", "smallKitchenAppliance"]],
  ], ["appliance"]), ["appliance"]),
  branch("climate-equipment", "Климатическая техника", "Климаттық техника", goods([
    ["air-conditioners", "Кондиционеры", "Кондиционерлер", ["appliance", "energyRatedAppliance", "climateAppliance"]],
    ["heaters", "Обогреватели", "Жылытқыштар", ["appliance", "heatingAppliance"]],
    ["humidifiers-purifiers", "Увлажнители и очистители", "Ылғалдандырғыштар мен тазартқыштар", ["appliance", "airTreatmentAppliance"]],
    ["household-fans", "Вентиляторы", "Желдеткіштер", ["appliance", "fanAppliance"]],
    ["water-heaters", "Водонагреватели", "Су жылытқыштар", ["appliance", "energyRatedAppliance", "waterHeaterAppliance"]],
  ], ["appliance"]), ["appliance"]),
  branch("personal-care-electronics", "Техника для ухода", "Күтім техникасы", goods([
    ["hair-styling-devices", "Фены и укладка волос", "Фендер мен шаш сәндеу", ["appliance", "hairStylingAppliance"]],
    ["shavers-trimmers", "Электробритвы и триммеры", "Электр ұстаралар мен триммерлер", ["appliance", "groomingAppliance"]],
    ["epilators-care", "Эпиляторы и уход за кожей", "Эпиляторлар мен тері күтімі", ["appliance", "skinCareAppliance"]],
    ["electric-toothbrushes", "Электрические зубные щётки", "Электр тіс щеткалары", ["appliance", "toothbrushAppliance"]],
    ["health-electronics", "Весы и товары для здоровья", "Таразылар мен денсаулық тауарлары", ["appliance", "healthAppliance", "regulatedSafety"]],
  ], ["appliance"]), ["appliance"]),
]);

export const goodsCatalogOverlays: MasterCatalogNode[] = [
  electronicsOverlay,
  constructionRoot,
  rentalsRoot,
];
