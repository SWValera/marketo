import { passengerVehicleBrands } from "./vehicle-brands.ts";
import {
  motorcycleBrands,
  motorcycleModels,
  passengerVehicleModels,
  smartphoneBrands,
  smartphoneModels,
  type DependentReferenceOption,
} from "./dependent-options.ts";
import { ereaderBrands, ereaderModels, tabletBrands, tabletModels } from "./device-options.ts";
import { masterCatalogProfileAssignments } from "./master-catalog/index.ts";
import { passengerVehicleModelsByBody } from "./vehicle-body-models.ts";

export type SeedLocalizedText = { ru: string; kk: string };
export type SeedFilterMode = "exact" | "range" | "search";
export type SeedOptionsLoadMode = "eager" | "deferred";
export type SeedAttributeOption = {
  value: string;
  label: SeedLocalizedText;
  parentValue?: string;
};
export type SeedAttributeDefinition = {
  key: string;
  label: SeedLocalizedText;
  dataType: "text" | "number" | "boolean" | "select" | "multiselect" | "range" | "date";
  unit?: SeedLocalizedText;
  required?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  filterMode?: SeedFilterMode;
  optionsLoadMode?: SeedOptionsLoadMode;
  dependsOnKey?: string;
  validation?: Record<string, unknown>;
  options?: SeedAttributeOption[];
};

const tx = (ru: string, kk: string): SeedLocalizedText => ({ ru, kk });
const op = (value: string, ru: string, kk: string = ru): SeedAttributeOption => ({ value, label: tx(ru, kk) });
const select = (
  key: string,
  ru: string,
  kk: string,
  options: SeedAttributeOption[],
  config: Partial<SeedAttributeDefinition> = {},
): SeedAttributeDefinition => ({ key, label: tx(ru, kk), dataType: "select", filterable: true, filterMode: "exact", options, ...config });
const text = (key: string, ru: string, kk: string, config: Partial<SeedAttributeDefinition> = {}): SeedAttributeDefinition =>
  ({ key, label: tx(ru, kk), dataType: "text", ...config });
const number = (key: string, ru: string, kk: string, unitRu?: string, unitKk?: string, config: Partial<SeedAttributeDefinition> = {}): SeedAttributeDefinition =>
  ({ key, label: tx(ru, kk), dataType: "number", unit: unitRu && unitKk ? tx(unitRu, unitKk) : undefined, filterable: true, filterMode: "range", ...config });
const bool = (key: string, ru: string, kk: string, config: Partial<SeedAttributeDefinition> = {}): SeedAttributeDefinition =>
  ({ key, label: tx(ru, kk), dataType: "boolean", filterable: true, filterMode: "exact", ...config });
const date = (key: string, ru: string, kk: string, config: Partial<SeedAttributeDefinition> = {}): SeedAttributeDefinition =>
  ({ key, label: tx(ru, kk), dataType: "date", filterable: true, filterMode: "range", ...config });
const visibleWhen = (
  key: string,
  values: string[],
  validation: Record<string, unknown> = {},
): Record<string, unknown> => ({ ...validation, visibleWhen: { key, values } });

const CONDITION = select("condition", "Состояние", "Күйі", [
  op("new", "Новое", "Жаңа"), op("like-new", "Как новое", "Жаңа сияқты"),
  op("used", "Б/у", "Қолданылған"), op("repair", "Требует ремонта", "Жөндеуді қажет етеді"),
], { required: true });
const BRAND_TEXT = text("brand", "Бренд", "Бренд", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 80 } });
const MODEL_TEXT = text("model", "Модель", "Модель", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 100 } });
const YEAR = number("year", "Год выпуска", "Шығарылған жылы", "год", "жыл", { validation: { min: 1900, max: 2100 } });
const WARRANTY = select("warranty", "Гарантия", "Кепілдік", [op("none", "Нет", "Жоқ"), op("seller", "От продавца", "Сатушыдан"), op("manufacturer", "От производителя", "Өндірушіден")]);
const DELIVERY = bool("delivery", "Есть доставка", "Жеткізу бар");

const PRODUCT_CORE: SeedAttributeDefinition[] = [
  CONDITION,
  text("material", "Материал / состав", "Материал / құрам", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 120 } }),
  text("dimensions", "Размеры", "Өлшемдері", { searchable: true, validation: { maxLength: 120 } }),
  select("color", "Цвет", "Түсі", [
    op("black", "Чёрный", "Қара"), op("white", "Белый", "Ақ"), op("gray", "Серый", "Сұр"),
    op("silver", "Серебристый", "Күміс"), op("blue", "Синий", "Көк"), op("red", "Красный", "Қызыл"),
    op("green", "Зелёный", "Жасыл"), op("brown", "Коричневый", "Қоңыр"), op("beige", "Бежевый", "Сарғыш"),
    op("multicolor", "Разноцветный", "Түрлі түсті"), op("other", "Другой", "Басқа"),
  ]),
  number("quantity", "Количество", "Саны", "шт.", "дана", { validation: { min: 1, max: 1_000_000 } }),
  select("sale_unit", "Единица продажи", "Сату бірлігі", [
    op("piece", "Штука", "Дана"), op("set", "Комплект", "Жинақ"), op("package", "Упаковка", "Қаптама"),
    op("meter", "Метр", "Метр"), op("square-meter", "М²", "М²"), op("cubic-meter", "М³", "М³"),
    op("kilogram", "Кг", "Кг"), op("liter", "Литр", "Литр"),
  ]),
  DELIVERY,
];

const CONSUMABLE_LOT: SeedAttributeDefinition[] = [
  BRAND_TEXT,
  number("net_quantity", "Количество нетто", "Таза мөлшері", undefined, undefined, { required: true, validation: { min: 0.001, max: 1_000_000 } }),
  select("quantity_unit", "Единица измерения", "Өлшем бірлігі", [
    op("g", "г", "г"), op("kg", "кг", "кг"), op("ml", "мл", "мл"), op("l", "л", "л"),
    op("pcs", "шт.", "дана"), op("pack", "упаковка", "қаптама"), op("m", "м", "м"),
    op("m2", "м²", "м²"), op("m3", "м³", "м³"), op("t", "тонна", "тонна"),
  ], { required: true }),
  select("package_type", "Тип упаковки", "Қаптама түрі", [
    op("unit", "Без упаковки", "Қаптамасыз"), op("pack", "Пачка", "Пакет"), op("box", "Коробка", "Қорап"),
    op("bag", "Мешок", "Қап"), op("bottle", "Бутылка", "Бөтелке"), op("canister", "Канистра", "Канистр"),
    op("jar", "Банка", "Құты"), op("roll", "Рулон", "Орам"), op("bulk", "Навалом / наливом", "Үйінді / құйма"),
  ]),
  select("package_condition", "Состояние упаковки", "Қаптама күйі", [
    op("sealed", "Заводская, запечатана", "Зауыттық, жабық"), op("opened", "Вскрыта", "Ашылған"),
    op("damaged", "Повреждена", "Зақымдалған"), op("bulk", "Без заводской упаковки", "Зауыттық қаптамасыз"),
  ], { required: true }),
  date("manufacture_date", "Дата производства", "Өндірілген күні"),
  date("expiry_date", "Годен до", "Жарамдылық мерзімі"),
  text("composition", "Состав / сорт / марка", "Құрамы / сұрыпы / маркасы", { searchable: true, validation: { maxLength: 500 } }),
  select("storage_conditions", "Условия хранения", "Сақтау шарттары", [
    op("room", "При комнатной температуре", "Бөлме температурасында"), op("cool", "В прохладном месте", "Салқын жерде"),
    op("refrigerated", "В холодильнике", "Тоңазытқышта"), op("frozen", "В замороженном виде", "Мұздатылған күйде"),
    op("dry", "В сухом месте", "Құрғақ жерде"), op("special", "Специальные условия", "Арнайы шарттар"),
  ]),
  number("minimum_order", "Минимальный заказ", "Ең аз тапсырыс", undefined, undefined, { validation: { min: 0.001, max: 1_000_000 } }),
  bool("wholesale", "Оптовая продажа", "Көтерме сату"),
  DELIVERY,
];

const DEVICE_SPECS: SeedAttributeDefinition[] = [
  number("screen_size", "Диагональ экрана", "Экран диагоналі", "дюйм", "дюйм", { validation: { min: 1, max: 100, step: 0.1 } }),
  select("display_type", "Тип экрана", "Экран түрі", [
    op("lcd", "LCD", "LCD"), op("ips", "IPS", "IPS"), op("oled", "OLED", "OLED"),
    op("amoled", "AMOLED", "AMOLED"), op("other", "Другой", "Басқа"),
  ]),
  select("screen_resolution", "Разрешение экрана", "Экран ажыратымдылығы", [
    op("hd", "HD", "HD"), op("full-hd", "Full HD", "Full HD"), op("qhd", "QHD / 2K", "QHD / 2K"),
    op("4k", "4K", "4K"), op("other", "Другое", "Басқа"),
  ]),
  select("operating_system", "Операционная система", "Операциялық жүйе", [
    op("android", "Android", "Android"), op("ios", "iOS", "iOS"), op("harmonyos", "HarmonyOS", "HarmonyOS"),
    op("windows", "Windows", "Windows"), op("other", "Другая", "Басқа"), op("none", "Без ОС", "ОЖ жоқ"),
  ]),
  select("network_generation", "Поколение мобильной сети", "Мобильді желі буыны", [
    op("none", "Без мобильной сети", "Мобильді желісіз"), op("2g", "2G", "2G"),
    op("3g", "3G", "3G"), op("4g", "4G / LTE", "4G / LTE"), op("5g", "5G", "5G"),
  ]),
  bool("nfc", "NFC", "NFC"),
  number("battery_capacity", "Ёмкость аккумулятора", "Аккумулятор сыйымдылығы", "мА·ч", "мА·сағ", { validation: { min: 100, max: 100_000 } }),
  number("battery_health", "Состояние аккумулятора", "Аккумулятор күйі", "%", "%", { validation: { min: 0, max: 100 } }),
  select("repair_history", "История ремонта", "Жөндеу тарихы", [
    op("none", "Не ремонтировался", "Жөнделмеген"), op("repaired", "Был в ремонте", "Жөндеуде болған"),
    op("unknown", "Неизвестно", "Белгісіз"),
  ]),
  bool("imei_available", "IMEI / серийный номер доступен для проверки", "IMEI / сериялық нөмір тексеруге қолжетімді"),
];

const TABLET_DEVICE_SPECS: SeedAttributeDefinition[] = DEVICE_SPECS;

const VEHICLE_COMPLIANCE: SeedAttributeDefinition[] = [
  text("generation", "Поколение", "Буын", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 100 } }),
  text("trim", "Комплектация", "Жинақталым", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 120 } }),
  number("engine_power", "Мощность двигателя", "Қозғалтқыш қуаты", "л.с.", "а.к.", { validation: { min: 1, max: 5_000 } }),
  select("owners_count", "Количество владельцев", "Иелер саны", [
    op("1", "1", "1"), op("2", "2", "2"), op("3", "3", "3"), op("4+", "4 и больше", "4 және одан көп"),
  ]),
  bool("customs_cleared", "Растаможен в Казахстане", "Қазақстанда кедендік тазартудан өткен", { required: true }),
  select("registration_status", "Регистрация", "Тіркеу", [
    op("kz", "Учёт Казахстана", "Қазақстан есебінде"), op("foreign", "Иностранный учёт", "Шетелдік есепте"),
    op("unregistered", "Не зарегистрирован", "Тіркелмеген"), op("transit", "Транзит", "Транзит"),
  ], { required: true }),
  text("registration_country", "Страна регистрации", "Тіркелген ел", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 80 } }),
  select("documents_status", "Состояние документов", "Құжаттардың күйі", [
    op("complete", "Полный комплект", "Толық жинақ"), op("duplicate", "Дубликат", "Телнұсқа"),
    op("in-process", "Оформляются", "Рәсімделуде"), op("missing", "Нет документов", "Құжаттар жоқ"),
  ], { required: true }),
  select("accident_history", "Участие в ДТП", "ЖКО-ға қатысуы", [
    op("none", "Не участвовал", "Қатыспаған"), op("repaired", "Были ДТП / ремонт", "ЖКО / жөндеу болған"),
    op("damaged", "После ДТП", "ЖКО-дан кейін"), op("unknown", "Неизвестно", "Белгісіз"),
  ], { required: true }),
  select("encumbrance_status", "Ограничения", "Шектеулер", [
    op("none", "Нет", "Жоқ"), op("pledge", "В залоге", "Кепілде"), op("arrest", "Под арестом", "Тыйым салынған"),
    op("other", "Другие", "Басқа"), op("unknown", "Неизвестно", "Белгісіз"),
  ]),
  bool("vin_available", "VIN доступен для проверки", "VIN тексеруге қолжетімді", { required: true }),
];

const PROPERTY_DOCS_UTILITIES: SeedAttributeDefinition[] = [
  select("seller_role", "Кто размещает", "Кім жариялайды", [
    op("owner", "Собственник", "Меншік иесі"), op("agent", "Риелтор / агент", "Риелтор / агент"),
    op("developer", "Застройщик", "Құрылыс салушы"),
  ], { required: true }),
  select("ownership_type", "Право на объект", "Нысанға құқық", [
    op("private", "Частная собственность", "Жеке меншік"), op("shared", "Долевая собственность", "Үлестік меншік"),
    op("lease", "Право аренды", "Жалдау құқығы"), op("other", "Другое", "Басқа"),
  ]),
  select("property_documents", "Документы", "Құжаттар", [
    op("ready", "Готовы", "Дайын"), op("in-process", "Оформляются", "Рәсімделуде"),
    op("missing", "Нет / требуют восстановления", "Жоқ / қалпына келтіру қажет"),
  ], { required: true }),
  select("property_encumbrance", "Обременение", "Ауыртпалық", [
    op("none", "Нет", "Жоқ"), op("mortgage", "Ипотека", "Ипотека"), op("arrest", "Арест", "Тыйым"),
    op("other", "Другое", "Басқа"), op("unknown", "Неизвестно", "Белгісіз"),
  ]),
  select("address_visibility", "Показывать адрес", "Мекенжайды көрсету", [
    op("exact", "Точный адрес", "Нақты мекенжай"), op("approximate", "Примерное место", "Шамамен орналасуы"),
    op("district", "Только район", "Тек аудан"),
  ], { required: true }),
  bool("electricity", "Электричество", "Электр бар"), bool("water", "Вода", "Су бар"),
  bool("sewerage", "Канализация", "Кәріз бар"), bool("gas", "Газ", "Газ бар"),
  bool("internet", "Интернет", "Интернет бар"), bool("parking", "Парковка", "Тұрақ бар"),
];

const PROFESSIONAL_REQUIREMENTS: SeedAttributeDefinition[] = [
  bool("salary_negotiable", "Зарплата по договорённости", "Жалақы келісім бойынша"),
  select("contract_type", "Оформление", "Рәсімдеу түрі", [
    op("employment", "Трудовой договор", "Еңбек шарты"), op("civil", "Договор ГПХ", "Азаматтық-құқықтық шарт"),
    op("service", "Договор услуг", "Қызмет көрсету шарты"), op("internship", "Стажировка", "Тағылымдама"),
    op("unspecified", "Не указано", "Көрсетілмеген"),
  ]),
  text("skills", "Ключевые навыки", "Негізгі дағдылар", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 500 } }),
  text("languages", "Языки", "Тілдер", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 200 } }),
  text("license_categories", "Права / допуски / сертификаты", "Куәлік / рұқсат / сертификаттар", { searchable: true, validation: { maxLength: 300 } }),
  bool("business_travel", "Командировки", "Іссапарлар"),
  bool("online_hiring", "Онлайн-собеседование", "Онлайн сұхбат"),
];

const REGULATED_SAFETY: SeedAttributeDefinition[] = [
  select("certification", "Сертификация", "Сертификаттау", [
    op("not-required", "Не требуется", "Қажет емес"), op("available", "Документы есть", "Құжаттар бар"),
    op("on-request", "Предоставлю по запросу", "Сұрау бойынша беремін"), op("pending", "Оформляется", "Рәсімделуде"),
  ], { required: true }),
  text("compliance_document", "Номер / тип документа", "Құжат нөмірі / түрі", { searchable: true, validation: { maxLength: 160 } }),
  date("document_valid_until", "Документ действителен до", "Құжаттың жарамдылық мерзімі"),
  bool("sterile", "Стерильный товар", "Стерильді тауар"),
  bool("professional_use", "Только для профессионального использования", "Тек кәсіби пайдалануға арналған"),
  select("age_limit", "Возрастное ограничение", "Жас шектеуі", [
    op("none", "Нет", "Жоқ"), op("12", "12+", "12+"), op("16", "16+", "16+"), op("18", "18+", "18+"),
  ]),
];

const PASSENGER_BRANDS: SeedAttributeOption[] = passengerVehicleBrands;
const MOTORCYCLE_BRANDS: SeedAttributeOption[] = motorcycleBrands;
const SMARTPHONE_BRANDS: SeedAttributeOption[] = smartphoneBrands;
const WATCH_BRANDS: SeedAttributeOption[] = [
  ...SMARTPHONE_BRANDS.filter((option) => option.value !== "other"),
  op("garmin", "Garmin", "Garmin"),
  op("amazfit", "Amazfit", "Amazfit"),
  op("fitbit", "Fitbit", "Fitbit"),
  op("suunto", "Suunto", "Suunto"),
  op("polar", "Polar", "Polar"),
  op("haylou", "Haylou", "Haylou"),
  op("other", "Другая марка", "Басқа марка"),
];
const dependentSelect = (
  key: string,
  ru: string,
  kk: string,
  dependsOnKey: string,
  options: DependentReferenceOption[],
  required = true,
): SeedAttributeDefinition => select(key, ru, kk, options, {
  required,
  dependsOnKey,
  optionsLoadMode: "deferred",
  validation: { fallbackOption: "other-model" },
});
const OTHER_MODEL = text("model_other", "Другая модель", "Басқа модель", {
  searchable: true,
  validation: { maxLength: 100, visibleWhen: { key: "model", values: ["other-model"] } },
});
const OTHER_COMPATIBLE_MODEL = text("compatible_model_other", "Другая совместимая модель", "Басқа үйлесімді модель", {
  searchable: true,
  validation: { maxLength: 100, visibleWhen: { key: "compatible_model", values: ["other-model"] } },
});

const passengerCarProfile = (
  models: DependentReferenceOption[] = passengerVehicleModels,
): SeedAttributeDefinition[] => [
  select("brand", "Марка", "Маркасы", PASSENGER_BRANDS, { required: true }),
  dependentSelect("model", "Модель", "Моделі", "brand", models), OTHER_MODEL,
  YEAR,
  number("mileage", "Пробег", "Жүрісі", "км", "км", { validation: { min: 0, max: 5_000_000 } }),
  select("transmission", "Коробка передач", "Беріліс қорабы", [op("automatic", "Автомат", "Автомат"), op("manual", "Механика", "Механика"), op("robot", "Робот", "Робот"), op("cvt", "Вариатор", "Вариатор")]),
  select("fuel", "Топливо", "Отын", [op("petrol", "Бензин", "Бензин"), op("diesel", "Дизель", "Дизель"), op("gas", "Газ", "Газ"), op("petrol-gas", "Бензин / газ", "Бензин / газ"), op("hybrid", "Гибрид", "Гибрид"), op("plugin-hybrid", "Plug-in hybrid", "Қуатталатын гибрид"), op("electric", "Электро", "Электр")]),
  select("drive", "Привод", "Жетек", [op("front", "Передний", "Алдыңғы"), op("rear", "Задний", "Артқы"), op("all", "Полный", "Толық")]),
  number("engine_volume", "Объём двигателя", "Қозғалтқыш көлемі", "л", "л", { validation: { min: 0.1, max: 20, step: 0.1 } }),
  select("steering", "Руль", "Руль", [op("left", "Слева", "Сол жақта"), op("right", "Справа", "Оң жақта")]),
  select("color", "Цвет", "Түсі", [op("black", "Чёрный", "Қара"), op("white", "Белый", "Ақ"), op("silver", "Серебристый", "Күміс"), op("gray", "Серый", "Сұр"), op("blue", "Синий", "Көк"), op("red", "Красный", "Қызыл"), op("green", "Зелёный", "Жасыл"), op("beige", "Бежевый", "Сарғыш"), op("brown", "Коричневый", "Қоңыр"), op("other", "Другой", "Басқа")]),
  select("condition", "Состояние автомобиля", "Автомобиль күйі", [op("new", "Новое", "Жаңа"), op("like-new", "Как новое", "Жаңа сияқты"), op("used", "С пробегом", "Жүрілген"), op("repair", "Требует ремонта", "Жөндеуді қажет етеді")], { required: true }),
];

const passengerCarExchangeProfile = (): SeedAttributeDefinition[] =>
  passengerCarProfile().flatMap((attribute) => {
    if (attribute.key === "brand") return [BRAND_TEXT];
    if (attribute.key === "model") return [MODEL_TEXT];
    if (attribute.key === "model_other") return [];
    if (attribute.key === "condition") return [CONDITION];
    return [attribute];
  });

const COMMERCIAL_PROPERTY_BASE: SeedAttributeDefinition[] = [
  select("commercial_type", "Тип объекта", "Нысан түрі", [
    op("office", "Офис", "Кеңсе"), op("retail", "Магазин", "Дүкен"), op("warehouse", "Склад", "Қойма"),
    op("production", "Производство", "Өндіріс"), op("catering", "Общепит", "Қоғамдық тамақтану"),
    op("free", "Свободного назначения", "Еркін мақсаттағы"),
  ], { required: true }),
  number("total_area", "Площадь", "Ауданы", "м²", "м²", { required: true }),
  number("floor", "Этаж", "Қабат"),
  bool("separate_entrance", "Отдельный вход", "Жеке кіреберіс"),
  select("renovation", "Состояние", "Күйі", [
    op("rough", "Без отделки", "Әрлеусіз"), op("good", "Хорошее", "Жақсы"), op("excellent", "Отличное", "Өте жақсы"),
  ]),
  bool("parking", "Парковка", "Тұрақ бар"),
];

const profiles = {
  productCore: PRODUCT_CORE,
  goods: PRODUCT_CORE,
  goodsBrand: [BRAND_TEXT, MODEL_TEXT, ...PRODUCT_CORE, WARRANTY],
  consumableLot: CONSUMABLE_LOT,
  deviceSpecs: DEVICE_SPECS,
  tabletDeviceSpecs: TABLET_DEVICE_SPECS,
  vehicleCompliance: VEHICLE_COMPLIANCE,
  propertyDocsUtilities: PROPERTY_DOCS_UTILITIES,
  houseRenovationCompatible: [
    select("renovation", "Состояние / ремонт", "Күйі / жөндеуі", [
      op("none", "Без ремонта", "Жөндеусіз"),
      op("rough", "Черновая отделка", "Қара сылақ"),
      op("repair", "Требует ремонта", "Жөндеуді қажет етеді"),
      op("cosmetic", "Косметический", "Косметикалық"),
      op("good", "Хорошее", "Жақсы"),
      op("excellent", "Отличное", "Өте жақсы"),
      op("designer", "Дизайнерский", "Дизайнерлік"),
    ]),
  ],
  professionalRequirements: PROFESSIONAL_REQUIREMENTS,
  regulatedSafety: REGULATED_SAFETY,
  passengerCar: passengerCarProfile(),
  passengerCarSedan: passengerCarProfile(passengerVehicleModelsByBody.sedan),
  passengerCarSuv: passengerCarProfile(passengerVehicleModelsByBody.suv),
  passengerCarHatchback: passengerCarProfile(passengerVehicleModelsByBody.hatchback),
  passengerCarLiftback: passengerCarProfile(passengerVehicleModelsByBody.liftback),
  passengerCarWagon: passengerCarProfile(passengerVehicleModelsByBody.wagon),
  passengerCarMinivan: passengerCarProfile(passengerVehicleModelsByBody.minivan),
  passengerCarCoupe: passengerCarProfile(passengerVehicleModelsByBody.coupe),
  passengerCarCabriolet: passengerCarProfile(passengerVehicleModelsByBody.cabriolet),
  passengerCarPickup: passengerCarProfile(passengerVehicleModelsByBody.pickup),
  passengerCarOther: passengerCarProfile(passengerVehicleModelsByBody.other),
  passengerCarExchange: passengerCarExchangeProfile(),
  motorcycle: [
    select("brand", "Марка", "Маркасы", MOTORCYCLE_BRANDS, { required: true }),
    dependentSelect("model", "Модель", "Моделі", "brand", motorcycleModels), OTHER_MODEL, YEAR,
    number("mileage", "Пробег", "Жүрісі", "км", "км", { validation: { min: 0 } }),
    number("engine_volume", "Объём двигателя", "Қозғалтқыш көлемі", "см³", "см³", { validation: { min: 25, max: 3000 } }),
    select("motorcycle_class", "Класс", "Сыныбы", [op("road", "Дорожный", "Жолдық"), op("sport", "Спортивный", "Спорттық"), op("touring", "Туристический", "Туристік"), op("cruiser", "Круизер", "Круизер"), op("enduro", "Эндуро", "Эндуро"), op("cross", "Кроссовый", "Кросс"), op("scooter", "Скутер", "Скутер"), op("atv", "Квадроцикл", "Квадроцикл"), op("snowmobile", "Снегоход", "Қар көлігі")]),
    select("condition", "Состояние", "Күйі", [op("new", "Новое", "Жаңа"), op("used", "С пробегом", "Жүрілген"), op("repair", "Требует ремонта", "Жөндеуді қажет етеді")], { required: true }),
    bool("documents", "Есть документы", "Құжаттары бар"),
  ],
  motorcycleExchange: [
    BRAND_TEXT, MODEL_TEXT, YEAR,
    number("mileage", "Пробег", "Жүрісі", "км", "км", { validation: { min: 0 } }),
    number("engine_volume", "Объём двигателя", "Қозғалтқыш көлемі", "см³", "см³", { validation: { min: 25, max: 3000 } }),
    select("motorcycle_class", "Класс", "Сыныбы", [op("road", "Дорожный", "Жолдық"), op("sport", "Спортивный", "Спорттық"), op("touring", "Туристический", "Туристік"), op("cruiser", "Круизер", "Круизер"), op("enduro", "Эндуро", "Эндуро"), op("cross", "Кроссовый", "Кросс"), op("scooter", "Скутер", "Скутер"), op("atv", "Квадроцикл", "Квадроцикл"), op("snowmobile", "Снегоход", "Қар көлігі")]),
    CONDITION, bool("documents", "Есть документы", "Құжаттары бар"),
  ],
  commercialVehicle: [BRAND_TEXT, MODEL_TEXT, YEAR, number("mileage", "Пробег", "Жүрісі", "км", "км"), select("fuel", "Топливо", "Отын", [op("diesel", "Дизель", "Дизель"), op("petrol", "Бензин", "Бензин"), op("gas", "Газ", "Газ"), op("electric", "Электро", "Электр")]), select("transmission", "Коробка передач", "Беріліс қорабы", [op("manual", "Механика", "Механика"), op("automatic", "Автомат", "Автомат"), op("robot", "Робот", "Робот")]), number("payload", "Грузоподъёмность", "Жүк көтерімділігі", "кг", "кг"), CONDITION],
  passengerCommercial: [number("seats", "Количество мест", "Орын саны", "мест", "орын", { validation: { min: 2, max: 100 } })],
  trailer: [select("trailer_type", "Тип прицепа", "Тіркеме түрі", [op("flatbed", "Бортовой", "Бортты"), op("curtain", "Тентованный", "Тентті"), op("refrigerator", "Рефрижератор", "Рефрижератор"), op("tipper", "Самосвальный", "Өзі түсіретін"), op("tank", "Цистерна", "Цистерна"), op("car", "Легковой", "Жеңіл көлікке"), op("other", "Другой", "Басқа")], { required: true }), YEAR, number("payload", "Грузоподъёмность", "Жүк көтерімділігі", "кг", "кг"), number("axles", "Количество осей", "Ось саны"), CONDITION],
  machinery: [select("machinery_type", "Тип техники", "Техника түрі", [op("excavator", "Экскаватор", "Экскаватор"), op("loader", "Погрузчик", "Тиегіш"), op("crane", "Кран", "Кран"), op("bulldozer", "Бульдозер", "Бульдозер"), op("grader", "Грейдер", "Грейдер"), op("tractor", "Трактор", "Трактор"), op("combine", "Комбайн", "Комбайн"), op("other", "Другая", "Басқа")]), BRAND_TEXT, MODEL_TEXT, YEAR, number("engine_hours", "Моточасы", "Мотосағат", "ч", "сағ"), number("power", "Мощность", "Қуаты", "л.с.", "а.к."), number("operating_weight", "Рабочая масса", "Жұмыс салмағы", "кг", "кг"), CONDITION],
  transportSimple: [BRAND_TEXT, MODEL_TEXT, YEAR, CONDITION],
  watercraft: [BRAND_TEXT, MODEL_TEXT, YEAR, number("length", "Длина", "Ұзындығы", "м", "м"), number("engine_power", "Мощность двигателя", "Қозғалтқыш қуаты", "л.с.", "а.к."), select("hull_material", "Материал корпуса", "Корпус материалы", [op("inflatable", "ПВХ / надувной", "ПВХ / үрлемелі"), op("aluminum", "Алюминий", "Алюминий"), op("fiberglass", "Стеклопластик", "Шыныпластик"), op("steel", "Сталь", "Болат"), op("wood", "Дерево", "Ағаш")]), CONDITION],
  aircraft: [BRAND_TEXT, MODEL_TEXT, YEAR, number("flight_hours", "Налёт", "Ұшу сағаттары", "ч", "сағ"), number("seats", "Количество мест", "Орын саны"), bool("airworthiness", "Есть документы лётной годности", "Ұшуға жарамдылық құжаттары бар"), CONDITION],
  electricPersonalTransport: [BRAND_TEXT, MODEL_TEXT, number("motor_power", "Мощность", "Қуаты", "Вт", "Вт"), number("range", "Запас хода", "Жүріс қоры", "км", "км"), number("max_speed", "Максимальная скорость", "Ең жоғары жылдамдық", "км/ч", "км/сағ"), CONDITION],

  autoPart: [select("part_type", "Тип детали", "Бөлшек түрі", [op("original", "Оригинальная", "Түпнұсқа"), op("analogue", "Аналог", "Баламасы"), op("used-original", "Оригинальная Б/у", "Қолданылған түпнұсқа")], { required: true }), BRAND_TEXT, text("part_number", "OEM / артикул", "OEM / артикул", { searchable: true }), select("compatible_brand", "Совместимая марка", "Үйлесімді марка", PASSENGER_BRANDS), dependentSelect("compatible_model", "Совместимая модель", "Үйлесімді модель", "compatible_brand", passengerVehicleModels, false), OTHER_COMPATIBLE_MODEL, select("position", "Сторона / позиция", "Жағы / орны", [op("front", "Передняя", "Алдыңғы"), op("rear", "Задняя", "Артқы"), op("left", "Левая", "Сол"), op("right", "Правая", "Оң"), op("universal", "Универсальная", "Әмбебап")]), CONDITION],
  motoPart: [
    select("part_type", "Тип детали", "Бөлшек түрі", [op("original", "Оригинальная", "Түпнұсқа"), op("analogue", "Аналог", "Баламасы"), op("used-original", "Оригинальная Б/у", "Қолданылған түпнұсқа")], { required: true }),
    BRAND_TEXT, text("part_number", "OEM / артикул", "OEM / артикул", { searchable: true }),
    text("compatible_make_text", "Марка мотоцикла", "Мотоцикл маркасы", { filterable: true, searchable: true, filterMode: "search" }),
    text("compatible_model_text", "Модель мотоцикла", "Мотоцикл моделі", { filterable: true, searchable: true, filterMode: "search" }),
    select("position", "Сторона / позиция", "Жағы / орны", [op("front", "Передняя", "Алдыңғы"), op("rear", "Задняя", "Артқы"), op("left", "Левая", "Сол"), op("right", "Правая", "Оң"), op("universal", "Универсальная", "Әмбебап")]), CONDITION,
  ],
  commercialPart: [
    select("part_type", "Тип детали", "Бөлшек түрі", [op("original", "Оригинальная", "Түпнұсқа"), op("analogue", "Аналог", "Баламасы"), op("used-original", "Оригинальная Б/у", "Қолданылған түпнұсқа")], { required: true }),
    BRAND_TEXT, text("part_number", "OEM / артикул", "OEM / артикул", { searchable: true }),
    select("compatible_vehicle_type", "Тип техники", "Техника түрі", [op("truck", "Грузовик", "Жүк көлігі"), op("bus", "Автобус", "Автобус"), op("construction", "Спецтехника", "Арнайы техника"), op("agricultural", "Сельхозтехника", "Ауыл шаруашылық техникасы"), op("trailer", "Прицеп", "Тіркеме")]),
    text("compatible_make_text", "Совместимая марка", "Үйлесімді марка", { filterable: true, searchable: true, filterMode: "search" }),
    text("compatible_model_text", "Совместимая модель", "Үйлесімді модель", { filterable: true, searchable: true, filterMode: "search" }), CONDITION,
  ],
  dismantling: [
    select("vehicle_type", "Тип транспорта", "Көлік түрі", [op("car", "Легковой", "Жеңіл көлік"), op("moto", "Мототранспорт", "Мотокөлік"), op("commercial", "Коммерческий", "Коммерциялық"), op("special", "Спецтехника", "Арнайы техника")], { required: true }),
    BRAND_TEXT, MODEL_TEXT, YEAR, text("engine", "Двигатель", "Қозғалтқыш", { searchable: true }),
    text("available_parts", "Доступные узлы и детали", "Қолжетімді тораптар мен бөлшектер", { searchable: true, required: true, validation: { maxLength: 800 } }),
    bool("documents", "Документы на автомобиль", "Автомобиль құжаттары"),
  ],
  tires: [select("product_type", "Тип", "Түрі", [op("tire", "Шины", "Шина"), op("wheel", "Диски", "Диск"), op("set", "Колёса в сборе", "Жинақталған дөңгелек")], { required: true }), select("season", "Сезон", "Маусым", [op("summer", "Летние", "Жазғы"), op("winter", "Зимние", "Қысқы"), op("all-season", "Всесезонные", "Барлық маусымдық")]), number("tire_width", "Ширина", "Ені", "мм", "мм"), number("tire_profile", "Профиль", "Профиль", "%", "%"), number("diameter", "Диаметр", "Диаметрі", "R", "R"), text("load_index", "Индекс нагрузки", "Жүктеме индексі"), number("quantity", "Количество", "Саны", "шт.", "дана"), BRAND_TEXT, CONDITION],
  wheels: [select("wheel_type", "Тип диска", "Диск түрі", [op("alloy", "Литой", "Құйма"), op("steel", "Штампованный", "Штампталған"), op("forged", "Кованый", "Соғылған")], { required: true }), number("diameter", "Диаметр", "Диаметрі", "R", "R"), number("width", "Ширина", "Ені", "J", "J"), text("bolt_pattern", "Разболтовка", "Болт үлгісі", { filterable: true, filterMode: "search" }), number("offset", "Вылет", "Шығуы", "ET", "ET"), BRAND_TEXT, CONDITION],
  fluids: [select("product_type", "Тип продукта", "Өнім түрі", [op("engine-oil", "Моторное масло", "Мотор майы"), op("transmission-oil", "Трансмиссионное масло", "Трансмиссия майы"), op("antifreeze", "Антифриз", "Антифриз"), op("brake-fluid", "Тормозная жидкость", "Тежегіш сұйықтығы"), op("other", "Другое", "Басқа")], { required: true }), BRAND_TEXT, text("viscosity", "Вязкость", "Тұтқырлығы", { filterable: true, filterMode: "search" }), number("volume", "Объём", "Көлемі", "л", "л"), text("approval", "Допуски / назначение", "Рұқсаттары / мақсаты", { searchable: true })],

  flatSale: [select("rooms", "Количество комнат", "Бөлме саны", [op("studio", "Студия", "Студия"), op("1", "1", "1"), op("2", "2", "2"), op("3", "3", "3"), op("4", "4", "4"), op("5+", "5 и больше", "5 және одан көп")], { required: true }), number("total_area", "Общая площадь", "Жалпы ауданы", "м²", "м²", { required: true }), number("living_area", "Жилая площадь", "Тұрғын ауданы", "м²", "м²"), number("kitchen_area", "Площадь кухни", "Асүй ауданы", "м²", "м²"), number("floor", "Этаж", "Қабат", undefined, undefined, { required: true }), number("floors_total", "Этажность дома", "Үй қабаттылығы"), YEAR, select("building_type", "Тип дома", "Үй түрі", [op("brick", "Кирпичный", "Кірпіш"), op("panel", "Панельный", "Панельді"), op("monolith", "Монолитный", "Монолитті"), op("other", "Другой", "Басқа")]), select("renovation", "Ремонт", "Жөндеу", [op("none", "Без ремонта", "Жөндеусіз"), op("cosmetic", "Косметический", "Косметикалық"), op("good", "Хороший", "Жақсы"), op("designer", "Дизайнерский", "Дизайнерлік")]), select("bathroom", "Санузел", "Санитарлық торап", [op("combined", "Совмещённый", "Біріктірілген"), op("separate", "Раздельный", "Бөлек"), op("multiple", "Два и больше", "Екі және одан көп")]), select("balcony", "Балкон / лоджия", "Балкон / лоджия", [op("none", "Нет", "Жоқ"), op("balcony", "Балкон", "Балкон"), op("loggia", "Лоджия", "Лоджия"), op("both", "Балкон и лоджия", "Балкон және лоджия")]), select("market", "Рынок жилья", "Тұрғын үй нарығы", [op("new", "Новостройка", "Жаңа құрылыс"), op("secondary", "Вторичное жильё", "Қайталама тұрғын үй")]), bool("mortgage", "Подходит под ипотеку", "Ипотекаға жарайды")],
  rentTerms: [select("rental_period", "Срок аренды", "Жалдау мерзімі", [op("monthly", "Помесячно", "Ай сайын"), op("long", "Долгосрочно", "Ұзақ мерзімге")]), number("deposit", "Залог", "Кепілақы", "₸", "₸"), select("utilities", "Коммунальные услуги", "Коммуналдық төлемдер", [op("included", "Включены", "Кірістірілген"), op("separate", "Оплачиваются отдельно", "Бөлек төленеді"), op("partial", "Частично включены", "Ішінара кірістірілген")]), bool("furnished", "С мебелью", "Жиһазбен"), bool("appliances", "С бытовой техникой", "Тұрмыстық техникамен"), bool("children_allowed", "Можно с детьми", "Балалармен болады"), bool("pets_allowed", "Можно с животными", "Жануарлармен болады")],
  dailyTerms: [number("guests", "Количество гостей", "Қонақ саны"), select("sleeping_places", "Спальных мест", "Жатын орын", [op("1", "1", "1"), op("2", "2", "2"), op("3", "3", "3"), op("4", "4", "4"), op("5+", "5 и больше", "5 және одан көп")]), bool("instant_booking", "Мгновенное бронирование", "Жедел брондау"), bool("documents", "Отчётные документы", "Есептік құжаттар")],
  house: [number("house_area", "Площадь дома", "Үй ауданы", "м²", "м²", { required: true }), number("land_area", "Площадь участка", "Жер телімінің ауданы", "сот.", "сот."), number("floors_total", "Этажность", "Қабат саны"), select("wall_material", "Материал стен", "Қабырға материалы", [op("brick", "Кирпич", "Кірпіш"), op("block", "Газоблок / пеноблок", "Газоблок / пеноблок"), op("wood", "Дерево", "Ағаш"), op("panel", "Панель", "Панель"), op("other", "Другой", "Басқа")]), YEAR, select("renovation", "Состояние / ремонт", "Күйі / жөндеуі", [op("rough", "Черновая отделка", "Қара сылақ"), op("repair", "Требует ремонта", "Жөндеуді қажет етеді"), op("good", "Хорошее", "Жақсы"), op("excellent", "Отличное", "Өте жақсы")]), select("heating", "Отопление", "Жылыту", [op("central", "Центральное", "Орталық"), op("gas", "Газовое", "Газбен"), op("solid", "Твёрдое топливо", "Қатты отын"), op("electric", "Электрическое", "Электрлік")]), bool("water", "Вода", "Су бар"), bool("sewerage", "Канализация", "Кәріз бар"), bool("gas", "Газ", "Газ бар"), bool("garage", "Гараж", "Гараж бар")],
  room: [number("room_area", "Площадь комнаты", "Бөлме ауданы", "м²", "м²", { required: true }), number("rooms_total", "Комнат в квартире / доме", "Пәтердегі / үйдегі бөлме саны"), number("floor", "Этаж", "Қабат"), bool("furnished", "С мебелью", "Жиһазбен"), select("renovation", "Состояние", "Күйі", [op("repair", "Требует ремонта", "Жөндеуді қажет етеді"), op("good", "Хорошее", "Жақсы"), op("excellent", "Отличное", "Өте жақсы")])],
  land: [number("land_area", "Площадь участка", "Жер телімінің ауданы", "сот.", "сот.", { required: true }), select("land_purpose", "Назначение", "Мақсаты", [op("housing", "ИЖС", "Жеке тұрғын үй"), op("farm", "Крестьянское хозяйство", "Шаруа қожалығы"), op("garden", "Садоводство", "Бағбандық"), op("commercial", "Коммерческое", "Коммерциялық"), op("other", "Другое", "Басқа")], { required: true }), bool("electricity", "Электричество", "Электр бар"), bool("water", "Вода", "Су бар"), bool("gas", "Газ", "Газ бар"), select("access_road", "Подъезд", "Кірме жол", [op("asphalt", "Асфальт", "Асфальт"), op("gravel", "Грунтовая дорога", "Топырақ жол"), op("none", "Нет дороги", "Жол жоқ")])],
  commercialProperty: [...COMMERCIAL_PROPERTY_BASE, bool("utilities", "Коммуникации", "Коммуникациялар бар")],
  commercialRentalProperty: [...COMMERCIAL_PROPERTY_BASE, bool("utilities_connected", "Коммуникации подключены", "Коммуникациялар қосылған")],
  garage: [select("garage_type", "Тип", "Түрі", [op("garage", "Гараж", "Гараж"), op("parking", "Парковочное место", "Тұрақ орны"), op("box", "Бокс", "Бокс")], { required: true }), number("total_area", "Площадь", "Ауданы", "м²", "м²"), select("material", "Материал", "Материалы", [op("brick", "Кирпич", "Кірпіш"), op("metal", "Металл", "Металл"), op("concrete", "Бетон", "Бетон")]), bool("electricity", "Электричество", "Электр бар"), bool("pit", "Смотровая яма", "Қарау шұңқыры бар")],

  job: [number("salary_from", "Зарплата от", "Жалақы, бастап", "₸", "₸"), number("salary_to", "Зарплата до", "Жалақы, дейін", "₸", "₸"), select("pay_period", "Период оплаты", "Төлем кезеңі", [op("month", "В месяц", "Айына"), op("week", "В неделю", "Аптасына"), op("shift", "За смену", "Ауысымға"), op("hour", "За час", "Сағатына")], { required: true }), select("employment", "Тип занятости", "Жұмыс түрі", [op("full", "Полная", "Толық"), op("part", "Частичная", "Ішінара"), op("temporary", "Временная", "Уақытша"), op("internship", "Стажировка", "Тағылымдама")], { required: true }), select("schedule", "График", "Кесте", [op("5-2", "5/2", "5/2"), op("2-2", "2/2", "2/2"), op("shift", "Сменный", "Ауысымды"), op("rotation", "Вахта", "Вахта"), op("flexible", "Гибкий", "Икемді")]), select("experience", "Опыт", "Тәжірибе", [op("none", "Без опыта", "Тәжірибесіз"), op("1", "От 1 года", "1 жылдан"), op("3", "От 3 лет", "3 жылдан"), op("6", "От 6 лет", "6 жылдан")]), select("education", "Образование", "Білімі", [op("none", "Не требуется", "Қажет емес"), op("secondary", "Среднее", "Орта"), op("vocational", "Среднее специальное", "Арнаулы орта"), op("higher", "Высшее", "Жоғары")]), select("work_format", "Формат работы", "Жұмыс форматы", [op("onsite", "На месте", "Орнында"), op("remote", "Удалённо", "Қашықтан"), op("hybrid", "Гибридный", "Аралас")]), bool("accommodation", "Предоставляется проживание", "Тұратын орын беріледі")],

  serviceProfessional: [
    select("provider_type", "Исполнитель", "Орындаушы", [op("private", "Частный специалист", "Жеке маман"), op("ip", "ИП", "ЖК"), op("company", "ТОО / компания", "ЖШС / компания")], { required: true }),
    bool("contract_available", "Работа по договору", "Шарт бойынша жұмыс"),
    bool("documents_available", "Чеки / закрывающие документы", "Чек / жабу құжаттары"),
    text("licenses_certificates", "Лицензии и сертификаты", "Лицензиялар мен сертификаттар", { searchable: true, validation: { maxLength: 300 } }),
    select("payment_method", "Оплата", "Төлем", [op("cash", "Наличными", "Қолма-қол"), op("cashless", "Безналичная", "Қолма-қолсыз"), op("both", "Оба варианта", "Екі нұсқа")]),
    text("service_area", "Район / зона выезда", "Аудан / шығу аймағы", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 160 } }),
  ],
  serviceBase: [select("price_type", "Тип цены", "Баға түрі", [op("fixed", "Фиксированная", "Тұрақты"), op("from", "От указанной суммы", "Көрсетілген сомадан"), op("hour", "За час", "Сағатына"), op("agreement", "Договорная", "Келісімді")], { required: true }), select("service_format", "Формат", "Формат", [op("onsite", "На месте", "Орнында"), op("online", "Онлайн", "Онлайн"), op("both", "Онлайн и на месте", "Онлайн және орнында")]), bool("visit", "Выезд к клиенту", "Клиентке бару"), number("experience_years", "Опыт", "Тәжірибе", "лет", "жыл"), bool("urgent", "Срочный выезд", "Шұғыл бару"), select("service_guarantee", "Гарантия", "Кепілдік", [op("none", "Нет", "Жоқ"), op("up-to-month", "До месяца", "Бір айға дейін"), op("1-6-months", "1–6 месяцев", "1–6 ай"), op("6-12-months", "6–12 месяцев", "6–12 ай"), op("year-plus", "Год и больше", "Бір жыл және одан көп")])],
  repairService: [select("work_type", "Вид работ", "Жұмыс түрі", [op("consultation", "Консультация", "Кеңес"), op("diagnostics", "Диагностика", "Диагностика"), op("installation", "Монтаж", "Монтаж"), op("repair", "Ремонт", "Жөндеу"), op("turnkey", "Под ключ", "Толық аяқтау")]), select("object_type", "Тип объекта", "Нысан түрі", [op("flat", "Квартира", "Пәтер"), op("house", "Дом", "Үй"), op("office", "Офис", "Кеңсе"), op("commercial", "Коммерческое помещение", "Коммерциялық орын")]), bool("measurement", "Бесплатный замер", "Тегін өлшеу"), select("materials", "Материалы", "Материалдар", [op("customer", "Заказчика", "Тапсырыс берушінікі"), op("provider", "Исполнителя", "Орындаушыныкі"), op("both", "Оба варианта", "Екі нұсқа")])],
  transportService: [select("vehicle_type", "Тип транспорта", "Көлік түрі", [op("car", "Легковой", "Жеңіл"), op("van", "Фургон", "Фургон"), op("truck", "Грузовой", "Жүк көлігі"), op("special", "Спецтранспорт", "Арнайы көлік")]), number("payload", "Грузоподъёмность", "Жүк көтерімділігі", "кг", "кг"), number("loaders", "Количество грузчиков", "Жүк тиеушілер саны"), bool("intercity", "Межгород", "Қалааралық"), select("billing", "Расчёт", "Есептеу", [op("hour", "Почасовой", "Сағаттық"), op("fixed", "Фиксированный", "Тұрақты"), op("distance", "За километр", "Километрге")])],
  educationService: [text("subject", "Предмет / направление", "Пән / бағыт", { filterable: true, searchable: true, filterMode: "search", required: true }), select("student_level", "Уровень", "Деңгей", [op("preschool", "Дошкольный", "Мектепке дейінгі"), op("school", "Школьный", "Мектеп"), op("exam", "Экзамены", "Емтихандар"), op("university", "Вуз", "ЖОО"), op("adult", "Взрослые", "Ересектер")]), select("lesson_format", "Занятия", "Сабақ", [op("individual", "Индивидуально", "Жеке"), op("group", "В группе", "Топта")]), select("billing", "Цена", "Баға", [op("hour", "За час", "Сағатына"), op("lesson", "За занятие", "Сабаққа"), op("course", "За курс", "Курсқа")])],
  beautyService: [select("workplace", "Где оказываете", "Қызмет орны", [op("salon", "В салоне", "Салонда"), op("home", "У мастера", "Шеберде"), op("visit", "С выездом", "Барып қызмет көрсету")])],
  professionalService: [select("client_type", "Для кого", "Кімге", [op("individual", "Физлица", "Жеке тұлғалар"), op("business", "Бизнес", "Бизнес"), op("both", "Для всех", "Барлығына")]), select("engagement", "Формат работы", "Жұмыс форматы", [op("consultation", "Консультация", "Кеңес"), op("document", "Подготовка документов", "Құжат дайындау"), op("full", "Полное сопровождение", "Толық сүйемелдеу")])],
  cleaningService: [select("object_type", "Тип объекта", "Нысан түрі", [op("flat", "Квартира", "Пәтер"), op("house", "Дом", "Үй"), op("office", "Офис", "Кеңсе"), op("commercial", "Коммерческое помещение", "Коммерциялық орын")]), number("area", "Площадь", "Ауданы", "м²", "м²")],
  propertyService: [select("object_type", "Тип объекта", "Нысан түрі", [op("flat", "Квартира", "Пәтер"), op("house", "Дом", "Үй"), op("office", "Офис", "Кеңсе"), op("commercial", "Коммерческий объект", "Коммерциялық нысан"), op("industrial", "Промышленный объект", "Өнеркәсіптік нысан")]), number("object_area", "Площадь объекта", "Нысан ауданы", "м²", "м²"), bool("materials_included", "Материалы включены", "Материалдар кіреді")],
  plumbingService: [select("object_type", "Объект", "Нысан", [op("flat", "Квартира", "Пәтер"), op("house", "Дом", "Үй"), op("commercial", "Коммерческий", "Коммерциялық")]), bool("emergency_call", "Аварийный выезд", "Апаттық шақыру"), bool("parts_available", "Запчасти и материалы в наличии", "Қосалқы бөлшектер мен материалдар бар")],
  electricalService: [select("object_type", "Объект", "Нысан", [op("flat", "Квартира", "Пәтер"), op("house", "Дом", "Үй"), op("commercial", "Коммерческий", "Коммерциялық"), op("industrial", "Промышленный", "Өнеркәсіптік")]), select("network_voltage", "Сеть", "Желі", [op("220", "220 В", "220 В"), op("380", "380 В", "380 В"), op("low-voltage", "Слаботочная", "Әлсіз ток")]), bool("licensed", "Есть допуск / лицензия", "Рұқсаты / лицензиясы бар")],
  hvacService: [select("equipment_scope", "Тип оборудования", "Жабдық түрі", [op("domestic", "Бытовое", "Тұрмыстық"), op("commercial", "Коммерческое", "Коммерциялық"), op("industrial", "Промышленное", "Өнеркәсіптік")]), number("equipment_count", "Количество единиц", "Жабдық саны"), bool("refrigerant_available", "Хладагент в наличии", "Салқындатқыш зат бар")],
  householdService: [select("provider_type", "Исполнитель", "Орындаушы", [op("private", "Частный мастер", "Жеке шебер"), op("company", "Компания", "Компания")]), bool("same_day", "Возможно в день заказа", "Тапсырыс күні мүмкін")],
  applianceRepairService: [BRAND_TEXT, MODEL_TEXT, bool("at_customer", "Ремонт у клиента", "Клиентте жөндеу"), bool("parts_available", "Запчасти в наличии", "Қосалқы бөлшектер бар")],
  deviceRepairService: [BRAND_TEXT, MODEL_TEXT, bool("data_recovery", "Сохранение / восстановление данных", "Деректерді сақтау / қалпына келтіру"), bool("parts_available", "Запчасти в наличии", "Қосалқы бөлшектер бар")],
  autoService: [select("vehicle_scope", "Транспорт", "Көлік", [op("passenger", "Легковой", "Жеңіл"), op("commercial", "Коммерческий", "Коммерциялық"), op("motorcycle", "Мототехника", "Мототехника"), op("special", "Спецтехника", "Арнайы техника")]), select("compatible_brand", "Марка авто", "Көлік маркасы", PASSENGER_BRANDS), bool("mobile_service", "Выездной сервис", "Жылжымалы сервис"), bool("parts_available", "Запчасти в наличии", "Қосалқы бөлшектер бар")],
  wellnessService: [select("audience", "Для кого", "Кімге", [op("women", "Женщины", "Әйелдер"), op("men", "Мужчины", "Ерлер"), op("children", "Дети", "Балалар"), op("all", "Все", "Барлығы")]), bool("certified", "Есть профильное образование / сертификат", "Бейінді білімі / сертификаты бар")],
  itService: [select("service_platform", "Платформа", "Платформа", [op("web", "Web", "Web"), op("mobile", "iOS / Android", "iOS / Android"), op("desktop", "Desktop", "Desktop"), op("cloud", "Cloud / DevOps", "Cloud / DevOps"), op("mixed", "Несколько", "Бірнеше")]), bool("remote_available", "Удалённая работа", "Қашықтан жұмыс"), bool("contract_available", "Работа по договору", "Келісімшартпен жұмыс")],
  photoVideoService: [select("production_format", "Формат", "Формат", [op("studio", "В студии", "Студияда"), op("location", "На локации", "Локацияда"), op("both", "Оба", "Екеуі де")]), number("duration_hours", "Минимальная длительность", "Ең аз ұзақтық", "ч", "сағ"), bool("equipment_included", "Оборудование включено", "Жабдық кіреді")],
  legalService: [select("client_type", "Клиент", "Клиент", [op("individual", "Физлицо", "Жеке тұлға"), op("business", "Бизнес", "Бизнес"), op("both", "Все", "Барлығы")]), select("legal_format", "Формат помощи", "Көмек форматы", [op("consultation", "Консультация", "Кеңес"), op("documents", "Документы", "Құжаттар"), op("representation", "Представительство", "Өкілдік"), op("full", "Сопровождение", "Сүйемелдеу")]), bool("licensed", "Есть лицензия / статус", "Лицензиясы / мәртебесі бар")],
  accountingService: [select("client_type", "Клиент", "Клиент", [op("ip", "ИП", "ЖК"), op("too", "ТОО", "ЖШС"), op("ngo", "НКО", "КЕҰ"), op("individual", "Физлицо", "Жеке тұлға")]), select("tax_regime", "Налоговый режим", "Салық режимі", [op("simplified", "Упрощённый", "Жеңілдетілген"), op("general", "Общеустановленный", "Жалпыға белгіленген"), op("retail", "Розничный налог", "Бөлшек салық"), op("unknown", "Не определён", "Анықталмаған")]), bool("licensed", "Есть профессиональная сертификация", "Кәсіби сертификациясы бар")],
  eventService: [number("guest_count", "Количество гостей", "Қонақ саны"), select("venue_type", "Площадка", "Алаң", [op("indoor", "В помещении", "Жабық жерде"), op("outdoor", "На улице", "Далада"), op("both", "Любая", "Кез келген")]), bool("equipment_included", "Оборудование включено", "Жабдық кіреді")],
  securityService: [select("protected_object", "Объект охраны", "Қорғалатын нысан", [op("home", "Жильё", "Тұрғын үй"), op("office", "Офис", "Кеңсе"), op("retail", "Торговый объект", "Сауда нысаны"), op("industrial", "Промышленный", "Өнеркәсіптік"), op("event", "Мероприятие", "Іс-шара")]), bool("licensed", "Есть лицензия", "Лицензиясы бар"), bool("rapid_response", "Группа быстрого реагирования", "Жедел әрекет ету тобы")],
  petService: [select("animal_scope", "Животное", "Жануар", [op("dogs", "Собаки", "Иттер"), op("cats", "Кошки", "Мысықтар"), op("birds", "Птицы", "Құстар"), op("small", "Мелкие животные", "Ұсақ жануарлар"), op("farm", "Сельхозживотные", "Ауыл шаруашылығы жануарлары")]), bool("home_visit", "Выезд на дом", "Үйге бару"), bool("certified", "Есть профильное образование", "Бейінді білімі бар")],
  furnitureService: [select("material_scope", "Материал", "Материал", [op("wood", "Массив", "Тұтас ағаш"), op("panel", "ЛДСП / МДФ", "ЛДСП / МДФ"), op("metal", "Металл", "Металл"), op("upholstery", "Мягкая мебель", "Жұмсақ жиһаз"), op("mixed", "Комбинированный", "Аралас")]), bool("measurement", "Замер", "Өлшеу"), bool("design_project", "Дизайн-проект", "Дизайн-жоба")],
  agroService: [select("customer_type", "Заказчик", "Тапсырыс беруші", [op("household", "Личное хозяйство", "Жеке шаруашылық"), op("farm", "Ферма / КХ", "Ферма / ШҚ"), op("business", "Предприятие", "Кәсіпорын")]), number("area_hectares", "Площадь", "Ауданы", "га", "га"), bool("machinery_included", "Техника исполнителя", "Орындаушы техникасы")],
  businessService: [select("client_type", "Клиент", "Клиент", [op("startup", "Стартап", "Стартап"), op("sme", "Малый и средний бизнес", "Шағын және орта бизнес"), op("enterprise", "Крупная компания", "Ірі компания"), op("individual", "Частное лицо", "Жеке тұлға")]), bool("contract_available", "Работа по договору", "Келісімшартпен жұмыс"), bool("vat", "Работа с НДС", "ҚҚС-пен жұмыс")],
  travelService: [text("destination", "Страна / направление", "Ел / бағыт", { filterable: true, searchable: true, filterMode: "search" }), select("customer_scope", "Клиенты", "Клиенттер", [op("individual", "Один человек", "Бір адам"), op("family", "Семья", "Отбасы"), op("group", "Группа", "Топ"), op("business", "Бизнес", "Бизнес")]), bool("document_support", "Сопровождение документов", "Құжаттарды сүйемелдеу")],

  smartphone: [select("brand", "Бренд", "Бренд", SMARTPHONE_BRANDS, { required: true }), dependentSelect("model", "Модель", "Модель", "brand", smartphoneModels), OTHER_MODEL, select("storage", "Память", "Жад", [op("32", "32 ГБ", "32 ГБ"), op("64", "64 ГБ", "64 ГБ"), op("128", "128 ГБ", "128 ГБ"), op("256", "256 ГБ", "256 ГБ"), op("512", "512 ГБ", "512 ГБ"), op("1024", "1 ТБ", "1 ТБ")]), select("ram", "Оперативная память", "Жедел жад", [op("4", "4 ГБ", "4 ГБ"), op("6", "6 ГБ", "6 ГБ"), op("8", "8 ГБ", "8 ГБ"), op("12", "12 ГБ", "12 ГБ"), op("16", "16 ГБ и больше", "16 ГБ және көп")]), select("sim", "SIM / eSIM", "SIM / eSIM", [op("single", "1 SIM", "1 SIM"), op("dual", "2 SIM", "2 SIM"), op("esim", "eSIM", "eSIM"), op("dual-esim", "SIM + eSIM", "SIM + eSIM")]), select("color", "Цвет", "Түсі", [op("black", "Чёрный", "Қара"), op("white", "Белый", "Ақ"), op("blue", "Синий", "Көк"), op("green", "Зелёный", "Жасыл"), op("gold", "Золотистый", "Алтын"), op("other", "Другой", "Басқа")]), CONDITION, select("package", "Комплект", "Жинақ", [op("phone", "Только устройство", "Тек құрылғы"), op("box", "С коробкой", "Қорабымен"), op("full", "Полный комплект", "Толық жинақ")]), WARRANTY],
  smartWatch: [
    select("wearable_type", "Тип устройства", "Құрылғы түрі", [op("smart-watch", "Смарт-часы", "Смарт-сағат"), op("fitness-band", "Фитнес-браслет", "Фитнес-білезік")], { required: true }),
    select("brand", "Бренд", "Бренд", WATCH_BRANDS, { required: true }),
    text("watch_model", "Модель", "Модель", { required: true, filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 120 } }),
    number("case_size", "Размер корпуса", "Корпус өлшемі", "мм", "мм", { validation: { min: 15, max: 80 } }),
    select("compatible_os", "Совместимая ОС", "Үйлесімді ОЖ", [op("android", "Android", "Android"), op("ios", "iOS", "iOS"), op("both", "Android и iOS", "Android және iOS"), op("standalone", "Работают автономно", "Дербес жұмыс істейді")]),
    bool("gps", "GPS", "GPS"), bool("nfc", "NFC", "NFC"), bool("cellular", "Поддержка SIM / eSIM", "SIM / eSIM қолдауы"),
    number("battery_life", "Автономность", "Автономдылық", "дней", "күн", { validation: { min: 0.1, max: 365, step: 0.1 } }),
    select("water_resistance", "Водозащита", "Судан қорғау", [op("none", "Нет", "Жоқ"), op("splash", "От брызг", "Шашыраудан"), op("swim", "Для плавания", "Жүзуге"), op("dive", "Для погружения", "Сүңгуге")]),
    select("color", "Цвет", "Түсі", [op("black", "Чёрный", "Қара"), op("white", "Белый", "Ақ"), op("blue", "Синий", "Көк"), op("green", "Зелёный", "Жасыл"), op("gold", "Золотистый", "Алтын"), op("other", "Другой", "Басқа")]),
    CONDITION,
    select("package", "Комплект", "Жинақ", [op("phone", "Только устройство", "Тек құрылғы"), op("box", "С коробкой", "Қорабымен"), op("full", "Полный комплект", "Толық жинақ")]),
    WARRANTY,
    select("repair_history", "История ремонта", "Жөндеу тарихы", [op("none", "Не ремонтировались", "Жөнделмеген"), op("repaired", "Были в ремонте", "Жөндеуде болған"), op("unknown", "Неизвестно", "Белгісіз")]),
  ],
  tablet: [select("brand", "Бренд", "Бренд", tabletBrands, { required: true }), dependentSelect("model", "Модель", "Модель", "brand", tabletModels), OTHER_MODEL, select("storage", "Память", "Жад", [op("32", "32 ГБ", "32 ГБ"), op("64", "64 ГБ", "64 ГБ"), op("128", "128 ГБ", "128 ГБ"), op("256", "256 ГБ", "256 ГБ"), op("512", "512 ГБ", "512 ГБ"), op("1024", "1 ТБ", "1 ТБ")]), number("screen_size", "Диагональ", "Диагональ", "дюйм", "дюйм"), select("connectivity", "Связь", "Байланыс", [op("wifi", "Wi-Fi", "Wi-Fi"), op("cellular", "Wi-Fi + Cellular", "Wi-Fi + Cellular")]), bool("stylus_included", "Стилус в комплекте", "Стилус жинақта"), CONDITION, WARRANTY],
  ereader: [select("brand", "Бренд", "Бренд", ereaderBrands, { required: true }), dependentSelect("model", "Модель", "Модель", "brand", ereaderModels), OTHER_MODEL, number("screen_size", "Диагональ", "Диагональ", "дюйм", "дюйм"), bool("color_screen", "Цветной экран", "Түсті экран"), bool("backlight", "Подсветка", "Артқы жарық"), bool("waterproof", "Защита от воды", "Судан қорғау"), CONDITION],
  computerDeviceSpecs: [
    select("operating_system", "Операционная система", "Операциялық жүйе", [op("windows", "Windows", "Windows"), op("macos", "macOS", "macOS"), op("linux", "Linux", "Linux"), op("chromeos", "ChromeOS", "ChromeOS"), op("none", "Без ОС", "ОЖ жоқ"), op("other", "Другая", "Басқа")]),
    select("screen_resolution", "Разрешение экрана", "Экран ажыратымдылығы", [op("hd", "HD", "HD"), op("full-hd", "Full HD", "Full HD"), op("qhd", "QHD / 2K", "QHD / 2K"), op("4k", "4K", "4K"), op("other", "Другое", "Басқа")]),
    select("keyboard_layout", "Раскладка клавиатуры", "Пернетақта орналасуы", [op("ru", "Русская", "Орысша"), op("en", "Английская", "Ағылшынша"), op("ru-en", "Русская и английская", "Орысша және ағылшынша"), op("other", "Другая", "Басқа")]),
    number("battery_health", "Состояние аккумулятора", "Аккумулятор күйі", "%", "%", { validation: { min: 0, max: 100 } }),
    select("repair_history", "История ремонта", "Жөндеу тарихы", [op("none", "Не ремонтировался", "Жөнделмеген"), op("repaired", "Был в ремонте", "Жөндеуде болған"), op("unknown", "Неизвестно", "Белгісіз")]), WARRANTY,
  ],
  laptop: [BRAND_TEXT, MODEL_TEXT, text("cpu", "Процессор", "Процессор", { filterable: true, searchable: true, filterMode: "search" }), select("ram", "Оперативная память", "Жедел жад", [op("4", "4 ГБ", "4 ГБ"), op("8", "8 ГБ", "8 ГБ"), op("16", "16 ГБ", "16 ГБ"), op("32", "32 ГБ", "32 ГБ"), op("64+", "64 ГБ и больше", "64 ГБ және көп")]), select("storage_type", "Накопитель", "Жинақтауыш", [op("ssd", "SSD", "SSD"), op("hdd", "HDD", "HDD"), op("both", "SSD + HDD", "SSD + HDD")]), number("storage_capacity", "Объём накопителя", "Жинақтауыш көлемі", "ГБ", "ГБ"), text("gpu", "Видеокарта", "Бейне карта", { filterable: true, searchable: true, filterMode: "search" }), number("screen_size", "Диагональ", "Диагональ", "дюйм", "дюйм"), CONDITION],
  computer: [BRAND_TEXT, MODEL_TEXT, text("cpu", "Процессор", "Процессор", { filterable: true, searchable: true, filterMode: "search" }), select("ram", "Оперативная память", "Жедел жад", [op("8", "8 ГБ", "8 ГБ"), op("16", "16 ГБ", "16 ГБ"), op("32", "32 ГБ", "32 ГБ"), op("64+", "64 ГБ и больше", "64 ГБ және көп")]), text("gpu", "Видеокарта", "Бейне карта", { filterable: true, searchable: true, filterMode: "search" }), number("storage_capacity", "Объём накопителя", "Жинақтауыш көлемі", "ГБ", "ГБ"), CONDITION],
  component: [select("component_type", "Тип комплектующего", "Құрамдас бөлік түрі", [op("cpu", "Процессор", "Процессор"), op("gpu", "Видеокарта", "Бейне карта"), op("ram", "Оперативная память", "Жедел жад"), op("motherboard", "Материнская плата", "Аналық тақша"), op("storage", "Накопитель", "Жинақтауыш"), op("psu", "Блок питания", "Қуат көзі"), op("case", "Корпус", "Корпус"), op("cooling", "Охлаждение", "Салқындату")], { required: true }), BRAND_TEXT, MODEL_TEXT, CONDITION],
  display: [BRAND_TEXT, number("screen_size", "Диагональ", "Диагональ", "дюйм", "дюйм"), select("resolution", "Разрешение", "Ажыратымдылық", [op("hd", "HD", "HD"), op("full-hd", "Full HD", "Full HD"), op("2k", "2K / QHD", "2K / QHD"), op("4k", "4K", "4K"), op("8k", "8K", "8K")]), select("panel", "Тип панели", "Панель түрі", [op("ips", "IPS", "IPS"), op("va", "VA", "VA"), op("oled", "OLED", "OLED"), op("qled", "QLED", "QLED"), op("mini-led", "Mini LED", "Mini LED")]), number("refresh_rate", "Частота", "Жиілігі", "Гц", "Гц"), CONDITION],
  projector: [
    BRAND_TEXT, MODEL_TEXT,
    number("screen_size", "Диагональ проекции", "Проекция диагоналі", "дюйм", "дюйм"),
    select("resolution", "Разрешение", "Ажыратымдылық", [op("hd", "HD", "HD"), op("full-hd", "Full HD", "Full HD"), op("2k", "2K / QHD", "2K / QHD"), op("4k", "4K", "4K"), op("8k", "8K", "8K")]),
    select("projector_technology", "Технология проекции", "Проекция технологиясы", [op("lcd", "LCD", "LCD"), op("dlp", "DLP", "DLP"), op("lcos", "LCoS", "LCoS"), op("led", "LED", "LED"), op("laser", "Лазерная", "Лазерлік")]),
    number("refresh_rate", "Частота обновления", "Жаңарту жиілігі", "Гц", "Гц"),
    number("brightness_lumens", "Яркость", "Жарықтығы", "лм", "лм", { validation: { min: 1, max: 200_000 } }),
    number("contrast_ratio", "Контрастность", "Контраст", ":1", ":1", { validation: { min: 1, max: 100_000_000 } }),
    number("lamp_hours", "Наработка источника света", "Жарық көзінің жұмыс уақыты", "ч", "сағ", { validation: { min: 0, max: 1_000_000 } }),
    select("light_source", "Источник света", "Жарық көзі", [op("lamp", "Лампа", "Шам"), op("led", "LED", "LED"), op("laser", "Лазер", "Лазер"), op("hybrid", "Гибридный", "Гибридті")]),
    select("throw_type", "Тип проекции", "Проекция түрі", [op("standard", "Стандартная", "Стандартты"), op("short", "Короткофокусная", "Қысқа фокусты"), op("ultra-short", "Ультракороткофокусная", "Ультра қысқа фокусты")]),
    bool("smart_projector", "Smart-проектор", "Smart-проектор"),
    CONDITION,
  ],
  tv: [bool("smart_tv", "Smart TV", "Smart TV")],
  camera: [BRAND_TEXT, MODEL_TEXT, select("camera_type", "Тип камеры", "Камера түрі", [op("dslr", "Зеркальная", "Айналы"), op("mirrorless", "Беззеркальная", "Айнасыз"), op("compact", "Компактная", "Шағын"), op("instant", "Моментальная", "Жедел")]), text("mount", "Байонет", "Байонет", { filterable: true, filterMode: "search" }), CONDITION],
  videoCamera: [
    BRAND_TEXT, MODEL_TEXT,
    select("video_camera_type", "Тип видеокамеры", "Бейнекамера түрі", [op("camcorder", "Видеокамера", "Бейнекамера"), op("cinema", "Кинокамера", "Кинокамера"), op("action", "Экшн-камера", "Экшн-камера"), op("360", "Камера 360°", "360° камера")], { required: true }),
    select("video_resolution", "Максимальное разрешение видео", "Ең жоғары бейне ажыратымдылығы", [op("full-hd", "Full HD", "Full HD"), op("2k", "2K", "2K"), op("4k", "4K", "4K"), op("6k", "6K", "6K"), op("8k", "8K", "8K")]),
    number("frame_rate", "Максимальная частота кадров", "Ең жоғары кадр жиілігі", "кадр/с", "кадр/с", { validation: { min: 1, max: 2_000 } }),
    select("storage_media", "Носитель записи", "Жазба тасымалдағышы", [op("sd", "SD", "SD"), op("micro-sd", "microSD", "microSD"), op("cfexpress", "CFexpress", "CFexpress"), op("ssd", "SSD", "SSD"), op("internal", "Встроенная память", "Ішкі жад")]),
    select("stabilization", "Стабилизация", "Тұрақтандыру", [op("none", "Нет", "Жоқ"), op("digital", "Электронная", "Электрондық"), op("optical", "Оптическая", "Оптикалық"), op("combined", "Комбинированная", "Аралас")]),
    number("optical_zoom", "Оптический зум", "Оптикалық зум", "×", "×", { validation: { min: 1, max: 500, step: 0.1 } }),
    CONDITION,
  ],
  actionCamera: [
    select("video_camera_type", "Тип экшн-камеры", "Экшн-камера түрі", [op("action", "Классическая экшн-камера", "Классикалық экшн-камера"), op("360", "Камера 360°", "360° камера")], { required: true }),
    bool("waterproof", "Водозащита", "Судан қорғау"),
    select("mounting_type", "Крепление в комплекте", "Жинақтағы бекітпе", [op("none", "Нет", "Жоқ"), op("helmet", "На шлем", "Дулығаға"), op("chest", "На грудь", "Кеудеге"), op("handlebar", "На руль", "Рульге"), op("universal", "Универсальное", "Әмбебап")]),
  ],
  lens: [BRAND_TEXT, MODEL_TEXT, text("mount", "Байонет", "Байонет", { filterable: true, filterMode: "search", required: true }), number("focal_length", "Фокусное расстояние", "Фокус қашықтығы", "мм", "мм"), CONDITION],
  appliance: [
    BRAND_TEXT, MODEL_TEXT, YEAR, CONDITION, WARRANTY,
    number("power", "Мощность", "Қуаты", "Вт", "Вт", { validation: { min: 1, max: 100_000 } }),
    text("dimensions", "Размеры", "Өлшемдері", { searchable: true, validation: { maxLength: 120 } }), DELIVERY,
  ],
  energyRatedAppliance: [
    select("energy_class", "Класс энергоэффективности", "Энергия тиімділігі класы", [op("a+++", "A+++", "A+++"), op("a++", "A++", "A++"), op("a+", "A+", "A+"), op("a", "A", "A"), op("b", "B", "B"), op("c", "C", "C"), op("d-or-lower", "D и ниже", "D және төмен"), op("unknown", "Не указан", "Көрсетілмеген")]),
  ],
  genericAppliance: [
    select("appliance_type", "Тип техники", "Техника түрі", [
      op("laundry", "Для стирки и сушки", "Жуу және кептіру"), op("refrigeration", "Холодильная техника", "Тоңазыту техникасы"),
      op("cooking", "Для приготовления пищи", "Тағам дайындау"), op("cleaning", "Для уборки", "Тазалауға арналған"),
      op("climate", "Климатическая", "Климаттық"), op("personal-care", "Для ухода", "Күтімге арналған"),
      op("other", "Другая", "Басқа"),
    ], { required: true }),
  ],
  laundryAppliance: [
    number("load_capacity", "Максимальная загрузка", "Ең жоғары жүктеме", "кг", "кг", { validation: { min: 1, max: 100, step: 0.5 } }),
    select("installation_type", "Установка", "Орнату түрі", [op("freestanding", "Отдельностоящая", "Бөлек тұратын"), op("built-in", "Встраиваемая", "Кіріктірілетін"), op("countertop", "Компактная", "Ықшам")]),
    number("max_spin_rpm", "Скорость отжима", "Сығу жылдамдығы", "об/мин", "айн/мин", { validation: { min: 200, max: 3_000 } }),
    select("loading_type", "Тип загрузки", "Жүктеу түрі", [op("front", "Фронтальная", "Алдыңғы"), op("top", "Вертикальная", "Тік")]),
    bool("dryer", "С функцией сушки", "Кептіру функциясымен"),
  ],
  dryingAppliance: [
    number("load_capacity", "Максимальная загрузка", "Ең жоғары жүктеме", "кг", "кг", { validation: { min: 1, max: 100, step: 0.5 } }),
    select("drying_type", "Тип сушки", "Кептіру түрі", [op("heat-pump", "Тепловой насос", "Жылу сорғысы"), op("condensing", "Конденсационная", "Конденсациялық"), op("vented", "Вентиляционная", "Желдеткіш")]),
    select("installation_type", "Установка", "Орнату түрі", [op("freestanding", "Отдельностоящая", "Бөлек тұратын"), op("built-in", "Встраиваемая", "Кіріктірілетін"), op("stack", "В колонну", "Бағанға")]),
  ],
  refrigeratorAppliance: [
    number("total_volume", "Общий объём", "Жалпы көлемі", "л", "л", { validation: { min: 10, max: 5_000 } }),
    select("freezer_location", "Расположение морозильника", "Мұздатқыш орналасуы", [op("top", "Сверху", "Жоғарыда"), op("bottom", "Снизу", "Төменде"), op("side", "Side-by-side", "Side-by-side"), op("none", "Без морозильника", "Мұздатқышсыз")]),
    bool("no_frost", "No Frost", "No Frost"), number("compressors", "Количество компрессоров", "Компрессор саны", undefined, undefined, { validation: { min: 1, max: 4 } }),
  ],
  freezerAppliance: [
    select("freezer_type", "Тип морозильника", "Мұздатқыш түрі", [op("upright", "Шкаф", "Шкаф"), op("chest", "Ларь", "Сандық"), op("countertop", "Компактный", "Ықшам")], { required: true }),
    number("total_volume", "Полезный объём", "Пайдалы көлемі", "л", "л", { validation: { min: 10, max: 5_000 } }),
    bool("no_frost", "No Frost", "No Frost"),
    number("freezing_capacity", "Мощность замораживания", "Мұздату қуаты", "кг/сут.", "кг/тәул.", { validation: { min: 0.1, max: 1_000, step: 0.1 } }),
    number("minimum_temperature", "Минимальная температура", "Ең төмен температура", "°C", "°C", { validation: { min: -100, max: 0 } }),
  ],
  dishwasherAppliance: [
    number("place_settings", "Количество комплектов", "Жинақ саны", "компл.", "жинақ", { validation: { min: 1, max: 40 } }),
    select("installation_type", "Установка", "Орнату түрі", [op("freestanding", "Отдельностоящая", "Бөлек тұратын"), op("built-in", "Встраиваемая", "Кіріктірілетін"), op("countertop", "Настольная", "Үстелдік")]),
    number("width", "Ширина", "Ені", "см", "см", { validation: { min: 20, max: 200 } }),
    bool("half_load", "Половинная загрузка", "Жартылай жүктеу"),
  ],
  cookerHobAppliance: [
    select("cooking_device_type", "Тип устройства", "Құрылғы түрі", [op("cooker", "Плита с духовкой", "Пеші бар плита"), op("hob", "Варочная панель", "Пісіру панелі")], { required: true }),
    select("installation_type", "Установка", "Орнату түрі", [op("freestanding", "Отдельностоящая", "Бөлек тұратын"), op("built-in", "Встраиваемая", "Кіріктірілетін"), op("countertop", "Настольная", "Үстелдік")]),
    select("energy_source", "Тип питания", "Қуат көзі", [op("electric", "Электричество", "Электр"), op("gas", "Газ", "Газ"), op("combined", "Комбинированная", "Аралас")]),
    number("burners", "Количество конфорок", "Пісіру аймағы саны", undefined, undefined, { validation: { min: 1, max: 12 } }),
    number("oven_volume", "Объём духовки", "Пеш көлемі", "л", "л", { validation: visibleWhen("cooking_device_type", ["cooker"], { min: 5, max: 500 }) }),
    select("control_type", "Управление", "Басқару", [op("mechanical", "Механическое", "Механикалық"), op("electronic", "Электронное", "Электрондық"), op("touch", "Сенсорное", "Сенсорлық")]),
  ],
  ovenAppliance: [
    select("installation_type", "Установка", "Орнату түрі", [op("freestanding", "Отдельностоящая", "Бөлек тұратын"), op("built-in", "Встраиваемая", "Кіріктірілетін"), op("countertop", "Настольная", "Үстелдік")]),
    select("energy_source", "Тип питания", "Қуат көзі", [op("electric", "Электричество", "Электр"), op("gas", "Газ", "Газ"), op("combined", "Комбинированная", "Аралас")]),
    number("oven_volume", "Объём камеры", "Камера көлемі", "л", "л", { validation: { min: 5, max: 500 } }),
    select("control_type", "Управление", "Басқару", [op("mechanical", "Механическое", "Механикалық"), op("electronic", "Электронное", "Электрондық"), op("touch", "Сенсорное", "Сенсорлық")]),
    bool("grill", "Гриль", "Гриль"), bool("convection", "Конвекция", "Конвекция"),
    select("cleaning_type", "Очистка духовки", "Пешті тазалау", [op("manual", "Традиционная", "Дәстүрлі"), op("steam", "Паровая", "Бумен"), op("catalytic", "Каталитическая", "Каталитикалық"), op("pyrolytic", "Пиролитическая", "Пиролитикалық")]),
  ],
  microwaveAppliance: [
    select("installation_type", "Установка", "Орнату түрі", [op("freestanding", "Отдельностоящая", "Бөлек тұратын"), op("built-in", "Встраиваемая", "Кіріктірілетін"), op("countertop", "Настольная", "Үстелдік")]),
    number("oven_volume", "Объём камеры", "Камера көлемі", "л", "л", { validation: { min: 5, max: 200 } }),
    select("control_type", "Управление", "Басқару", [op("mechanical", "Механическое", "Механикалық"), op("electronic", "Электронное", "Электрондық"), op("touch", "Сенсорное", "Сенсорлық")]),
    bool("grill", "Гриль", "Гриль"), bool("convection", "Конвекция", "Конвекция"),
  ],
  vacuumAppliance: [
    select("cleaning_type", "Тип уборки", "Тазалау түрі", [op("dry", "Сухая", "Құрғақ"), op("wet", "Влажная", "Ылғалды"), op("both", "Сухая и влажная", "Құрғақ және ылғалды")]),
    select("dust_collector", "Пылесборник", "Шаң жинағыш", [op("bag", "Мешок", "Қап"), op("container", "Контейнер", "Контейнер"), op("aqua", "Аквафильтр", "Аквасүзгі")]),
    number("dust_capacity", "Объём пылесборника", "Шаң жинағыш көлемі", "л", "л", { validation: { min: 0.1, max: 100, step: 0.1 } }),
    bool("cordless", "Аккумуляторный", "Аккумуляторлық"), bool("self_emptying", "Станция самоочистки", "Өзін-өзі тазалау станциясы"),
  ],
  climateAppliance: [
    number("room_area", "Рекомендуемая площадь", "Ұсынылатын аудан", "м²", "м²", { validation: { min: 1, max: 2_000 } }),
    number("cooling_capacity", "Холодопроизводительность", "Салқындату қуаты", "кВт", "кВт", { validation: { min: 0.1, max: 500, step: 0.1 } }),
    bool("inverter", "Инверторный", "Инверторлық"), bool("heating_mode", "Режим обогрева", "Жылыту режимі"),
    select("installation_type", "Исполнение", "Орнату түрі", [op("split", "Сплит-система", "Сплит-жүйе"), op("multi-split", "Мульти-сплит", "Мульти-сплит"), op("mobile", "Мобильный", "Мобильді"), op("window", "Оконный", "Терезелік"), op("other", "Другое", "Басқа")]),
  ],
  heatingAppliance: [
    number("room_area", "Рекомендуемая площадь", "Ұсынылатын аудан", "м²", "м²", { validation: { min: 1, max: 2_000 } }),
    select("heater_kind", "Тип обогревателя", "Жылытқыш түрі", [op("convector", "Конвектор", "Конвектор"), op("oil", "Масляный радиатор", "Майлы радиатор"), op("infrared", "Инфракрасный", "Инфрақызыл"), op("fan", "Тепловентилятор", "Жылу желдеткіші"), op("fireplace", "Электрокамин", "Электр камині"), op("gas", "Газовый", "Газды"), op("other", "Другой", "Басқа")]),
    select("installation_type", "Установка", "Орнату түрі", [op("floor", "Напольная", "Едендік"), op("wall", "Настенная", "Қабырғалық"), op("ceiling", "Потолочная", "Төбелік")]),
    bool("thermostat", "Термостат", "Термостат"), bool("overheat_protection", "Защита от перегрева", "Қызып кетуден қорғау"),
  ],
  airTreatmentAppliance: [
    select("treatment_type", "Тип устройства", "Құрылғы түрі", [op("humidifier", "Увлажнитель", "Ылғалдандырғыш"), op("purifier", "Очиститель", "Тазартқыш"), op("air-washer", "Мойка воздуха", "Ауа жуғыш"), op("combined", "Комбинированный", "Аралас")], { required: true }),
    number("room_area", "Рекомендуемая площадь", "Ұсынылатын аудан", "м²", "м²", { validation: { min: 1, max: 2_000 } }),
    number("tank_volume", "Объём резервуара", "Су ыдысының көлемі", "л", "л", { validation: { min: 0.1, max: 100, step: 0.1 } }),
    number("humidification_rate", "Производительность увлажнения", "Ылғалдандыру өнімділігі", "мл/ч", "мл/сағ", { validation: { min: 1, max: 20_000 } }),
    text("filter_type", "Тип фильтра", "Сүзгі түрі", { filterable: true, searchable: true, filterMode: "search" }),
    bool("smart_control", "Управление со смартфона", "Смартфоннан басқару"),
  ],
  fanAppliance: [
    select("fan_type", "Тип вентилятора", "Желдеткіш түрі", [op("floor", "Напольный", "Едендік"), op("table", "Настольный", "Үстелдік"), op("wall", "Настенный", "Қабырғалық"), op("tower", "Колонный", "Мұнаралық"), op("ceiling", "Потолочный", "Төбелік")], { required: true }),
    number("speed_levels", "Количество скоростей", "Жылдамдық саны", undefined, undefined, { validation: { min: 1, max: 100 } }),
    bool("oscillation", "Поворот корпуса", "Корпустың айналуы"), bool("remote_control", "Пульт управления", "Басқару пульті"),
  ],
  waterHeaterAppliance: [
    number("tank_volume", "Объём бака", "Бак көлемі", "л", "л", { validation: { min: 1, max: 5_000 } }),
    select("heater_type", "Тип", "Түрі", [op("storage", "Накопительный", "Жинақтаушы"), op("instant", "Проточный", "Ағынды"), op("indirect", "Косвенного нагрева", "Жанама қыздыру")]),
    select("energy_source", "Тип питания", "Қуат көзі", [op("electric", "Электричество", "Электр"), op("gas", "Газ", "Газ"), op("combined", "Комбинированный", "Аралас")]),
  ],
  hoodAppliance: [
    select("installation_type", "Установка", "Орнату түрі", [op("built-in", "Встраиваемая", "Кіріктірілетін"), op("wall", "Настенная", "Қабырғалық"), op("island", "Островная", "Аралдық"), op("ceiling", "Потолочная", "Төбелік")]),
    number("width", "Ширина", "Ені", "см", "см", { validation: { min: 20, max: 300 } }),
    number("extraction_rate", "Производительность", "Өнімділігі", "м³/ч", "м³/сағ", { validation: { min: 10, max: 10_000 } }),
    number("noise_level", "Уровень шума", "Шу деңгейі", "дБ", "дБ", { validation: { min: 1, max: 150 } }),
    number("speed_levels", "Количество скоростей", "Жылдамдық саны", undefined, undefined, { validation: { min: 1, max: 30 } }),
    bool("recirculation", "Режим рециркуляции", "Рециркуляция режимі"),
  ],
  smallKitchenAppliance: [
    select("kitchen_device_type", "Тип техники", "Техника түрі", [
      op("kettle", "Чайник / термопот", "Шәйнек / термопот"), op("coffee", "Кофеварка / кофемашина", "Кофе қайнатқыш / кофемашина"),
      op("blender", "Блендер", "Блендер"), op("mixer", "Миксер", "Миксер"), op("food-processor", "Кухонный комбайн", "Асүй комбайны"),
      op("meat-grinder", "Мясорубка", "Ет тартқыш"), op("multicooker", "Мультиварка", "Мультипісіргіш"),
      op("toaster", "Тостер / сэндвичница", "Тостер / сэндвич жасағыш"), op("juicer", "Соковыжималка", "Шырын сыққыш"),
      op("other", "Другая", "Басқа"),
    ], { required: true }),
    number("capacity", "Объём / вместимость", "Көлемі / сыйымдылығы", "л", "л", { validation: { min: 0.01, max: 500, step: 0.01 } }),
    number("speed_levels", "Количество скоростей / программ", "Жылдамдық / бағдарлама саны", undefined, undefined, { validation: { min: 1, max: 500 } }),
    text("attachments", "Насадки и комплектация", "Саптамалар мен жинақ", { searchable: true, validation: { maxLength: 300 } }),
  ],
  ironSteamerAppliance: [
    select("iron_device_type", "Тип устройства", "Құрылғы түрі", [op("iron", "Утюг", "Үтік"), op("steamer", "Отпариватель", "Булағыш"), op("steam-station", "Парогенератор", "Бу генераторы")], { required: true }),
    number("steam_output", "Подача пара", "Бу беру", "г/мин", "г/мин", { validation: { min: 0, max: 1_000 } }),
    number("tank_volume", "Объём резервуара", "Су ыдысының көлемі", "л", "л", { validation: { min: 0.01, max: 20, step: 0.01 } }),
    select("sole_material", "Материал подошвы", "Табан материалы", [op("ceramic", "Керамика", "Керамика"), op("steel", "Нержавеющая сталь", "Тот баспайтын болат"), op("aluminum", "Алюминий", "Алюминий"), op("coated", "С покрытием", "Қаптамалы"), op("other", "Другой", "Басқа")]),
    bool("auto_shutoff", "Автоотключение", "Автоматты өшіру"),
  ],
  sewingAppliance: [
    select("sewing_device_type", "Тип машины", "Машина түрі", [op("sewing", "Швейная", "Тігін"), op("overlock", "Оверлок / распошивальная", "Оверлок / тігіс"), op("embroidery", "Вышивальная", "Кестелеу"), op("knitting", "Вязальная", "Тоқу")], { required: true }),
    select("control_type", "Управление", "Басқару", [op("mechanical", "Механическое", "Механикалық"), op("electromechanical", "Электромеханическое", "Электромеханикалық"), op("electronic", "Электронное / компьютерное", "Электрондық / компьютерлік")]),
    number("operations_count", "Количество операций", "Операция саны", undefined, undefined, { validation: { min: 1, max: 10_000 } }),
    bool("automatic_threader", "Автоматический нитевдеватель", "Автоматты жіп өткізгіш"),
  ],
  hairStylingAppliance: [
    select("hair_device_type", "Тип устройства", "Құрылғы түрі", [op("dryer", "Фен", "Фен"), op("styler", "Стайлер", "Стайлер"), op("straightener", "Выпрямитель", "Түзеткіш"), op("curler", "Плойка", "Бұйралағыш"), op("brush", "Фен-щётка", "Фен-қылшақ")], { required: true }),
    number("temperature_levels", "Температурные режимы", "Температура режимдері", undefined, undefined, { validation: { min: 1, max: 100 } }),
    bool("ionization", "Ионизация", "Иондау"), bool("cold_air", "Холодный воздух", "Салқын ауа"),
    text("attachments", "Насадки", "Саптамалар", { searchable: true, validation: { maxLength: 240 } }),
  ],
  groomingAppliance: [
    select("grooming_device_type", "Тип устройства", "Құрылғы түрі", [op("shaver", "Электробритва", "Электр ұстара"), op("trimmer", "Триммер", "Триммер"), op("clipper", "Машинка для стрижки", "Шаш қырқу машинасы")], { required: true }),
    select("power_source", "Питание", "Қуат көзі", [op("mains", "От сети", "Желіден"), op("battery", "Аккумулятор", "Аккумулятор"), op("both", "Сеть и аккумулятор", "Желі және аккумулятор")]),
    bool("wet_use", "Влажное использование", "Ылғалды пайдалану"),
    number("attachments_count", "Количество насадок", "Саптама саны", undefined, undefined, { validation: { min: 0, max: 100 } }),
  ],
  skinCareAppliance: [
    select("skincare_device_type", "Тип устройства", "Құрылғы түрі", [op("epilator", "Эпилятор", "Эпилятор"), op("photoepilator", "Фотоэпилятор", "Фотоэпилятор"), op("face-care", "Для ухода за лицом", "Бет күтіміне"), op("manicure", "Маникюр / педикюр", "Маникюр / педикюр"), op("massager", "Массажёр", "Массажер")], { required: true }),
    select("power_source", "Питание", "Қуат көзі", [op("mains", "От сети", "Желіден"), op("battery", "Аккумулятор", "Аккумулятор"), op("both", "Сеть и аккумулятор", "Желі және аккумулятор")]),
    bool("wet_use", "Влажное использование", "Ылғалды пайдалану"),
    number("attachments_count", "Количество насадок", "Саптама саны", undefined, undefined, { validation: { min: 0, max: 100 } }),
  ],
  toothbrushAppliance: [
    select("toothbrush_type", "Технология щётки", "Тіс щеткасы технологиясы", [op("rotating", "Возвратно-вращательная", "Айналмалы"), op("sonic", "Звуковая", "Дыбыстық"), op("ultrasonic", "Ультразвуковая", "Ультрадыбыстық")], { required: true }),
    number("modes_count", "Количество режимов", "Режим саны", undefined, undefined, { validation: { min: 1, max: 100 } }),
    bool("pressure_sensor", "Датчик давления", "Қысым датчигі"), bool("timer", "Таймер", "Таймер"),
    number("heads_count", "Насадки в комплекте", "Жинақтағы саптама", undefined, undefined, { validation: { min: 0, max: 100 } }),
  ],
  healthAppliance: [
    select("health_device_type", "Тип прибора", "Құрылғы түрі", [
      op("scale", "Весы", "Таразы"), op("thermometer", "Термометр", "Термометр"), op("blood-pressure", "Тонометр", "Тонометр"),
      op("glucose", "Глюкометр", "Глюкометр"), op("pulse-oximeter", "Пульсоксиметр", "Пульсоксиметр"),
      op("massager", "Массажёр", "Массажер"), op("other", "Другой", "Басқа"),
    ], { required: true }),
    text("measurement_scope", "Измеряемые показатели", "Өлшенетін көрсеткіштер", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 240 } }),
    bool("smart_sync", "Синхронизация со смартфоном", "Смартфонмен синхрондау"),
  ],
  breastPumpAppliance: [
    select("breast_pump_item_type", "Тип товара", "Тауар түрі", [op("pump", "Молокоотсос", "Сүт сауғыш"), op("accessory", "Аксессуар / расходник", "Аксессуар / шығын материалы")], { required: true }),
    number("year", "Год выпуска", "Шығарылған жылы", "год", "жыл", { validation: visibleWhen("breast_pump_item_type", ["pump"], { min: 1900, max: 2100 }) }),
    number("power", "Мощность", "Қуаты", "Вт", "Вт", { validation: visibleWhen("breast_pump_item_type", ["pump"], { min: 1, max: 100_000 }) }),
    select("warranty", "Гарантия", "Кепілдік", [op("none", "Нет", "Жоқ"), op("seller", "От продавца", "Сатушыдан"), op("manufacturer", "От производителя", "Өндірушіден")], { validation: visibleWhen("breast_pump_item_type", ["pump"]) }),
    select("pump_type", "Тип молокоотсоса", "Сүт сауғыш түрі", [op("manual", "Ручной", "Қолмен"), op("electric", "Электрический", "Электрлік"), op("wearable", "Носимый", "Тағылатын")], { validation: visibleWhen("breast_pump_item_type", ["pump"]) }),
    bool("double_pumping", "Одновременное сцеживание", "Бір уақытта сауу", { validation: visibleWhen("breast_pump_item_type", ["pump"]) }),
    number("modes_count", "Количество режимов", "Режим саны", undefined, undefined, { validation: visibleWhen("breast_pump_item_type", ["pump"], { min: 1, max: 100 }) }),
  ],
  sterilizerWarmerAppliance: [
    select("baby_heating_device_type", "Тип устройства", "Құрылғы түрі", [op("sterilizer", "Стерилизатор", "Стерилизатор"), op("warmer", "Подогреватель", "Жылытқыш"), op("combined", "Стерилизатор-подогреватель", "Стерилизатор-жылытқыш")], { required: true }),
    number("bottle_capacity", "Количество бутылочек", "Бөтелке саны", undefined, undefined, { validation: { min: 1, max: 100 } }),
    bool("auto_shutoff", "Автоотключение", "Автоматты өшіру"),
  ],
  babyMonitoringAppliance: [
    select("baby_device_type", "Тип устройства", "Құрылғы түрі", [op("audio-monitor", "Радионяня", "Радиобақылау"), op("video-monitor", "Видеоняня", "Бейнебақылау"), op("scale", "Детские весы", "Балалар таразысы"), op("thermometer", "Термометр", "Термометр")], { required: true }),
    select("connection", "Связь", "Байланыс", [op("radio", "Радиоканал", "Радиоарна"), op("wifi", "Wi-Fi", "Wi-Fi"), op("bluetooth", "Bluetooth", "Bluetooth"), op("offline", "Без связи", "Байланыссыз")], { validation: visibleWhen("baby_device_type", ["audio-monitor", "video-monitor"]) }),
    number("range_meters", "Дальность связи", "Байланыс қашықтығы", "м", "м", { validation: visibleWhen("baby_device_type", ["audio-monitor", "video-monitor"], { min: 1, max: 100_000 }) }),
    bool("night_vision", "Ночное видение", "Түнгі көру", { validation: visibleWhen("baby_device_type", ["video-monitor"]) }),
    bool("smart_sync", "Синхронизация со смартфоном", "Смартфонмен синхрондау"),
  ],
  audio: [select("audio_type", "Тип", "Түрі", [op("headphones", "Наушники", "Құлаққап"), op("speaker", "Колонка", "Динамик"), op("system", "Акустическая система", "Акустикалық жүйе"), op("amplifier", "Усилитель / ресивер", "Күшейткіш / ресивер")]), BRAND_TEXT, MODEL_TEXT, select("connection", "Подключение", "Қосылу", [op("wired", "Проводное", "Сымды"), op("wireless", "Беспроводное", "Сымсыз"), op("both", "Оба варианта", "Екі нұсқа")]), CONDITION],
  gaming: [select("platform", "Платформа", "Платформа", [op("playstation", "PlayStation", "PlayStation"), op("xbox", "Xbox", "Xbox"), op("nintendo", "Nintendo", "Nintendo"), op("pc", "PC", "PC"), op("other", "Другая", "Басқа")]), BRAND_TEXT, MODEL_TEXT, CONDITION],

  furniture: [select("furniture_type", "Тип мебели", "Жиһаз түрі", [op("sofa", "Диван", "Диван"), op("bed", "Кровать", "Кереует"), op("wardrobe", "Шкаф", "Шкаф"), op("table", "Стол", "Үстел"), op("chair", "Стул / кресло", "Орындық / кресло"), op("kitchen", "Кухонная мебель", "Асүй жиһазы"), op("other", "Другое", "Басқа")]), select("material", "Материал", "Материалы", [op("wood", "Дерево", "Ағаш"), op("mdf", "МДФ / ЛДСП", "МДФ / ЛДСП"), op("metal", "Металл", "Металл"), op("glass", "Стекло", "Шыны"), op("mixed", "Комбинированный", "Аралас")]), text("dimensions", "Размеры", "Өлшемдері"), CONDITION, DELIVERY],
  lighting: [select("lighting_type", "Тип", "Түрі", [op("chandelier", "Люстра", "Аспашам"), op("lamp", "Светильник", "Шам"), op("floor", "Торшер", "Еден шамы"), op("outdoor", "Уличное", "Сыртқы")]), select("light_source", "Источник света", "Жарық көзі", [op("led", "LED", "LED"), op("bulb", "Лампа", "Шам"), op("integrated", "Встроенный LED", "Кіріктірілген LED")]), number("power", "Мощность", "Қуаты", "Вт", "Вт"), CONDITION],
  gardenGoods: [select("product_type", "Тип товара", "Тауар түрі", [op("tool", "Инструмент", "Құрал"), op("equipment", "Техника", "Техника"), op("plant", "Растение / семена", "Өсімдік / тұқым"), op("irrigation", "Полив", "Суару"), op("decor", "Декор", "Әшекей")]), BRAND_TEXT, select("purpose", "Назначение", "Мақсаты", [op("home", "Для дома", "Үйге"), op("garden", "Для сада", "Бақшаға"), op("farm", "Для хозяйства", "Шаруашылыққа")]), CONDITION],
  tool: [select("tool_type", "Тип инструмента", "Құрал түрі", [op("drill", "Дрель / шуруповёрт", "Бұрғы / бұрауыш"), op("saw", "Пила", "Ара"), op("grinder", "Шлифмашина", "Тегістегіш"), op("compressor", "Компрессор", "Компрессор"), op("hand", "Ручной инструмент", "Қол құралы"), op("other", "Другой", "Басқа")]), select("power_source", "Питание", "Қуат көзі", [op("mains", "Сеть", "Желі"), op("battery", "Аккумулятор", "Аккумулятор"), op("petrol", "Бензин", "Бензин"), op("manual", "Ручной", "Қолмен")]), number("power", "Мощность", "Қуаты", "Вт", "Вт"), BRAND_TEXT, CONDITION],

  clothing: [BRAND_TEXT, text("size", "Размер", "Өлшем", { filterable: true, filterMode: "search", required: true }), select("season", "Сезон", "Маусым", [op("summer", "Лето", "Жаз"), op("demi", "Демисезон", "Маусымаралық"), op("winter", "Зима", "Қыс"), op("all", "Всесезон", "Барлық маусым")]), text("material", "Материал", "Материалы", { filterable: true, filterMode: "search" }), CONDITION],
  shoes: [BRAND_TEXT, number("size", "Размер", "Өлшем"), select("season", "Сезон", "Маусым", [op("summer", "Лето", "Жаз"), op("demi", "Демисезон", "Маусымаралық"), op("winter", "Зима", "Қыс")]), CONDITION],
  bags: [BRAND_TEXT, select("bag_type", "Тип", "Түрі", [op("bag", "Сумка", "Сөмке"), op("backpack", "Рюкзак", "Арқа сөмке"), op("briefcase", "Портфель", "Портфель"), op("suitcase", "Чемодан", "Чемодан")]), text("material", "Материал", "Материалы"), CONDITION],
  jewelry: [BRAND_TEXT, select("item_type", "Тип", "Түрі", [op("watch", "Часы", "Сағат"), op("ring", "Кольцо", "Сақина"), op("earrings", "Серьги", "Сырға"), op("chain", "Цепочка", "Шынжыр"), op("bracelet", "Браслет", "Білезік")]), select("material", "Материал", "Материалы", [op("gold", "Золото", "Алтын"), op("silver", "Серебро", "Күміс"), op("steel", "Сталь", "Болат"), op("costume", "Бижутерия", "Бижутерия")]), CONDITION],

  kidsClothing: [select("age_group", "Возраст", "Жас тобы", [op("0-1", "До 1 года", "1 жасқа дейін"), op("1-3", "1–3 года", "1–3 жас"), op("3-6", "3–6 лет", "3–6 жас"), op("7-12", "7–12 лет", "7–12 жас"), op("teen", "Подросткам", "Жасөспірімдерге")]), text("size", "Размер", "Өлшем", { filterable: true, filterMode: "search" }), select("gender", "Пол", "Жынысы", [op("girl", "Для девочки", "Қыз балаға"), op("boy", "Для мальчика", "Ұл балаға"), op("unisex", "Унисекс", "Унисекс")]), select("season", "Сезон", "Маусым", [op("summer", "Лето", "Жаз"), op("demi", "Демисезон", "Маусымаралық"), op("winter", "Зима", "Қыс")]), CONDITION],
  stroller: [BRAND_TEXT, MODEL_TEXT, select("stroller_type", "Тип коляски", "Арба түрі", [op("carrycot", "Люлька", "Бесік арба"), op("stroller", "Прогулочная", "Серуендік"), op("transformer", "Трансформер", "Трансформер"), op("2in1", "2 в 1", "2-де 1"), op("3in1", "3 в 1", "3-те 1"), op("twins", "Для двойни", "Егіздерге")]), select("age_group", "Возраст", "Жас", [op("0-6m", "0–6 месяцев", "0–6 ай"), op("6-36m", "6–36 месяцев", "6–36 ай")]), CONDITION],
  carSeat: [BRAND_TEXT, select("weight_group", "Группа / вес", "Топ / салмақ", [op("0", "0 (до 10 кг)", "0 (10 кг дейін)"), op("0+", "0+ (до 13 кг)", "0+ (13 кг дейін)"), op("1", "1 (9–18 кг)", "1 (9–18 кг)"), op("2-3", "2/3 (15–36 кг)", "2/3 (15–36 кг)"), op("universal", "Универсальная", "Әмбебап")]), bool("isofix", "ISOFIX", "ISOFIX"), CONDITION],
  toy: [select("toy_type", "Тип игрушки", "Ойыншық түрі", [op("educational", "Развивающая", "Дамытушы"), op("doll", "Кукла", "Қуыршақ"), op("construction", "Конструктор", "Құрастырғыш"), op("vehicle", "Машинка / транспорт", "Машина / көлік"), op("soft", "Мягкая", "Жұмсақ"), op("board", "Настольная", "Үстел ойыны")]), select("age_group", "Возраст", "Жас", [op("0-1", "До 1 года", "1 жасқа дейін"), op("1-3", "1–3 года", "1–3 жас"), op("3-6", "3–6 лет", "3–6 жас"), op("7+", "7 лет и старше", "7 жастан жоғары")]), CONDITION],

  bookMedia: [
    text("author", "Автор", "Автор", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 160 } }),
    select("language", "Язык", "Тілі", [op("ru", "Русский", "Орысша"), op("kk", "Казахский", "Қазақша"), op("en", "Английский", "Ағылшынша"), op("other", "Другой", "Басқа")]),
    select("book_format", "Переплёт / формат", "Мұқаба / формат", [op("hardcover", "Твёрдый переплёт", "Қатты мұқаба"), op("paperback", "Мягкая обложка", "Жұмсақ мұқаба"), op("magazine", "Журнал", "Журнал"), op("set", "Комплект", "Жинақ"), op("other", "Другой", "Басқа")]),
    number("publication_year", "Год издания", "Басылған жылы", "год", "жыл", { validation: { min: 1400, max: 2100 } }),
    text("publisher", "Издательство", "Баспасы", { filterable: true, searchable: true, filterMode: "search", validation: { maxLength: 160 } }),
    text("isbn", "ISBN", "ISBN", { searchable: true, validation: { maxLength: 32 } }),
    text("issue_number", "Номер выпуска", "Шығарылым нөмірі", { searchable: true, validation: { maxLength: 40 } }), CONDITION,
  ],
  collectible: [
    select("collectible_type", "Тип предмета", "Зат түрі", [op("coin", "Монета", "Монета"), op("banknote", "Банкнота", "Банкнот"), op("stamp", "Марка", "Марка"), op("model", "Модель", "Модель"), op("antique", "Антиквариат", "Антиквариат"), op("card", "Карта", "Карта"), op("other", "Другое", "Басқа")]),
    text("country", "Страна / регион", "Ел / аймақ", { filterable: true, searchable: true, filterMode: "search" }),
    number("year", "Год", "Жылы", "год", "жыл", { validation: { min: 1, max: 2100 } }),
    select("authenticity", "Подлинность", "Түпнұсқалық", [op("certified", "Подтверждена", "Расталған"), op("seller", "По заявлению продавца", "Сатушы мәлімдемесі бойынша"), op("replica", "Копия / реплика", "Көшірме / реплика"), op("unknown", "Неизвестно", "Белгісіз")]),
    text("material", "Материал", "Материалы", { filterable: true, searchable: true, filterMode: "search" }), CONDITION,
  ],
  outdoorGear: [
    text("gear_type", "Тип снаряжения", "Жабдық түрі", { filterable: true, searchable: true, filterMode: "search" }),
    select("season", "Сезон", "Маусым", [op("summer", "Лето", "Жаз"), op("winter", "Зима", "Қыс"), op("three-season", "Три сезона", "Үш маусым"), op("all", "Всесезон", "Барлық маусым")]),
    number("capacity", "Вместимость", "Сыйымдылығы"), text("dimensions", "Размеры", "Өлшемдері", { searchable: true }),
    text("material", "Материал", "Материалы", { filterable: true, searchable: true, filterMode: "search" }), bool("waterproof", "Водонепроницаемый", "Су өткізбейді"), CONDITION,
  ],
  fishingGear: [
    select("fishing_type", "Вид рыбалки", "Балық аулау түрі", [op("spinning", "Спиннинг", "Спиннинг"), op("feeder", "Фидер", "Фидер"), op("float", "Поплавочная", "Қалқымалы"), op("winter", "Зимняя", "Қысқы"), op("sea", "Морская", "Теңіздік"), op("other", "Другая", "Басқа")]),
    text("gear_type", "Тип снасти", "Жабдық түрі", { filterable: true, searchable: true, filterMode: "search" }),
    BRAND_TEXT, number("length", "Длина", "Ұзындығы", "м", "м", { validation: { min: 0.01, max: 100, step: 0.01 } }),
    text("material", "Материал", "Материалы", { filterable: true, searchable: true, filterMode: "search" }), CONDITION,
  ],
  huntingGear: [
    text("gear_type", "Тип снаряжения", "Жабдық түрі", { filterable: true, searchable: true, filterMode: "search" }),
    select("purpose", "Назначение", "Мақсаты", [op("clothing", "Одежда / обувь", "Киім / аяқ киім"), op("optics", "Оптика", "Оптика"), op("decoy", "Манки / приманки", "Алдағыш / жем"), op("tool", "Инструмент", "Құрал"), op("storage", "Хранение", "Сақтау")]),
    BRAND_TEXT, text("size", "Размер / калибр", "Өлшем / калибр", { filterable: true, searchable: true, filterMode: "search" }),
    text("material", "Материал", "Материалы", { filterable: true, searchable: true, filterMode: "search" }), CONDITION,
  ],
  handmadeMaterial: [
    select("craft_type", "Вид рукоделия", "Қолөнер түрі", [op("knitting", "Вязание", "Тоқу"), op("sewing", "Шитьё", "Тігу"), op("embroidery", "Вышивание", "Кесте тігу"), op("jewelry", "Украшения", "Әшекей"), op("painting", "Рисование", "Сурет салу"), op("soap-candles", "Мыло / свечи", "Сабын / шам"), op("decor", "Декор", "Безендіру")]),
    text("material", "Материал / состав", "Материал / құрам", { filterable: true, searchable: true, filterMode: "search" }),
    text("color", "Цвет / палитра", "Түс / палитра", { filterable: true, searchable: true, filterMode: "search" }),
    number("quantity", "Количество", "Саны", undefined, undefined, { validation: { min: 0.01, max: 1_000_000 } }),
    select("sale_unit", "Единица продажи", "Сату бірлігі", [op("piece", "Штука", "Дана"), op("set", "Набор", "Жинақ"), op("meter", "Метр", "Метр"), op("gram", "Грамм", "Грамм"), op("kilogram", "Килограмм", "Килограмм"), op("package", "Упаковка", "Қаптама")]), CONDITION,
  ],
  bicycle: [BRAND_TEXT, select("bicycle_type", "Тип велосипеда", "Велосипед түрі", [op("mountain", "Горный", "Тау"), op("road", "Шоссейный", "Шоссе"), op("city", "Городской", "Қалалық"), op("bmx", "BMX", "BMX"), op("kids", "Детский", "Балаларға"), op("electric", "Электровелосипед", "Электр велосипед")]), number("wheel_size", "Размер колёс", "Дөңгелек өлшемі", "дюйм", "дюйм"), text("frame_size", "Размер рамы", "Жақтау өлшемі", { filterable: true, filterMode: "search" }), select("frame_material", "Материал рамы", "Жақтау материалы", [op("steel", "Сталь", "Болат"), op("aluminum", "Алюминий", "Алюминий"), op("carbon", "Карбон", "Карбон")]), CONDITION],
  instrument: [select("instrument_type", "Тип инструмента", "Аспап түрі", [op("guitar", "Гитара", "Гитара"), op("keyboard", "Клавишный", "Пернелі"), op("drums", "Ударный", "Ұрмалы"), op("wind", "Духовой", "Үрмелі"), op("strings", "Струнный", "Ішекті"), op("studio", "Студийное оборудование", "Студиялық жабдық")]), BRAND_TEXT, MODEL_TEXT, CONDITION],
  sportsGoods: [text("sport", "Вид спорта", "Спорт түрі", { filterable: true, searchable: true, filterMode: "search" }), text("product_type", "Тип товара", "Тауар түрі", { filterable: true, searchable: true, filterMode: "search" }), BRAND_TEXT, CONDITION],
  ticket: [text("event", "Событие", "Іс-шара", { searchable: true, required: true }), date("event_date", "Дата", "Күні", { required: true }), number("quantity", "Количество", "Саны", "шт.", "дана"), text("seat", "Сектор / место", "Сектор / орын")],

  liveAnimalDetails: [
    select("listing_purpose", "Цель объявления", "Хабарландыру мақсаты", [op("sale", "Продажа", "Сату"), op("free", "Отдам бесплатно", "Тегін беремін"), op("adoption", "Пристройство", "Жаңа иесін іздеу"), op("reservation", "Бронирование", "Брондау"), op("mating", "Вязка", "Шағылыстыру")], { required: true }),
    number("animal_quantity", "Количество животных", "Жануар саны", undefined, undefined, { required: true, validation: { min: 1, max: 10_000 } }),
    select("health_status", "Состояние здоровья", "Денсаулық күйі", [op("healthy", "Здоров(а)", "Дені сау"), op("special-needs", "Особые потребности", "Ерекше күтім қажет"), op("treatment", "На лечении", "Емделуде"), op("unknown", "Неизвестно", "Белгісіз")], { required: true }),
    bool("microchipped", "Есть микрочип", "Микрочип бар"), bool("delivery", "Возможна доставка", "Жеткізу мүмкін"),
  ],
  animalSupply: [
    select("animal_type", "Для какого животного", "Қай жануарға", [op("cat", "Кошки", "Мысықтар"), op("dog", "Собаки", "Иттер"), op("bird", "Птицы", "Құстар"), op("fish", "Рыбы", "Балықтар"), op("rodent", "Грызуны", "Кеміргіштер"), op("reptile", "Рептилии", "Бауырымен жорғалаушылар"), op("farm", "Сельхозживотные", "Ауыл шаруашылық жануарлары"), op("universal", "Универсальный", "Әмбебап")]),
    text("supply_type", "Тип товара / оборудования", "Тауар / жабдық түрі", { filterable: true, searchable: true, filterMode: "search", required: true }),
    number("capacity", "Объём / вместимость", "Көлемі / сыйымдылығы", "л", "л", { validation: { min: 0.1, max: 1_000_000 } }),
    number("recommended_volume", "Рекомендуемый объём", "Ұсынылатын көлем", "л", "л", { validation: { min: 0.1, max: 1_000_000 } }),
    number("power", "Мощность", "Қуаты", "Вт", "Вт", { validation: { min: 0, max: 100_000 } }),
    text("dimensions", "Размеры", "Өлшемдері", { searchable: true, validation: { maxLength: 120 } }),
    text("material", "Материал", "Материалы", { filterable: true, searchable: true, filterMode: "search" }), CONDITION, DELIVERY,
  ],
  petConsumable: [
    select("animal_type", "Для какого животного", "Қай жануарға", [op("cat", "Кошки", "Мысықтар"), op("dog", "Собаки", "Иттер"), op("bird", "Птицы", "Құстар"), op("fish", "Рыбы", "Балықтар"), op("rodent", "Грызуны", "Кеміргіштер"), op("reptile", "Рептилии", "Бауырымен жорғалаушылар"), op("farm", "Сельхозживотные", "Ауыл шаруашылық жануарлары")], { required: true }),
    select("animal_age_group", "Возраст животного", "Жануар жасы", [op("baby", "Для детёнышей", "Төлдерге"), op("adult", "Для взрослых", "Ересектерге"), op("senior", "Для пожилых", "Қарт жануарларға"), op("all", "Для всех возрастов", "Барлық жасқа")]),
  ],
  pet: [text("breed", "Порода", "Тұқымы", { filterable: true, searchable: true, filterMode: "search", required: true }), number("age_months", "Возраст", "Жасы", "мес.", "ай"), select("gender", "Пол", "Жынысы", [op("male", "Самец", "Еркек"), op("female", "Самка", "Ұрғашы")]), bool("documents", "Документы / ветпаспорт", "Құжаттар / ветеринарлық төлқұжат"), bool("vaccinated", "Прививки", "Екпелері бар"), bool("sterilized", "Стерилизован(а)", "Зарарсыздандырылған"), bool("pedigree", "Родословная", "Шежіресі бар")],
  smallAnimal: [text("species", "Вид / порода", "Түрі / тұқымы", { filterable: true, searchable: true, filterMode: "search", required: true }), number("age_months", "Возраст", "Жасы", "мес.", "ай"), select("gender", "Пол", "Жынысы", [op("male", "Самец", "Еркек"), op("female", "Самка", "Ұрғашы"), op("unknown", "Не определён", "Белгісіз")]), bool("documents", "Документы", "Құжаттары бар")],
  farmAnimal: [select("animal_species", "Вид", "Түрі", [op("cattle", "Крупный рогатый скот", "Ірі қара"), op("horse", "Лошади", "Жылқы"), op("sheep-goat", "Овцы / козы", "Қой / ешкі"), op("pig", "Свиньи", "Шошқа"), op("poultry", "Птица", "Құс"), op("other", "Другой", "Басқа")], { required: true }), text("breed", "Порода", "Тұқымы", { filterable: true, searchable: true, filterMode: "search" }), number("age_months", "Возраст", "Жасы", "мес.", "ай"), select("gender", "Пол", "Жынысы", [op("male", "Самец", "Еркек"), op("female", "Самка", "Ұрғашы")]), select("purpose", "Назначение", "Мақсаты", [op("breeding", "Разведение", "Асылдандыру"), op("dairy", "Молочное", "Сүт"), op("meat", "Мясное", "Ет"), op("work", "Рабочее", "Жұмыс")]), bool("documents", "Документы", "Құжаттары бар")],
  lostPet: [select("notice_type", "Объявление", "Хабарландыру", [op("lost", "Потерялось", "Жоғалды"), op("found", "Найдено", "Табылды")], { required: true }), text("animal_species", "Вид животного", "Жануар түрі", { filterable: true, searchable: true, filterMode: "search", required: true }), text("breed", "Порода", "Тұқымы", { searchable: true }), select("gender", "Пол", "Жынысы", [op("male", "Самец", "Еркек"), op("female", "Самка", "Ұрғашы"), op("unknown", "Неизвестно", "Белгісіз")]), date("event_date", "Дата", "Күні"), text("district", "Район", "Аудан", { searchable: true }), text("features", "Особые приметы", "Ерекше белгілері", { searchable: true })],

  buildingMaterial: [text("material", "Материал / состав", "Материал / құрам", { filterable: true, searchable: true, filterMode: "search" }), text("size_spec", "Размер / маркировка", "Өлшем / таңбалау", { filterable: true, searchable: true, filterMode: "search" }), number("quantity", "Количество", "Саны"), select("sale_unit", "Единица продажи", "Сату бірлігі", [op("piece", "Штука", "Дана"), op("meter", "Метр", "Метр"), op("square-meter", "М²", "М²"), op("cubic-meter", "М³", "М³"), op("kilogram", "Кг", "Кг"), op("ton", "Тонна", "Тонна"), op("package", "Упаковка", "Қаптама")]), CONDITION, DELIVERY],
  rentalBicycleScooter: [
    select("rental_vehicle_type", "Тип транспорта", "Көлік түрі", [op("bicycle", "Велосипед", "Велосипед"), op("scooter", "Самокат", "Самокат")], { required: true }),
    select("bicycle_type", "Тип велосипеда", "Велосипед түрі", [op("mountain", "Горный", "Тау"), op("road", "Шоссейный", "Шоссе"), op("city", "Городской", "Қалалық"), op("bmx", "BMX", "BMX"), op("kids", "Детский", "Балаларға"), op("electric", "Электровелосипед", "Электр велосипед")], { validation: visibleWhen("rental_vehicle_type", ["bicycle"]) }),
    text("frame_size", "Размер рамы", "Жақтау өлшемі", { filterable: true, filterMode: "search", validation: visibleWhen("rental_vehicle_type", ["bicycle"]) }),
    select("frame_material", "Материал рамы", "Жақтау материалы", [op("steel", "Сталь", "Болат"), op("aluminum", "Алюминий", "Алюминий"), op("carbon", "Карбон", "Карбон")], { validation: visibleWhen("rental_vehicle_type", ["bicycle"]) }),
    select("scooter_drive_type", "Тип самоката", "Самокат түрі", [op("kick", "Механический", "Механикалық"), op("electric", "Электрический", "Электрлік")], { validation: visibleWhen("rental_vehicle_type", ["scooter"]) }),
    number("max_load", "Максимальная нагрузка", "Ең жоғары жүктеме", "кг", "кг", { validation: { min: 1, max: 1_000 } }),
    number("max_speed", "Максимальная скорость", "Ең жоғары жылдамдық", "км/ч", "км/сағ", { validation: visibleWhen("rental_vehicle_type", ["scooter"], { min: 1, max: 200 }) }),
    number("range_km", "Запас хода", "Жүріс қоры", "км", "км", { validation: visibleWhen("rental_vehicle_type", ["scooter"], { min: 1, max: 1_000 }) }),
  ],
  rentalEventFurniture: [
    select("event_furnishing_type", "Тип инвентаря", "Жабдық түрі", [op("furniture", "Мебель", "Жиһаз"), op("textile", "Текстиль", "Тоқыма")], { required: true }),
    select("furniture_type", "Тип мебели", "Жиһаз түрі", [op("sofa", "Диван", "Диван"), op("bed", "Кровать", "Кереует"), op("wardrobe", "Шкаф", "Шкаф"), op("table", "Стол", "Үстел"), op("chair", "Стул / кресло", "Орындық / кресло"), op("kitchen", "Кухонная мебель", "Асүй жиһазы"), op("other", "Другое", "Басқа")], { validation: visibleWhen("event_furnishing_type", ["furniture"]) }),
    select("material", "Материал мебели", "Жиһаз материалы", [op("wood", "Дерево", "Ағаш"), op("mdf", "МДФ / ЛДСП", "МДФ / ЛДСП"), op("metal", "Металл", "Металл"), op("glass", "Стекло", "Шыны"), op("mixed", "Комбинированный", "Аралас")], { validation: visibleWhen("event_furnishing_type", ["furniture"]) }),
    select("textile_type", "Тип текстиля", "Тоқыма түрі", [op("tablecloth", "Скатерти", "Дастарқандар"), op("chair-cover", "Чехлы на стулья", "Орындық қаптары"), op("drape", "Драпировка / занавес", "Драп / перде"), op("carpet", "Ковровые покрытия", "Кілем жабындары"), op("linen", "Прочий текстиль", "Басқа тоқыма")], { validation: visibleWhen("event_furnishing_type", ["textile"]) }),
    text("textile_material", "Материал текстиля", "Тоқыма материалы", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("event_furnishing_type", ["textile"], { maxLength: 120 }) }),
  ],
  rentalPhotoVideo: [
    select("photo_video_type", "Тип техники", "Техника түрі", [op("photo", "Фототехника", "Фото техника"), op("video", "Видеотехника", "Бейне техника"), op("action", "Экшн-камера", "Экшн-камера")], { required: true }),
    select("camera_type", "Тип фотокамеры", "Фотокамера түрі", [op("dslr", "Зеркальная", "Айналы"), op("mirrorless", "Беззеркальная", "Айнасыз"), op("compact", "Компактная", "Шағын"), op("instant", "Моментальная", "Жедел")], { validation: visibleWhen("photo_video_type", ["photo"]) }),
    text("mount", "Байонет", "Байонет", { filterable: true, filterMode: "search", validation: visibleWhen("photo_video_type", ["photo"]) }),
    select("video_camera_type", "Тип видеотехники", "Бейне техника түрі", [op("camcorder", "Видеокамера", "Бейнекамера"), op("cinema", "Кинокамера", "Кинокамера")], { validation: visibleWhen("photo_video_type", ["video"]) }),
    select("action_camera_type", "Тип экшн-камеры", "Экшн-камера түрі", [op("action", "Классическая", "Классикалық"), op("360", "Камера 360°", "360° камера")], { validation: visibleWhen("photo_video_type", ["action"]) }),
    select("video_resolution", "Максимальное разрешение видео", "Ең жоғары бейне ажыратымдылығы", [op("full-hd", "Full HD", "Full HD"), op("2k", "2K", "2K"), op("4k", "4K", "4K"), op("6k", "6K", "6K"), op("8k", "8K", "8K")], { validation: visibleWhen("photo_video_type", ["video", "action"]) }),
    bool("waterproof", "Водозащита", "Судан қорғау", { validation: visibleWhen("photo_video_type", ["action"]) }),
  ],
  rentalGeneratorCompressor: [
    select("power_equipment_type", "Тип оборудования", "Жабдық түрі", [op("generator", "Генератор", "Генератор"), op("compressor", "Компрессор", "Компрессор")], { required: true }),
    select("fuel", "Топливо генератора", "Генератор отыны", [op("petrol", "Бензин", "Бензин"), op("diesel", "Дизель", "Дизель"), op("gas", "Газ", "Газ"), op("hybrid", "Гибрид", "Гибрид")], { validation: visibleWhen("power_equipment_type", ["generator"]) }),
    select("phase_count", "Количество фаз", "Фаза саны", [op("one", "1 фаза", "1 фаза"), op("three", "3 фазы", "3 фаза")], { validation: visibleWhen("power_equipment_type", ["generator"]) }),
    number("compressor_pressure", "Рабочее давление", "Жұмыс қысымы", "бар", "бар", { validation: visibleWhen("power_equipment_type", ["compressor"], { min: 0.1, max: 1_000, step: 0.1 }) }),
    number("air_delivery", "Производительность по воздуху", "Ауа өнімділігі", "л/мин", "л/мин", { validation: visibleWhen("power_equipment_type", ["compressor"], { min: 1, max: 1_000_000 }) }),
    number("receiver_volume", "Объём ресивера", "Ресивер көлемі", "л", "л", { validation: visibleWhen("power_equipment_type", ["compressor"], { min: 1, max: 100_000 }) }),
  ],
  rentalGamingDevice: [
    select("gaming_rental_type", "Тип устройства", "Құрылғы түрі", [op("console", "Игровая приставка", "Ойын консолі"), op("vr", "VR-комплект", "VR жинағы")], { required: true }),
    select("console_form", "Исполнение приставки", "Консоль түрі", [op("home", "Стационарная", "Стационарлық"), op("portable", "Портативная", "Портативті"), op("hybrid", "Гибридная", "Гибридті")], { validation: visibleWhen("gaming_rental_type", ["console"]) }),
    select("vr_type", "Тип VR-комплекта", "VR жинағының түрі", [op("standalone", "Автономный", "Дербес"), op("pc", "Для ПК", "ДК үшін"), op("console", "Для приставки", "Консоль үшін")], { validation: visibleWhen("gaming_rental_type", ["vr"]) }),
    number("controllers_included", "Контроллеров в комплекте", "Жинақтағы контроллерлер", undefined, undefined, { validation: { min: 0, max: 20 } }),
  ],
  freeKidsGear: [
    select("kids_gear_type", "Тип детского товара", "Балалар тауарының түрі", [op("stroller", "Коляска", "Арба"), op("furniture", "Мебель", "Жиһаз"), op("care", "Товар для ухода", "Күтім тауары")], { required: true }),
    select("stroller_type", "Тип коляски", "Арба түрі", [op("carrycot", "Люлька", "Бесік арба"), op("stroller", "Прогулочная", "Серуендік"), op("transformer", "Трансформер", "Трансформер"), op("2in1", "2 в 1", "2-де 1"), op("3in1", "3 в 1", "3-де 1"), op("twins", "Для двойни", "Егіздерге")], { validation: visibleWhen("kids_gear_type", ["stroller"]) }),
    select("furniture_type", "Тип мебели", "Жиһаз түрі", [op("sofa", "Диван", "Диван"), op("bed", "Кровать", "Кереует"), op("wardrobe", "Шкаф", "Шкаф"), op("table", "Стол", "Үстел"), op("chair", "Стул / кресло", "Орындық / кресло"), op("kitchen", "Кухонная мебель", "Асүй жиһазы"), op("other", "Другое", "Басқа")], { validation: visibleWhen("kids_gear_type", ["furniture"]) }),
    select("care_item_type", "Тип товара для ухода", "Күтім тауарының түрі", [op("bathing", "Для купания", "Шомылуға"), op("feeding", "Для кормления", "Тамақтандыруға"), op("hygiene", "Для гигиены", "Гигиенаға"), op("safety", "Для безопасности", "Қауіпсіздікке"), op("other", "Другое", "Басқа")], { validation: visibleWhen("kids_gear_type", ["care"]) }),
  ],
  freePhoneComputer: [
    select("free_device_type", "Тип устройства", "Құрылғы түрі", [op("phone", "Телефон", "Телефон"), op("tablet", "Планшет", "Планшет"), op("laptop", "Ноутбук", "Ноутбук"), op("desktop", "Настольный компьютер", "Үстел компьютері"), op("accessory", "Аксессуар", "Аксессуар")], { required: true }),
    select("storage", "Встроенная память", "Ішкі жад", [op("32", "32 ГБ", "32 ГБ"), op("64", "64 ГБ", "64 ГБ"), op("128", "128 ГБ", "128 ГБ"), op("256", "256 ГБ", "256 ГБ"), op("512", "512 ГБ", "512 ГБ"), op("1024", "1 ТБ", "1 ТБ")], { validation: visibleWhen("free_device_type", ["phone", "tablet", "laptop", "desktop"]) }),
    select("ram", "Оперативная память", "Жедел жад", [op("4", "4 ГБ", "4 ГБ"), op("6", "6 ГБ", "6 ГБ"), op("8", "8 ГБ", "8 ГБ"), op("12", "12 ГБ", "12 ГБ"), op("16", "16 ГБ и больше", "16 ГБ және көп")], { validation: visibleWhen("free_device_type", ["phone", "tablet", "laptop", "desktop"]) }),
    select("sim", "SIM / eSIM", "SIM / eSIM", [op("single", "1 SIM", "1 SIM"), op("dual", "2 SIM", "2 SIM"), op("esim", "eSIM", "eSIM"), op("dual-esim", "SIM + eSIM", "SIM + eSIM")], { validation: visibleWhen("free_device_type", ["phone", "tablet"]) }),
    number("screen_size", "Диагональ экрана", "Экран диагоналі", "дюйм", "дюйм", { validation: visibleWhen("free_device_type", ["phone", "tablet", "laptop"], { min: 1, max: 100, step: 0.1 }) }),
    text("cpu", "Процессор", "Процессор", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("free_device_type", ["laptop", "desktop"], { maxLength: 120 }) }),
    text("gpu", "Видеокарта", "Бейне карта", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("free_device_type", ["laptop", "desktop"], { maxLength: 120 }) }),
  ],
  exchangeGaming: [
    select("gaming_item_type", "Тип товара", "Тауар түрі", [op("console", "Игровая приставка", "Ойын консолі"), op("game", "Игра", "Ойын"), op("vr", "VR-комплект", "VR жинағы"), op("accessory", "Аксессуар", "Аксессуар")], { required: true }),
    select("console_form", "Исполнение приставки", "Консоль түрі", [op("home", "Стационарная", "Стационарлық"), op("portable", "Портативная", "Портативті"), op("hybrid", "Гибридная", "Гибридті")], { validation: visibleWhen("gaming_item_type", ["console"]) }),
    text("game_title", "Название игры", "Ойын атауы", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("gaming_item_type", ["game"], { maxLength: 160 }) }),
    text("edition", "Издание", "Басылым", { searchable: true, validation: visibleWhen("gaming_item_type", ["game"], { maxLength: 120 }) }),
    select("vr_type", "Тип VR-комплекта", "VR жинағының түрі", [op("standalone", "Автономный", "Дербес"), op("pc", "Для ПК", "ДК үшін"), op("console", "Для приставки", "Консоль үшін")], { validation: visibleWhen("gaming_item_type", ["vr"]) }),
  ],
  rentalCostumeDecor: [
    select("rental_item_type", "Что сдаётся", "Не жалға беріледі", [op("costume", "Костюм", "Костюм"), op("decor", "Декор", "Безендіру")], { required: true }),
    text("size", "Размер костюма", "Костюм өлшемі", { filterable: true, filterMode: "search", validation: visibleWhen("rental_item_type", ["costume"]) }),
    select("season", "Сезон костюма", "Костюм маусымы", [op("summer", "Лето", "Жаз"), op("demi", "Демисезон", "Маусымаралық"), op("winter", "Зима", "Қыс"), op("all", "Всесезон", "Барлық маусым")], { validation: visibleWhen("rental_item_type", ["costume"]) }),
    text("decor_style", "Стиль / тематика декора", "Декор стилі / тақырыбы", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("rental_item_type", ["decor"], { maxLength: 160 }) }),
    text("dimensions", "Размеры декора", "Декор өлшемдері", { searchable: true, validation: visibleWhen("rental_item_type", ["decor"], { maxLength: 120 }) }),
  ],
  rentalStrollerSeat: [
    select("child_item_type", "Тип товара", "Тауар түрі", [op("stroller", "Коляска", "Арба"), op("car-seat", "Автокресло", "Автоорындық")], { required: true }),
    select("stroller_type", "Тип коляски", "Арба түрі", [op("carrycot", "Люлька", "Бесік арба"), op("stroller", "Прогулочная", "Серуендік"), op("transformer", "Трансформер", "Трансформер"), op("2in1", "2 в 1", "2-де 1"), op("3in1", "3 в 1", "3-де 1"), op("twins", "Для двойни", "Егіздерге")], { validation: visibleWhen("child_item_type", ["stroller"]) }),
    select("age_group", "Возраст для коляски", "Арбаға арналған жас", [op("0-6m", "0–6 месяцев", "0–6 ай"), op("6-36m", "6–36 месяцев", "6–36 ай")], { validation: visibleWhen("child_item_type", ["stroller"]) }),
    select("weight_group", "Группа автокресла", "Автоорындық тобы", [op("0", "0 (до 10 кг)", "0 (10 кг дейін)"), op("0+", "0+ (до 13 кг)", "0+ (13 кг дейін)"), op("1", "1 (9–18 кг)", "1 (9–18 кг)"), op("2-3", "2/3 (15–36 кг)", "2/3 (15–36 кг)"), op("universal", "Универсальная", "Әмбебап")], { validation: visibleWhen("child_item_type", ["car-seat"]) }),
    bool("isofix", "ISOFIX", "ISOFIX", { validation: visibleWhen("child_item_type", ["car-seat"]) }),
  ],
  rentalComputerProjector: [
    select("rental_equipment_type", "Тип оборудования", "Жабдық түрі", [op("computer", "Компьютер", "Компьютер"), op("projector", "Проектор", "Проектор")], { required: true }),
    text("cpu", "Процессор", "Процессор", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("rental_equipment_type", ["computer"]) }),
    select("ram", "Оперативная память", "Жедел жад", [op("8", "8 ГБ", "8 ГБ"), op("16", "16 ГБ", "16 ГБ"), op("32", "32 ГБ", "32 ГБ"), op("64+", "64 ГБ и больше", "64 ГБ және көп")], { validation: visibleWhen("rental_equipment_type", ["computer"]) }),
    text("gpu", "Видеокарта", "Бейне карта", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("rental_equipment_type", ["computer"]) }),
    number("storage_capacity", "Объём накопителя", "Жинақтауыш көлемі", "ГБ", "ГБ", { validation: visibleWhen("rental_equipment_type", ["computer"]) }),
    number("screen_size", "Диагональ проекции", "Проекция диагоналі", "дюйм", "дюйм", { validation: visibleWhen("rental_equipment_type", ["projector"]) }),
    select("resolution", "Разрешение", "Ажыратымдылық", [op("hd", "HD", "HD"), op("full-hd", "Full HD", "Full HD"), op("2k", "2K / QHD", "2K / QHD"), op("4k", "4K", "4K"), op("8k", "8K", "8K")], { validation: visibleWhen("rental_equipment_type", ["projector"]) }),
    select("projector_technology", "Технология проектора", "Проектор технологиясы", [op("lcd", "LCD", "LCD"), op("dlp", "DLP", "DLP"), op("lcos", "LCoS", "LCoS"), op("led", "LED", "LED"), op("laser", "Лазерный", "Лазерлік")], { validation: visibleWhen("rental_equipment_type", ["projector"]) }),
    number("refresh_rate", "Частота обновления", "Жаңарту жиілігі", "Гц", "Гц", { validation: visibleWhen("rental_equipment_type", ["projector"]) }),
  ],
  rentalSoundLight: [
    select("event_equipment_type", "Тип оборудования", "Жабдық түрі", [op("sound", "Звуковое", "Дыбыстық"), op("light", "Световое", "Жарық")], { required: true }),
    select("audio_type", "Тип звукового оборудования", "Дыбыстық жабдық түрі", [op("headphones", "Наушники", "Құлаққап"), op("speaker", "Колонка", "Динамик"), op("system", "Акустическая система", "Акустикалық жүйе"), op("amplifier", "Усилитель / ресивер", "Күшейткіш / ресивер")], { validation: visibleWhen("event_equipment_type", ["sound"]) }),
    select("connection", "Подключение", "Қосылу", [op("wired", "Проводное", "Сымды"), op("wireless", "Беспроводное", "Сымсыз"), op("both", "Оба варианта", "Екі нұсқа")], { validation: visibleWhen("event_equipment_type", ["sound"]) }),
    select("lighting_type", "Тип светового оборудования", "Жарық жабдығының түрі", [op("chandelier", "Люстра / декоративный свет", "Аспашам / сәндік жарық"), op("lamp", "Прожектор / светильник", "Прожектор / шам"), op("floor", "Стойка / напольный свет", "Тіреу / едендік жарық"), op("outdoor", "Уличное", "Сыртқы")], { validation: visibleWhen("event_equipment_type", ["light"]) }),
    select("light_source", "Источник света", "Жарық көзі", [op("led", "LED", "LED"), op("bulb", "Лампа", "Шам"), op("integrated", "Встроенный LED", "Кіріктірілген LED")], { validation: visibleWhen("event_equipment_type", ["light"]) }),
    number("power", "Мощность света", "Жарық қуаты", "Вт", "Вт", { validation: visibleWhen("event_equipment_type", ["light"]) }),
  ],
  rentalSportsTourism: [
    select("rental_activity_type", "Назначение инвентаря", "Жабдық мақсаты", [op("sport", "Спорт", "Спорт"), op("tourism", "Туризм", "Туризм")], { required: true }),
    text("sport", "Вид спорта", "Спорт түрі", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("rental_activity_type", ["sport"]) }),
    text("product_type", "Тип спортивного инвентаря", "Спорт жабдығының түрі", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("rental_activity_type", ["sport"]) }),
    text("gear_type", "Тип туристического снаряжения", "Туристік жабдық түрі", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("rental_activity_type", ["tourism"]) }),
    select("season", "Сезон", "Маусым", [op("summer", "Лето", "Жаз"), op("winter", "Зима", "Қыс"), op("three-season", "Три сезона", "Үш маусым"), op("all", "Всесезон", "Барлық маусым")], { validation: visibleWhen("rental_activity_type", ["tourism"]) }),
    number("capacity", "Вместимость", "Сыйымдылығы", undefined, undefined, { validation: visibleWhen("rental_activity_type", ["tourism"]) }),
    text("dimensions", "Размеры", "Өлшемдері", { searchable: true, validation: visibleWhen("rental_activity_type", ["tourism"]) }),
    text("material", "Материал", "Материалы", { filterable: true, searchable: true, filterMode: "search", validation: visibleWhen("rental_activity_type", ["tourism"]) }),
    bool("waterproof", "Водонепроницаемый", "Су өткізбейді", { validation: visibleWhen("rental_activity_type", ["tourism"]) }),
  ],
  exchangeMobileDevice: [
    select("mobile_device_type", "Тип устройства", "Құрылғы түрі", [op("phone", "Телефон", "Телефон"), op("tablet", "Планшет", "Планшет")], { required: true }),
    select("storage", "Встроенная память", "Ішкі жад", [op("32", "32 ГБ", "32 ГБ"), op("64", "64 ГБ", "64 ГБ"), op("128", "128 ГБ", "128 ГБ"), op("256", "256 ГБ", "256 ГБ"), op("512", "512 ГБ", "512 ГБ"), op("1024", "1 ТБ", "1 ТБ")]),
    select("ram", "Оперативная память", "Жедел жад", [op("4", "4 ГБ", "4 ГБ"), op("6", "6 ГБ", "6 ГБ"), op("8", "8 ГБ", "8 ГБ"), op("12", "12 ГБ", "12 ГБ"), op("16", "16 ГБ и больше", "16 ГБ және көп")]),
    select("sim", "SIM / eSIM", "SIM / eSIM", [op("single", "1 SIM", "1 SIM"), op("dual", "2 SIM", "2 SIM"), op("esim", "eSIM", "eSIM"), op("dual-esim", "SIM + eSIM", "SIM + eSIM")], { validation: visibleWhen("mobile_device_type", ["phone"]) }),
    bool("stylus_included", "Стилус в комплекте", "Стилус жинақта", { validation: visibleWhen("mobile_device_type", ["tablet"]) }),
  ],
  exchangePropertyMixed: [
    select("exchange_property_type", "Тип недвижимости", "Жылжымайтын мүлік түрі", [op("land", "Земельный участок", "Жер телімі"), op("commercial", "Коммерческий объект", "Коммерциялық нысан")], { required: true }),
    number("land_area", "Площадь участка", "Жер телімінің ауданы", "сот.", "сот.", { validation: visibleWhen("exchange_property_type", ["land"]) }),
    select("land_purpose", "Назначение участка", "Телім мақсаты", [op("housing", "ИЖС", "Жеке тұрғын үй"), op("farm", "Крестьянское хозяйство", "Шаруа қожалығы"), op("garden", "Садоводство", "Бағбандық"), op("commercial", "Коммерческое", "Коммерциялық"), op("other", "Другое", "Басқа")], { validation: visibleWhen("exchange_property_type", ["land"]) }),
    select("access_road", "Подъезд", "Кірме жол", [op("asphalt", "Асфальт", "Асфальт"), op("gravel", "Грунтовая дорога", "Топырақ жол"), op("none", "Нет дороги", "Жол жоқ")], { validation: visibleWhen("exchange_property_type", ["land"]) }),
    select("commercial_type", "Тип объекта", "Нысан түрі", [op("office", "Офис", "Кеңсе"), op("retail", "Магазин", "Дүкен"), op("warehouse", "Склад", "Қойма"), op("production", "Производство", "Өндіріс"), op("catering", "Общепит", "Қоғамдық тамақтану"), op("free", "Свободного назначения", "Еркін мақсаттағы")], { validation: visibleWhen("exchange_property_type", ["commercial"]) }),
    number("total_area", "Площадь объекта", "Нысан ауданы", "м²", "м²", { validation: visibleWhen("exchange_property_type", ["commercial"]) }),
    number("floor", "Этаж", "Қабат", undefined, undefined, { validation: visibleWhen("exchange_property_type", ["commercial"]) }),
    bool("separate_entrance", "Отдельный вход", "Жеке кіреберіс", { validation: visibleWhen("exchange_property_type", ["commercial"]) }),
    select("renovation", "Состояние", "Күйі", [op("none", "Без ремонта", "Жөндеусіз"), op("cosmetic", "Косметический", "Косметикалық"), op("good", "Хорошее", "Жақсы"), op("designer", "Дизайнерский", "Дизайнерлік"), op("rough", "Без отделки", "Әрлеусіз"), op("repair", "Требует ремонта", "Жөндеуді қажет етеді"), op("excellent", "Отличное", "Өте жақсы")], { validation: visibleWhen("exchange_property_type", ["commercial"]) }),
    bool("parking", "Парковка", "Тұрақ бар", { validation: visibleWhen("exchange_property_type", ["commercial"]) }),
    bool("utilities", "Коммуникации", "Коммуникациялар бар", { validation: visibleWhen("exchange_property_type", ["commercial"]) }),
  ],
  rentalGoods: [select("billing_period", "Тариф", "Тариф", [op("hour", "За час", "Сағатына"), op("day", "За сутки", "Тәулігіне"), op("week", "За неделю", "Аптасына"), op("month", "За месяц", "Айына"), op("agreement", "Договорной", "Келісімді")], { required: true }), number("minimum_term", "Минимальный срок", "Ең аз мерзім"), number("deposit", "Залог", "Кепіл", "₸", "₸"), bool("documents_required", "Нужны документы", "Құжаттар қажет"), bool("delivery", "Доставка", "Жеткізу"), bool("operator_included", "Оператор / водитель включён", "Оператор / жүргізуші кіреді"), CONDITION],
  equipment: [BRAND_TEXT, MODEL_TEXT, YEAR, CONDITION, number("power", "Мощность", "Қуаты", "кВт", "кВт"), text("capacity", "Производительность / характеристики", "Өнімділігі / сипаттамалары", { searchable: true })],
  businessCommercials: [
    select("operating_status", "Статус бизнеса", "Бизнес мәртебесі", [op("active", "Работает", "Жұмыс істейді"), op("suspended", "Приостановлен", "Тоқтатылған"), op("startup", "Запуск / стартап", "Іске қосу / стартап"), op("closed", "Не работает", "Жұмыс істемейді")], { required: true }),
    select("legal_form", "Организационная форма", "Ұйымдық нысаны", [op("ip", "ИП", "ЖК"), op("too", "ТОО", "ЖШС"), op("ao", "АО", "АҚ"), op("farm", "КХ / фермерское хозяйство", "ШҚ / фермерлік шаруашылық"), op("individual", "Физлицо", "Жеке тұлға"), op("other", "Другая", "Басқа")]),
    number("staff_count", "Количество сотрудников", "Қызметкерлер саны", undefined, undefined, { validation: { min: 0, max: 1_000_000 } }),
    number("monthly_revenue", "Средняя выручка в месяц", "Айлық орташа түсім", "₸", "₸", { validation: { min: 0, max: 90_000_000_000 } }),
    number("monthly_profit", "Средняя прибыль в месяц", "Айлық орташа пайда", "₸", "₸", { validation: { min: -90_000_000_000, max: 90_000_000_000 } }),
    number("financial_period", "Период финансовых данных", "Қаржылық деректер кезеңі", "мес.", "ай", { validation: { min: 1, max: 120 } }),
    bool("financial_documents", "Финансовые документы доступны", "Қаржылық құжаттар қолжетімді"),
    number("payback_months", "Срок окупаемости", "Өтелу мерзімі", "мес.", "ай", { validation: { min: 1, max: 1_200 } }),
    select("debt_status", "Долги и обязательства", "Қарыздар мен міндеттемелер", [op("none", "Нет", "Жоқ"), op("disclosed", "Есть, раскрыты", "Бар, ашық көрсетілген"), op("unknown", "Не указано", "Көрсетілмеген")]),
    text("reason_for_sale", "Причина продажи", "Сату себебі", { searchable: true, validation: { maxLength: 500 } }),
  ],
  readyBusiness: [text("industry", "Отрасль", "Сала", { filterable: true, searchable: true, filterMode: "search", required: true }), select("premises", "Помещение", "Үй-жай", [op("owned", "В собственности", "Меншікте"), op("rented", "В аренде", "Жалдауда"), op("none", "Не требуется", "Қажет емес")]), bool("equipment_included", "Оборудование включено", "Жабдық кіреді"), number("business_age", "Срок работы", "Жұмыс мерзімі", "лет", "жыл")],
  free: [select("condition", "Состояние", "Күйі", [op("good", "Можно использовать", "Қолдануға болады"), op("repair", "Требует ремонта", "Жөндеуді қажет етеді")])],
  exchange: [text("wanted", "На что хотите обменять", "Не нәрсеге айырбастайсыз", { required: true, searchable: true, validation: { maxLength: 240 } })],
} satisfies Record<string, SeedAttributeDefinition[]>;

export type CategorySchemaProfile = keyof typeof profiles;

const rootDefaults: Record<string, CategorySchemaProfile[]> = {
  transport: ["transportSimple"], parts: ["autoPart"], "real-estate": ["flatSale", "propertyDocsUtilities"], jobs: ["job", "professionalRequirements"],
  services: ["serviceBase", "serviceProfessional"], electronics: ["goodsBrand"], "home-garden": ["goods"], personal: ["clothing"],
  kids: ["kidsClothing"], hobby: ["sportsGoods"], animals: ["pet"], business: ["equipment"],
  free: ["free"], exchange: ["exchange"], "construction-repair": ["buildingMaterial"],
  "goods-rental": ["rentalGoods"],
};

const profileAssignments: Record<string, CategorySchemaProfile[]> = {
  transport: ["transportSimple"],
  cars: ["passengerCar", "vehicleCompliance"], "cars-sedan": ["passengerCar", "vehicleCompliance"], "cars-suv": ["passengerCar", "vehicleCompliance"], "cars-hatchback": ["passengerCar", "vehicleCompliance"], "cars-wagon": ["passengerCar", "vehicleCompliance"], "cars-minivan": ["passengerCar", "vehicleCompliance"], "cars-coupe": ["passengerCar", "vehicleCompliance"], "cars-cabriolet": ["passengerCar", "vehicleCompliance"], "cars-pickup": ["passengerCar", "vehicleCompliance"],
  motorcycles: ["motorcycle"], "road-motorcycles": ["motorcycle"], scooters: ["motorcycle"], atv: ["motorcycle"], snowmobiles: ["motorcycle"],
  "commercial-transport": ["commercialVehicle"], trucks: ["commercialVehicle"], buses: ["commercialVehicle", "passengerCommercial"], minibuses: ["commercialVehicle", "passengerCommercial"], trailers: ["trailer"],
  "special-transport": ["machinery"], "construction-machinery": ["machinery"], "road-machinery": ["machinery"], "warehouse-machinery": ["machinery"], "municipal-machinery": ["machinery"], "agricultural-transport": ["machinery"], tractors: ["machinery"], harvesters: ["machinery"], "agro-attachments": ["machinery"],
  "water-transport": ["transportSimple"], "air-transport": ["transportSimple"], "other-transport": ["transportSimple"],

  parts: ["autoPart"], "car-parts": ["autoPart"], "engine-parts": ["autoPart"], "transmission-parts": ["autoPart"], "suspension-parts": ["autoPart"], "body-parts": ["autoPart"], "auto-electrics": ["autoPart"], optics: ["autoPart"], "interior-parts": ["autoPart"], "tires-wheels": ["tires"], "car-accessories": ["goodsBrand"], "oils-fluids": ["fluids"], "moto-parts": ["motoPart"], "special-parts": ["commercialPart"], "auto-dismantling": ["dismantling"],

  "real-estate": ["flatSale", "propertyDocsUtilities"], "property-sale": ["flatSale", "propertyDocsUtilities"], "flats-sale": ["flatSale", "propertyDocsUtilities"], "rooms-sale": ["room", "propertyDocsUtilities"], "houses-sale": ["house", "propertyDocsUtilities"], "land-sale": ["land", "propertyDocsUtilities"], "commercial-sale": ["commercialProperty", "propertyDocsUtilities"], "garages-sale": ["garage", "propertyDocsUtilities"],
  "property-rent": ["flatSale", "rentTerms"], "flats-rent": ["flatSale", "rentTerms"], "houses-rent": ["house", "rentTerms"], "rooms-rent": ["room", "rentTerms"], "commercial-rent": ["commercialRentalProperty", "rentTerms"],
  "property-daily": ["flatSale", "dailyTerms"], "flats-daily": ["flatSale", "dailyTerms"], "houses-daily": ["house", "dailyTerms"], "rooms-daily": ["room", "dailyTerms"],

  jobs: ["job", "professionalRequirements"], "jobs-logistics": ["job", "professionalRequirements"], "jobs-sales": ["job", "professionalRequirements"], "jobs-construction": ["job", "professionalRequirements"], "jobs-production": ["job", "professionalRequirements"], "jobs-it": ["job", "professionalRequirements"], "jobs-finance": ["job", "professionalRequirements"], "jobs-education": ["job", "professionalRequirements"], "jobs-medicine": ["job", "professionalRequirements"], "jobs-horeca": ["job", "professionalRequirements"], "jobs-security": ["job", "professionalRequirements"], "jobs-domestic": ["job", "professionalRequirements"], "jobs-agriculture": ["job", "professionalRequirements"], "jobs-office": ["job", "professionalRequirements"], "jobs-marketing": ["job", "professionalRequirements"], "jobs-temporary": ["job", "professionalRequirements"], "jobs-remote": ["job", "professionalRequirements"],

  services: ["serviceBase", "serviceProfessional"], "repair-construction-services": ["serviceBase", "repairService", "serviceProfessional"], "apartment-renovation": ["serviceBase", "repairService", "serviceProfessional"], "plumbing-services": ["serviceBase", "repairService", "serviceProfessional"], "electrical-services": ["serviceBase", "repairService", "serviceProfessional"], "windows-doors-services": ["serviceBase", "repairService", "serviceProfessional"], "finishing-services": ["serviceBase", "repairService", "serviceProfessional"],
  "household-services": ["serviceBase"], "appliance-repair": ["serviceBase", "repairService"], "auto-services": ["serviceBase", "repairService"], "transport-services": ["serviceBase", "transportService"], "beauty-health-services": ["serviceBase", "beautyService"], "education-services": ["serviceBase", "educationService"], "it-services": ["serviceBase", "professionalService"], "photo-video-services": ["serviceBase", "professionalService"], "legal-services": ["serviceBase", "professionalService"], "accounting-services": ["serviceBase", "professionalService"], "event-services": ["serviceBase", "professionalService"], "cleaning-services": ["serviceBase", "cleaningService"], "pet-services": ["serviceBase", "professionalService"], "furniture-services": ["serviceBase", "repairService"], "agro-services": ["serviceBase", "professionalService"], "business-services": ["serviceBase", "professionalService"],

  electronics: ["goodsBrand"], "phones-accessories": ["goodsBrand"], smartphones: ["smartphone", "deviceSpecs"], "mobile-phones": ["smartphone", "deviceSpecs"], "phone-cases": ["goodsBrand"], "phone-chargers": ["goodsBrand"], "screen-protectors": ["goodsBrand"], "smart-watches": ["smartWatch"],
  computers: ["computer"], laptops: ["laptop", "computerDeviceSpecs"], "desktop-computers": ["computer"], "all-in-one": ["computer", "display", "computerDeviceSpecs"], "computer-components": ["component"], monitors: ["display"], "computer-peripherals": ["goodsBrand"], "storage-devices": ["component"], "network-equipment": ["goodsBrand"],
  "photo-video": ["camera"], cameras: ["camera"], lenses: ["lens"], "video-cameras": ["videoCamera"], "action-cameras": ["videoCamera", "actionCamera"], "photo-accessories": ["goodsBrand"],
  "tv-video": ["display"], televisions: ["display", "tv"], projectors: ["projector"], "tv-boxes": ["goodsBrand"], "media-players": ["goodsBrand"], audio: ["audio"], headphones: ["audio"], "portable-speakers": ["audio"], "speaker-systems": ["audio"], amplifiers: ["audio"], gaming: ["gaming"], "game-consoles": ["gaming"], "video-games": ["gaming"], "gaming-accessories": ["gaming"], "tablets-ereaders": ["smartphone"], "home-appliances": ["appliance"], "kitchen-appliances": ["appliance"], "climate-equipment": ["appliance"], "personal-care-electronics": ["appliance"],

  "home-garden": ["goods"], furniture: ["furniture"], interior: ["goods"], lighting: ["lighting"], textiles: ["goods"], dishes: ["goods"], "household-goods": ["goods"], "household-chemicals": ["goods"], "indoor-plants": ["gardenGoods"], garden: ["gardenGoods"], "garden-tools": ["tool"], "office-supplies": ["goods"], "food-drinks": ["goods"],
  personal: ["clothing"], "women-clothing": ["clothing"], "men-clothing": ["clothing"], "underwear-swimwear": ["clothing"], workwear: ["clothing"], "women-shoes": ["shoes"], "men-shoes": ["shoes"], headwear: ["clothing"], bags: ["bags"], "fashion-accessories": ["bags"], "watches-jewelry": ["jewelry"], wedding: ["clothing"], "beauty-products": ["goodsBrand"],
  kids: ["kidsClothing"], "kids-clothing": ["kidsClothing"], "kids-shoes": ["kidsClothing"], strollers: ["stroller"], "car-seats": ["carSeat"], toys: ["toy"], feeding: ["goodsBrand"], "kids-furniture": ["furniture"], school: ["goods"], "baby-care": ["goodsBrand"], "kids-transport": ["bicycle"],
  hobby: ["sportsGoods"], sports: ["sportsGoods"], bicycles: ["bicycle"], tourism: ["sportsGoods"], fishing: ["sportsGoods"], hunting: ["sportsGoods"], "musical-instruments": ["instrument"], books: ["goods"], collecting: ["goods"], "board-games": ["goodsBrand"], tickets: ["ticket"], handmade: ["goods"],
  animals: ["pet", "liveAnimalDetails"], cats: ["pet", "liveAnimalDetails"], dogs: ["pet", "liveAnimalDetails"], birds: ["smallAnimal", "liveAnimalDetails"], "fish-aquariums": ["smallAnimal", "liveAnimalDetails"], rodents: ["smallAnimal", "liveAnimalDetails"], reptiles: ["smallAnimal", "liveAnimalDetails"], "farm-animals": ["farmAnimal", "liveAnimalDetails"], "pet-supplies": ["animalSupply"], "lost-found-pets": ["lostPet"],
  business: ["equipment"], "retail-equipment": ["equipment"], "industrial-equipment": ["equipment"], "food-equipment": ["equipment"], "agro-equipment": ["equipment"], "medical-equipment": ["equipment"], "beauty-equipment": ["equipment"], "office-equipment": ["equipment"], "tools-materials": ["tool"], "raw-materials": ["consumableLot"], containers: ["productCore"], "ready-business": ["readyBusiness", "businessCommercials"],
  free: ["free"], "free-home": ["free", "furniture"], "free-clothes": ["free", "clothing"], "free-kids": ["free", "kidsClothing"], "free-electronics": ["free", "goodsBrand"], "free-other": ["free"],
  exchange: ["exchange"], "exchange-transport": ["exchange", "transportSimple"], "exchange-property": ["exchange", "flatSale"], "exchange-electronics": ["exchange", "goodsBrand"], "exchange-other": ["exchange", "goods"],
};

export function resolveCategoryAttributeSchema(slug: string, rootSlug: string): {
  profileNames: CategorySchemaProfile[];
  attributes: SeedAttributeDefinition[];
} {
  const requestedProfiles = masterCatalogProfileAssignments[slug] ?? profileAssignments[slug] ?? rootDefaults[rootSlug] ?? ["goods"];
  const unknownProfiles = requestedProfiles.filter((profileName) => !(profileName in profiles));
  if (unknownProfiles.length) throw new Error(`Unknown category profile for ${slug}: ${unknownProfiles.join(", ")}`);
  const profileNames = requestedProfiles as CategorySchemaProfile[];
  const effective = new Map<string, SeedAttributeDefinition>();
  for (const profileName of profileNames) {
    for (const attribute of profiles[profileName]) effective.set(attribute.key, attribute);
  }
  return { profileNames, attributes: [...effective.values()] };
}

export const categorySchemaProfiles = profiles;
export const categoryProfileAssignments = profileAssignments;
