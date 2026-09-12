import { chipsetOptions } from "./device-chip-options.ts";
import type { SeedAttributeDefinition as Attribute, SeedAttributeOption as Option } from "./category-attribute-schemas.ts";
import { graphicsOptions, processorOptions } from "./hardware-options.ts";
import { manufacturerFields } from "./manufacturer-options.ts";
const op = (value: string, ru: string, kk = ru): Option => ({ value, label: { ru, kk } });
const select = (key: string, ru: string, kk: string, options: Option[], extra: Partial<Attribute> = {}): Attribute => ({ key, label: { ru, kk }, dataType: "select", filterable: true, filterMode: "exact", options, ...extra });
const number = (key: string, ru: string, kk: string, unit: string, min: number, max: number): Attribute => ({ key, label: { ru, kk }, dataType: "number", filterable: true, filterMode: "range", unit: unit ? { ru: unit, kk: unit } : undefined, validation: { min, max } });
const when = (attribute: Attribute, values: string[]): Attribute => ({ ...attribute, validation: { ...attribute.validation, visibleWhen: { key: "component_type", values } } });
const condition = select("condition", "Состояние", "Күйі", [op("new", "Новое", "Жаңа"), op("like-new", "Как новое", "Жаңа сияқты"), op("used", "Б/у", "Қолданылған"), op("repair", "Требует ремонта", "Жөндеуді қажет етеді")], { required: true });
export const memoryCapacityOptions = [2, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128, 192, 256].map(value => op(String(value), `${value} ГБ`));
export const storageCapacityOptions = [16, 32, 64, 120, 128, 240, 250, 256, 480, 500, 512, 960, 1000, 1024, 2000, 2048, 4000, 4096, 6000, 8000, 8192, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000].map(value => op(String(value), `${value} ГБ`));
export const storageType = select("storage_type", "Тип накопителя", "Жинақтауыш түрі", [op("ssd", "SSD"), op("hdd", "HDD"), op("both", "SSD + HDD"), op("emmc", "eMMC"), op("ufs", "UFS"), op("flash", "USB Flash"), op("memory-card", "Карта памяти", "Жад картасы"), op("other", "Другой", "Басқа")]);
const storageCapacity = select("storage_capacity", "Объём накопителя", "Жинақтауыш көлемі", [...storageCapacityOptions, op("other-capacity", "Другой объём", "Басқа көлем")]);
const storageCapacityOther: Attribute = { ...number("storage_capacity_other", "Другой объём накопителя", "Жинақтауыштың басқа көлемі", "ГБ", 0.001, 1000000), validation: { min: 0.001, max: 1000000, visibleWhen: { key: "storage_capacity", values: ["other-capacity"] }, requiredWhen: { key: "storage_capacity", values: ["other-capacity"] } } };
const ddr = select("memory_type", "Тип памяти", "Жад түрі", [op("sdram", "SDRAM"), op("ddr", "DDR"), op("ddr2", "DDR2"), op("ddr3", "DDR3"), op("ddr3l", "DDR3L"), op("ddr4", "DDR4"), op("ddr5", "DDR5"), op("lpddr4x", "LPDDR4X"), op("lpddr5", "LPDDR5"), op("lpddr5x", "LPDDR5X")]);
const socket = select("socket", "Сокет", "Сокет", ["AM2", "AM2+", "AM3", "AM3+", "AM4", "AM5", "FM1", "FM2", "FM2+", "TR4", "sTRX4", "sTR5", "sWRX8", "SP3", "SP5", "LGA775", "LGA1150", "LGA1151", "LGA1155", "LGA1156", "LGA1200", "LGA1700", "LGA1851", "LGA1366", "LGA2011", "LGA2011-3", "LGA2066", "LGA3647", "LGA4189", "LGA4677", "BGA"].map(name => op(name.toLowerCase().replace(/\+/g, "-plus"), name)));
const exactModel: Attribute = { key: "model", label: { ru: "Заводская модель / артикул", kk: "Зауыттық модель / артикул" }, dataType: "text", searchable: true, filterable: true, filterMode: "search", validation: { maxLength: 100, placeholder: { ru: "Точная маркировка на плате или упаковке", kk: "Платадағы немесе қаптамадағы нақты таңбалау" } } };
export const storageFields: Attribute[] = [
  ...manufacturerFields("component"), exactModel, storageType, storageCapacity, storageCapacityOther,
  select("storage_interface", "Интерфейс", "Интерфейс", [op("sata", "SATA"), op("nvme", "PCIe / NVMe"), op("sas", "SAS"), op("ide", "IDE / PATA"), op("usb", "USB"), op("thunderbolt", "Thunderbolt"), op("sd", "SD"), op("microsd", "microSD"), op("cf", "CompactFlash"), op("cfexpress", "CFexpress"), op("other", "Другой", "Басқа")]),
  select("storage_form_factor", "Форм-фактор", "Пішін факторы", [op("2-5", '2.5"'), op("3-5", '3.5"'), op("m2-2230", "M.2 2230"), op("m2-2242", "M.2 2242"), op("m2-2260", "M.2 2260"), op("m2-2280", "M.2 2280"), op("m2-22110", "M.2 22110"), op("msata", "mSATA"), op("pcie", "PCIe card"), op("external", "Внешний", "Сыртқы"), op("memory-card", "Карта памяти", "Жад картасы"), op("other", "Другой", "Басқа")]),
  condition,
];
const hardwareCustom = (key: "cpu" | "gpu" | "chipset", value: string): Attribute => ({ key: `${key}_other`, label: { ru: "Укажите точную модель", kk: "Нақты модельді көрсетіңіз" }, dataType: "text", searchable: true,
  validation: { maxLength: 120, placeholder: { ru: "Полное обозначение с устройства", kk: "Құрылғыдағы толық белгілеу" }, visibleWhen: { key, values: [value] }, requiredWhen: { key, values: [value] } } });

export const computerComponentFields: Attribute[] = [
  select("component_type", "Тип комплектующего", "Құрамдас бөлік түрі", [op("cpu", "Процессор", "Процессор"), op("gpu", "Видеокарта", "Бейне карта"), op("ram", "Оперативная память", "Жедел жад"), op("motherboard", "Материнская плата", "Аналық тақша"), op("storage", "Накопитель", "Жинақтауыш"), op("psu", "Блок питания", "Қуат көзі"), op("case", "Корпус", "Корпус"), op("cooling", "Охлаждение", "Салқындату")], { required: true }),
  ...manufacturerFields("component"), exactModel,
  when(select("cpu", "Модель процессора", "Процессор моделі", processorOptions("desktop").filter(option => !option.value.startsWith("apple-")), { optionsLoadMode: "deferred", searchable: true, validation: { fallbackOption: "other-cpu" } }), ["cpu"]),
  hardwareCustom("cpu", "other-cpu"),
  when(socket, ["cpu", "motherboard", "cooling"]),
  when(number("cpu_cores", "Ядра", "Ядролар", "", 1, 512), ["cpu"]),
  when(number("cpu_threads", "Потоки", "Ағындар", "", 1, 1024), ["cpu"]),
  when(number("cpu_frequency", "Базовая частота", "Негізгі жиілік", "ГГц", 0.1, 10), ["cpu"]),
  when(select("gpu_chip_vendor", "Производитель GPU", "GPU өндірушісі", [op("nvidia", "NVIDIA"), op("amd", "AMD"), op("intel", "Intel")]), ["gpu"]),
  when(select("gpu", "Модель GPU", "GPU моделі", graphicsOptions("desktop").filter(option => option.value !== "integrated"), { optionsLoadMode: "deferred", searchable: true, validation: { fallbackOption: "other-gpu" } }), ["gpu"]),
  hardwareCustom("gpu", "other-gpu"),
  when(select("vram", "Видеопамять", "Бейне жады", [1,2,3,4,6,8,10,11,12,16,20,24,32,48,64,96].map(n => op(String(n), `${n} ГБ`))), ["gpu"]),
  when(select("vram_type", "Тип видеопамяти", "Бейне жадының түрі", ["DDR3","GDDR5","GDDR5X","GDDR6","GDDR6X","GDDR7","HBM","HBM2","HBM2E","HBM3"].map(name => op(name.toLowerCase(),name))), ["gpu"]),
  when(ddr, ["ram", "motherboard"]),
  when(select("ram", "Объём памяти", "Жад көлемі", memoryCapacityOptions), ["ram"]),
  when(number("memory_frequency", "Частота памяти", "Жад жиілігі", "МГц", 100, 16000), ["ram"]),
  when(number("module_count", "Количество модулей", "Модуль саны", "", 1, 32), ["ram"]),
  when(select("memory_form_factor", "Форм-фактор памяти", "Жадтың пішін факторы", [op("dimm", "DIMM"), op("sodimm", "SO-DIMM"), op("rdimm", "RDIMM"), op("lrdimm", "LRDIMM"), op("camm2", "CAMM2"), op("lpcamm2", "LPCAMM2")]), ["ram"]),
  when(select("motherboard_form_factor", "Форм-фактор платы", "Платаның пішін факторы", [op("atx", "ATX"), op("matx", "Micro-ATX"), op("mini-itx", "Mini-ITX"), op("eatx", "E-ATX"), op("ssi-ceb", "SSI CEB"), op("ssi-eeb", "SSI EEB"), op("proprietary", "Фирменный", "Фирмалық")]), ["motherboard", "case"]),
  when(select("chipset", "Чипсет", "Чипсет", chipsetOptions, { searchable: true, optionsLoadMode: "deferred", validation: { fallbackOption: "other-chipset" } }), ["motherboard"]),
  hardwareCustom("chipset", "other-chipset"),
  ...storageFields.filter(attribute => ["storage_type","storage_capacity","storage_capacity_other","storage_interface","storage_form_factor"].includes(attribute.key)).map(attribute => attribute.key === "storage_capacity_other" ? attribute : when(attribute, ["storage"])),
  when(number("psu_power", "Мощность блока питания", "Қуат көзінің қуаты", "Вт", 50, 5000), ["psu"]),
  when(select("psu_form_factor", "Форм-фактор БП", "Қуат көзінің пішіні", [op("atx", "ATX"), op("sfx", "SFX"), op("sfx-l", "SFX-L"), op("tfx", "TFX"), op("flex-atx", "Flex ATX"), op("server", "Серверный", "Серверлік")]), ["psu", "case"]),
  when(select("cooling_type", "Тип охлаждения", "Салқындату түрі", [op("air", "Воздушное", "Ауамен"), op("aio", "СЖО AIO", "AIO сұйықтық"), op("custom", "Кастомная СЖО", "Жеке сұйықтық жүйе"), op("fan", "Вентилятор", "Желдеткіш"), op("passive", "Пассивное", "Пассивті")]), ["cooling"]),
  condition,
];

