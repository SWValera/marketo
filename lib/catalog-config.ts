export type LocalizedText = { ru: string; kk?: string };

export type AttributeOption = { value: string; label: LocalizedText };
export type AttributeDefinition = {
  id: string;
  label: LocalizedText;
  type: "select" | "checkbox" | "number" | "text";
  unit?: LocalizedText;
  required?: boolean;
  filterable?: boolean;
  options?: AttributeOption[];
};

export type CategoryNode = {
  slug: string;
  name: LocalizedText;
  icon?: string;
  tone?: string;
  searchPlaceholder?: LocalizedText;
  titlePlaceholder?: LocalizedText;
  descriptionHint?: LocalizedText;
  attributeSet?: keyof typeof attributeSets;
  priceMode?: "price" | "salary" | "free" | "exchange";
  children?: CategoryNode[];
};

const t = (ru: string, kk?: string): LocalizedText => ({ ru, kk });
const option = (value: string, ru: string, kk?: string): AttributeOption => ({ value, label: t(ru, kk) });
const select = (id: string, ru: string, options: AttributeOption[], required = false): AttributeDefinition => ({ id, label: t(ru), type: "select", options, required, filterable: true });
const number = (id: string, ru: string, unit?: string, required = false): AttributeDefinition => ({ id, label: t(ru), type: "number", unit: unit ? t(unit) : undefined, required, filterable: true });
const text = (id: string, ru: string, required = false): AttributeDefinition => ({ id, label: t(ru), type: "text", required, filterable: false });
const checkbox = (id: string, ru: string): AttributeDefinition => ({ id, label: t(ru), type: "checkbox", filterable: true });

export const attributeSets = {
  goods: [select("condition", "Состояние", [option("new", "Новое", "Жаңа"), option("used", "Б/у", "Қолданылған")], true)],
  car: [
    select("brand", "Марка", [option("toyota", "Toyota"), option("hyundai", "Hyundai"), option("kia", "Kia"), option("chevrolet", "Chevrolet"), option("lexus", "Lexus"), option("lada", "Lada"), option("other", "Другая")], true),
    number("year", "Год выпуска", "год", true), number("mileage", "Пробег", "км"),
    select("fuel", "Топливо", [option("petrol", "Бензин"), option("diesel", "Дизель"), option("hybrid", "Гибрид"), option("electric", "Электро")]),
    select("transmission", "Коробка передач", [option("automatic", "Автомат"), option("manual", "Механика"), option("variator", "Вариатор"), option("robot", "Робот")]),
    select("drive", "Привод", [option("front", "Передний"), option("rear", "Задний"), option("all", "Полный")]),
    select("body", "Кузов", [option("sedan", "Седан"), option("suv", "Кроссовер / внедорожник"), option("hatch", "Хэтчбек"), option("wagon", "Универсал"), option("minivan", "Минивэн"), option("pickup", "Пикап")]),
  ],
  moto: [number("year", "Год выпуска", "год"), number("engine", "Объём двигателя", "см³"), number("mileage", "Пробег", "км")],
  parts: [select("condition", "Состояние", [option("new", "Новое"), option("used", "Б/у")], true), select("partType", "Тип детали", [option("original", "Оригинал"), option("analogue", "Аналог"), option("used-original", "Оригинал Б/у")]), text("compatibility", "Марка и модель транспорта")],
  phone: [select("brand", "Бренд", [option("apple", "Apple"), option("samsung", "Samsung"), option("xiaomi", "Xiaomi"), option("honor", "Honor"), option("other", "Другой")], true), select("memory", "Память", [option("64", "64 ГБ"), option("128", "128 ГБ"), option("256", "256 ГБ"), option("512", "512 ГБ и больше")]), select("condition", "Состояние", [option("new", "Новое"), option("used", "Б/у"), option("parts", "На запчасти")], true)],
  computer: [select("deviceType", "Тип устройства", [option("laptop", "Ноутбук"), option("desktop", "Компьютер"), option("component", "Комплектующее")]), select("condition", "Состояние", [option("new", "Новое"), option("used", "Б/у")], true), text("model", "Модель / характеристики")],
  property: [select("deal", "Тип сделки", [option("sale", "Продажа"), option("rent", "Долгосрочная аренда"), option("daily", "Посуточная аренда")], true), select("propertyType", "Тип объекта", [option("flat", "Квартира"), option("house", "Дом"), option("room", "Комната"), option("land", "Участок"), option("commercial", "Коммерческая недвижимость"), option("garage", "Гараж / паркинг")], true), number("rooms", "Количество комнат"), number("area", "Площадь", "м²", true), number("floor", "Этаж"), number("floors", "Этажность дома"), select("condition", "Состояние", [option("new", "Новостройка"), option("good", "Хорошее"), option("repair", "Требует ремонта")])],
  job: [select("employment", "Тип занятости", [option("full", "Полная"), option("part", "Частичная"), option("temporary", "Временная"), option("internship", "Стажировка")], true), select("schedule", "График", [option("5-2", "5/2"), option("2-2", "2/2"), option("shift", "Вахта"), option("flexible", "Гибкий")]), select("experience", "Опыт", [option("none", "Без опыта"), option("1", "От 1 года"), option("3", "От 3 лет"), option("6", "От 6 лет")]), checkbox("remote", "Удалённая работа"), select("payPeriod", "Период оплаты", [option("month", "В месяц"), option("shift", "За смену"), option("hour", "За час")])],
  service: [select("priceType", "Стоимость", [option("fixed", "Фиксированная"), option("from", "От указанной суммы"), option("hour", "За час"), option("agreement", "Договорная")]), checkbox("visit", "Выезд к клиенту"), select("format", "Формат", [option("onsite", "На месте"), option("online", "Онлайн"), option("both", "Онлайн и на месте")])],
  fashion: [select("audience", "Для кого", [option("women", "Женщинам"), option("men", "Мужчинам"), option("unisex", "Унисекс")]), text("size", "Размер"), select("condition", "Состояние", [option("new", "Новое"), option("used", "Б/у")], true)],
  kids: [select("age", "Возраст", [option("0-1", "До 1 года"), option("1-3", "1–3 года"), option("3-6", "3–6 лет"), option("7-12", "7–12 лет"), option("teen", "Подросткам")]), select("condition", "Состояние", [option("new", "Новое"), option("used", "Б/у")], true)],
  animal: [select("animalType", "Вид животного", [option("cats", "Кошки"), option("dogs", "Собаки"), option("birds", "Птицы"), option("fish", "Рыбы"), option("farm", "Сельскохозяйственные")], true), number("age", "Возраст", "мес."), select("gender", "Пол", [option("male", "Самец"), option("female", "Самка")]), checkbox("documents", "Есть документы / ветпаспорт")],
  business: [select("condition", "Состояние", [option("new", "Новое"), option("used", "Б/у")], true), text("manufacturer", "Производитель / модель"), number("year", "Год выпуска", "год")],
  free: [select("condition", "Состояние", [option("good", "Можно использовать"), option("repair", "Требует ремонта")])],
  exchange: [text("wanted", "На что хотите обменять", true)],
} satisfies Record<string, AttributeDefinition[]>;

const leaf = (slug: string, ru: string, attributeSet?: CategoryNode["attributeSet"]): CategoryNode => ({ slug, name: t(ru), attributeSet });
const group = (slug: string, ru: string, kk: string | undefined, children: CategoryNode[], attributeSet?: CategoryNode["attributeSet"]): CategoryNode => ({ slug, name: t(ru, kk), children, attributeSet });

export const categoryTree: CategoryNode[] = [
  {
    slug: "transport", name: t("Транспорт", "Көлік"), icon: "car", tone: "blue", attributeSet: "car",
    searchPlaceholder: t("Марка, модель или вид транспорта", "Көлік маркасы, моделі немесе түрі"), titlePlaceholder: t("Например, Toyota Camry 2020"), descriptionHint: t("Укажите состояние, пробег, комплектацию и историю обслуживания."),
    children: [
      group("cars", "Легковые автомобили", "Жеңіл автомобильдер", [leaf("cars-sedan", "Седаны", "car"), leaf("cars-suv", "Кроссоверы и внедорожники", "car"), leaf("cars-hatchback", "Хэтчбеки", "car"), leaf("cars-wagon", "Универсалы", "car"), leaf("cars-minivan", "Минивэны", "car"), leaf("cars-pickup", "Пикапы", "car")], "car"),
      group("motorcycles", "Мотоциклы и мототехника", "Мотоциклдер", [leaf("road-motorcycles", "Дорожные мотоциклы", "moto"), leaf("scooters", "Скутеры и мопеды", "moto"), leaf("atv", "Квадроциклы и багги", "moto"), leaf("snowmobiles", "Снегоходы", "moto")], "moto"),
      group("commercial-transport", "Коммерческий транспорт", "Коммерциялық көлік", [leaf("trucks", "Грузовые автомобили", "car"), leaf("buses", "Автобусы", "car"), leaf("minibuses", "Микроавтобусы", "car"), leaf("trailers", "Прицепы и полуприцепы", "goods")]),
      group("special-transport", "Спецтехника", "Арнайы техника", [leaf("construction-machinery", "Строительная техника", "business"), leaf("road-machinery", "Дорожная техника", "business"), leaf("warehouse-machinery", "Погрузчики и складская техника", "business"), leaf("municipal-machinery", "Коммунальная техника", "business")]),
      group("agricultural-transport", "Сельхозтехника", "Ауыл шаруашылық техникасы", [leaf("tractors", "Тракторы", "business"), leaf("harvesters", "Комбайны", "business"), leaf("agro-attachments", "Навесное оборудование", "business")]),
      leaf("water-transport", "Водный транспорт", "goods"), leaf("air-transport", "Воздушный транспорт", "goods"), leaf("other-transport", "Другой транспорт", "goods"),
    ],
  },
  {
    slug: "parts", name: t("Запчасти и аксессуары", "Қосалқы бөлшектер"), icon: "settings", tone: "slate", attributeSet: "parts", searchPlaceholder: t("Название детали, марка или артикул"), titlePlaceholder: t("Например, передние фары для Toyota Camry"), descriptionHint: t("Укажите совместимость, производителя, состояние и артикул."),
    children: [group("car-parts", "Автозапчасти", "Автобөлшектер", [leaf("engine-parts", "Двигатель и навесное", "parts"), leaf("transmission-parts", "Трансмиссия", "parts"), leaf("suspension-parts", "Подвеска и рулевое", "parts"), leaf("body-parts", "Кузовные детали", "parts"), leaf("auto-electrics", "Автоэлектрика", "parts"), leaf("optics", "Оптика и освещение", "parts"), leaf("interior-parts", "Салон", "parts")], "parts"), leaf("tires-wheels", "Шины, диски и колёса", "parts"), leaf("car-accessories", "Аксессуары для авто", "parts"), leaf("oils-fluids", "Масла и технические жидкости", "parts"), leaf("moto-parts", "Мотозапчасти", "parts"), leaf("special-parts", "Запчасти для спец- и сельхозтехники", "parts"), leaf("auto-dismantling", "Авторазборы", "parts")],
  },
  {
    slug: "real-estate", name: t("Недвижимость", "Жылжымайтын мүлік"), icon: "building", tone: "amber", attributeSet: "property", searchPlaceholder: t("Квартира, дом, участок или помещение"), titlePlaceholder: t("Например, 2-комнатная квартира, 56 м²"), descriptionHint: t("Опишите площадь, этаж, ремонт, район и условия сделки."),
    children: [group("property-sale", "Продажа", "Сату", [leaf("flats-sale", "Квартиры", "property"), leaf("houses-sale", "Дома и коттеджи", "property"), leaf("rooms-sale", "Комнаты", "property"), leaf("land-sale", "Земельные участки", "property"), leaf("commercial-sale", "Коммерческая недвижимость", "property"), leaf("garages-sale", "Гаражи и парковочные места", "property")], "property"), group("property-rent", "Долгосрочная аренда", "Ұзақ мерзімді жалға алу", [leaf("flats-rent", "Квартиры", "property"), leaf("houses-rent", "Дома", "property"), leaf("rooms-rent", "Комнаты", "property"), leaf("commercial-rent", "Коммерческие помещения", "property")], "property"), group("property-daily", "Посуточная аренда", "Тәуліктік жалға алу", [leaf("flats-daily", "Квартиры", "property"), leaf("houses-daily", "Дома и коттеджи", "property"), leaf("rooms-daily", "Комнаты", "property")], "property")],
  },
  {
    slug: "jobs", name: t("Работа", "Жұмыс"), icon: "briefcase", tone: "violet", attributeSet: "job", priceMode: "salary", searchPlaceholder: t("Должность, профессия или компания"), titlePlaceholder: t("Например, водитель категории C"), descriptionHint: t("Укажите обязанности, график, требования и условия оплаты."),
    children: [leaf("jobs-logistics", "Транспорт, логистика и склад", "job"), leaf("jobs-sales", "Продажи и закупки", "job"), leaf("jobs-construction", "Строительство и ремонт", "job"), leaf("jobs-production", "Производство и рабочие специальности", "job"), leaf("jobs-it", "IT и телеком", "job"), leaf("jobs-finance", "Финансы и бухгалтерия", "job"), leaf("jobs-education", "Образование и наука", "job"), leaf("jobs-medicine", "Медицина и фармацевтика", "job"), leaf("jobs-horeca", "Рестораны и гостиницы", "job"), leaf("jobs-security", "Охрана и безопасность", "job"), leaf("jobs-domestic", "Домашний персонал", "job"), leaf("jobs-agriculture", "Сельское хозяйство", "job"), leaf("jobs-office", "Административная работа", "job"), leaf("jobs-marketing", "Маркетинг и реклама", "job"), leaf("jobs-temporary", "Подработка и временная работа", "job"), leaf("jobs-remote", "Удалённая работа", "job")],
  },
  {
    slug: "services", name: t("Услуги", "Қызметтер"), icon: "wrench", tone: "green", attributeSet: "service", searchPlaceholder: t("Например, ремонт квартир или электрик"), titlePlaceholder: t("Например, ремонт кондиционеров с выездом"), descriptionHint: t("Опишите состав услуги, сроки, опыт и порядок расчёта."),
    children: [group("repair-construction-services", "Ремонт и строительство", "Жөндеу және құрылыс", [leaf("apartment-renovation", "Ремонт квартир", "service"), leaf("plumbing-services", "Сантехника", "service"), leaf("electrical-services", "Электрика", "service"), leaf("windows-doors-services", "Окна и двери", "service"), leaf("finishing-services", "Отделочные работы", "service")], "service"), leaf("household-services", "Бытовые услуги", "service"), leaf("appliance-repair", "Ремонт техники", "service"), leaf("auto-services", "Автоуслуги", "service"), leaf("transport-services", "Перевозки и грузчики", "service"), leaf("beauty-health-services", "Красота и здоровье", "service"), leaf("education-services", "Обучение и репетиторы", "service"), leaf("it-services", "IT и интернет", "service"), leaf("photo-video-services", "Фото и видео", "service"), leaf("legal-services", "Юридические услуги", "service"), leaf("accounting-services", "Бухгалтерские услуги", "service"), leaf("event-services", "Организация мероприятий", "service"), leaf("cleaning-services", "Уборка", "service"), leaf("pet-services", "Услуги для животных", "service"), leaf("furniture-services", "Изготовление и ремонт мебели", "service"), leaf("agro-services", "Сельскохозяйственные услуги", "service"), leaf("business-services", "Деловые услуги", "service")],
  },
  {
    slug: "electronics", name: t("Электроника", "Электроника"), icon: "laptop", tone: "cyan", attributeSet: "goods", searchPlaceholder: t("Телефон, ноутбук или бытовая техника"), titlePlaceholder: t("Например, iPhone 15 256 ГБ"), descriptionHint: t("Укажите модель, состояние, комплектацию и гарантию."),
    children: [group("phones-accessories", "Телефоны и аксессуары", "Телефондар мен аксессуарлар", [leaf("smartphones", "Смартфоны", "phone"), leaf("mobile-phones", "Мобильные телефоны", "phone"), leaf("phone-cases", "Чехлы", "goods"), leaf("phone-chargers", "Зарядные устройства и кабели", "goods"), leaf("screen-protectors", "Защитные стёкла", "goods"), leaf("smart-watches", "Смарт-часы и фитнес-браслеты", "goods")]), group("computers", "Компьютеры", "Компьютерлер", [leaf("laptops", "Ноутбуки", "computer"), leaf("desktop-computers", "Настольные компьютеры", "computer"), leaf("all-in-one", "Моноблоки", "computer"), leaf("computer-components", "Комплектующие", "computer"), leaf("monitors", "Мониторы", "goods"), leaf("computer-peripherals", "Клавиатуры и мыши", "goods"), leaf("storage-devices", "Накопители", "goods"), leaf("network-equipment", "Сетевое оборудование", "goods")]), group("photo-video", "Фото и видео", "Фото және видео", [leaf("cameras", "Фотоаппараты", "goods"), leaf("lenses", "Объективы", "goods"), leaf("video-cameras", "Видеокамеры", "goods"), leaf("action-cameras", "Экшн-камеры", "goods"), leaf("photo-accessories", "Аксессуары", "goods")]), group("tv-video", "TV и видео", "TV және видео", [leaf("televisions", "Телевизоры", "goods"), leaf("projectors", "Проекторы", "goods"), leaf("tv-boxes", "ТВ-приставки", "goods"), leaf("media-players", "Медиаплееры", "goods")]), group("audio", "Аудиотехника", "Аудиотехника", [leaf("headphones", "Наушники", "goods"), leaf("portable-speakers", "Портативные колонки", "goods"), leaf("speaker-systems", "Акустические системы", "goods"), leaf("amplifiers", "Усилители и ресиверы", "goods")]), group("gaming", "Игры", "Ойындар", [leaf("game-consoles", "Игровые приставки", "goods"), leaf("video-games", "Игры", "goods"), leaf("gaming-accessories", "Игровые аксессуары", "goods")]), leaf("tablets-ereaders", "Планшеты и электронные книги", "goods"), leaf("home-appliances", "Техника для дома", "goods"), leaf("kitchen-appliances", "Техника для кухни", "goods"), leaf("climate-equipment", "Климатическая техника", "goods"), leaf("personal-care-electronics", "Техника для ухода", "goods")],
  },
  {
    slug: "home-garden", name: t("Дом и сад", "Үй және бақша"), icon: "sofa", tone: "rose", attributeSet: "goods", searchPlaceholder: t("Мебель, посуда или товары для сада"), titlePlaceholder: t("Например, раскладной диван"), descriptionHint: t("Опишите размеры, материал, состояние и возможность доставки."),
    children: [leaf("furniture", "Мебель", "goods"), leaf("interior", "Предметы интерьера", "goods"), leaf("lighting", "Освещение", "goods"), leaf("textiles", "Текстиль", "goods"), leaf("dishes", "Посуда и кухонная утварь", "goods"), leaf("household-goods", "Хозяйственные товары", "goods"), leaf("household-chemicals", "Бытовая химия", "goods"), leaf("indoor-plants", "Комнатные растения", "goods"), leaf("garden", "Сад и огород", "goods"), leaf("garden-tools", "Садовый инвентарь", "goods"), leaf("office-supplies", "Канцтовары", "goods"), leaf("food-drinks", "Продукты и напитки", "goods")],
  },
  {
    slug: "personal", name: t("Мода и стиль", "Сән және стиль"), icon: "shirt", tone: "pink", attributeSet: "fashion", searchPlaceholder: t("Одежда, обувь или аксессуары"), titlePlaceholder: t("Например, зимняя куртка, размер M"), descriptionHint: t("Укажите размер, бренд, материал и состояние."),
    children: [leaf("women-clothing", "Женская одежда", "fashion"), leaf("women-shoes", "Женская обувь", "fashion"), leaf("men-clothing", "Мужская одежда", "fashion"), leaf("men-shoes", "Мужская обувь", "fashion"), leaf("underwear-swimwear", "Бельё и купальники", "fashion"), leaf("headwear", "Головные уборы", "fashion"), leaf("bags", "Сумки и рюкзаки", "fashion"), leaf("fashion-accessories", "Аксессуары", "fashion"), leaf("watches-jewelry", "Часы и украшения", "fashion"), leaf("wedding", "Всё для свадьбы", "fashion"), leaf("beauty-products", "Красота и здоровье", "goods"), leaf("workwear", "Спецодежда и спецобувь", "fashion")],
  },
  {
    slug: "kids", name: t("Детский мир", "Балалар әлемі"), icon: "baby", tone: "yellow", attributeSet: "kids", searchPlaceholder: t("Коляска, игрушка или детская одежда"), titlePlaceholder: t("Например, прогулочная коляска"), descriptionHint: t("Укажите возраст, состояние, комплект и размеры."),
    children: [leaf("kids-clothing", "Детская одежда", "kids"), leaf("kids-shoes", "Детская обувь", "kids"), leaf("strollers", "Коляски", "kids"), leaf("car-seats", "Автокресла", "kids"), leaf("toys", "Игрушки", "kids"), leaf("feeding", "Кормление", "kids"), leaf("kids-furniture", "Детская мебель", "kids"), leaf("school", "Школа и канцелярия", "kids"), leaf("baby-care", "Уход за ребёнком", "kids"), leaf("kids-transport", "Детский транспорт", "kids")],
  },
  {
    slug: "hobby", name: t("Хобби, отдых и спорт", "Хобби, демалыс және спорт"), icon: "ball", tone: "lime", attributeSet: "goods", searchPlaceholder: t("Велосипед, гитара, книга или спортинвентарь"), titlePlaceholder: t("Например, горный велосипед"), descriptionHint: t("Опишите модель, состояние и комплект."),
    children: [leaf("sports", "Спорт и фитнес", "goods"), leaf("bicycles", "Велосипеды", "goods"), leaf("tourism", "Туризм и кемпинг", "goods"), leaf("fishing", "Рыбалка", "goods"), leaf("hunting", "Охота", "goods"), leaf("musical-instruments", "Музыкальные инструменты", "goods"), leaf("books", "Книги и журналы", "goods"), leaf("collecting", "Коллекционирование", "goods"), leaf("board-games", "Настольные игры", "goods"), leaf("tickets", "Билеты", "goods"), leaf("handmade", "Рукоделие", "goods")],
  },
  {
    slug: "animals", name: t("Животные", "Жануарлар"), icon: "paw", tone: "orange", attributeSet: "animal", searchPlaceholder: t("Порода или вид животного"), titlePlaceholder: t("Например, котёнок британской породы"), descriptionHint: t("Укажите возраст, породу, прививки, документы и особенности ухода."),
    children: [leaf("cats", "Кошки", "animal"), leaf("dogs", "Собаки", "animal"), leaf("birds", "Птицы", "animal"), leaf("fish-aquariums", "Рыбы и аквариумы", "animal"), leaf("rodents", "Грызуны", "animal"), leaf("reptiles", "Рептилии", "animal"), leaf("farm-animals", "Сельскохозяйственные животные", "animal"), leaf("pet-supplies", "Товары для животных", "goods"), leaf("lost-found-pets", "Потерялись / найдены", "animal")],
  },
  {
    slug: "business", name: t("Бизнес и оборудование", "Бизнес және жабдық"), icon: "factory", tone: "indigo", attributeSet: "business", searchPlaceholder: t("Оборудование, сырьё или готовый бизнес"), titlePlaceholder: t("Например, холодильная витрина"), descriptionHint: t("Укажите назначение, характеристики, состояние и документы."),
    children: [leaf("retail-equipment", "Торговое оборудование", "business"), leaf("industrial-equipment", "Промышленное оборудование", "business"), leaf("food-equipment", "Оборудование для общепита", "business"), leaf("agro-equipment", "Фермерское оборудование", "business"), leaf("medical-equipment", "Медицинское оборудование", "business"), leaf("beauty-equipment", "Оборудование для салонов", "business"), leaf("office-equipment", "Офисное оборудование", "business"), leaf("tools-materials", "Инструменты и материалы", "business"), leaf("raw-materials", "Сырьё", "business"), leaf("containers", "Тара и упаковка", "business"), leaf("ready-business", "Готовый бизнес", "business")],
  },
  { slug: "free", name: t("Отдам бесплатно", "Тегін беремін"), icon: "gift", tone: "green", attributeSet: "free", priceMode: "free", searchPlaceholder: t("Что хотите забрать?"), titlePlaceholder: t("Например, книги в хорошем состоянии"), descriptionHint: t("Честно опишите состояние и условия передачи."), children: [leaf("free-home", "Для дома", "free"), leaf("free-clothes", "Одежда и обувь", "free"), leaf("free-kids", "Детское", "free"), leaf("free-electronics", "Электроника", "free"), leaf("free-other", "Другое", "free")] },
  { slug: "exchange", name: t("Обмен", "Айырбас"), icon: "repeat", tone: "teal", attributeSet: "exchange", priceMode: "exchange", searchPlaceholder: t("Что хотите обменять?"), titlePlaceholder: t("Например, обменяю ноутбук на смартфон"), descriptionHint: t("Опишите предмет, его состояние и желаемые варианты обмена."), children: [leaf("exchange-transport", "Транспорт", "exchange"), leaf("exchange-property", "Недвижимость", "exchange"), leaf("exchange-electronics", "Электроника", "exchange"), leaf("exchange-other", "Другое", "exchange")] },
];

type CategoryIndexEntry = { node: CategoryNode; parent?: CategoryNode; root: CategoryNode };
const categoryIndex = new Map<string, CategoryIndexEntry>();
function indexCategories(nodes: CategoryNode[], root?: CategoryNode, parent?: CategoryNode) {
  for (const node of nodes) {
    const actualRoot = root ?? node;
    categoryIndex.set(node.slug, { node, parent, root: actualRoot });
    if (node.children) indexCategories(node.children, actualRoot, node);
  }
}
indexCategories(categoryTree);

export const allSearchPlaceholder = t("Найти товар, услугу или работу…", "Тауарды, қызметті немесе жұмысты табу…");
export const categoryCount = categoryIndex.size;
export const topCategorySummaries = categoryTree.map(({ slug, name, icon, tone, searchPlaceholder }) => ({ slug, name, icon, tone, searchPlaceholder }));
export const categoryOptions = [...categoryIndex.values()].map(({ node, parent, root }) => ({
  slug: node.slug,
  name: node.name,
  parentSlug: parent?.slug,
  rootSlug: root.slug,
  depth: getCategoryPath(node.slug).length - 1,
}));
export function getCategoryBySlug(slug?: string | null) { return slug ? categoryIndex.get(slug)?.node : undefined; }
export function getCategoryRoot(slug?: string | null) { return slug ? categoryIndex.get(slug)?.root : undefined; }
export function getCategoryParent(slug?: string | null) { return slug ? categoryIndex.get(slug)?.parent : undefined; }
export function getCategoryPath(slug?: string | null) {
  const path: CategoryNode[] = [];
  let current = slug ? categoryIndex.get(slug) : undefined;
  while (current) {
    path.unshift(current.node);
    current = current.parent ? categoryIndex.get(current.parent.slug) : undefined;
  }
  return path;
}
export function getCategoryAttributes(slug?: string | null): AttributeDefinition[] {
  let current = slug ? categoryIndex.get(slug) : undefined;
  while (current) {
    if (current.node.attributeSet) return attributeSets[current.node.attributeSet];
    current = current.parent ? categoryIndex.get(current.parent.slug) : undefined;
  }
  return attributeSets.goods;
}
export function getCategoryByName(name?: string | null) {
  if (!name) return undefined;
  return [...categoryIndex.values()].find(({ node }) => node.name.ru === name || node.name.kk === name)?.node;
}
