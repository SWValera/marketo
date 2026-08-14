import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  Building2,
  CarFront,
  Cat,
  Gift,
  Handshake,
  House,
  Laptop,
  Shirt,
  Sofa,
  Volleyball,
  Wrench,
} from "lucide-react";

export type FilterOption = { value: string; label: { ru: string; kk: string } };

export type CategoryFilter = {
  id: string;
  label: { ru: string; kk: string };
  type: "select" | "checkbox";
  options?: FilterOption[];
};

export type CategoryConfig = {
  slug: string;
  name: { ru: string; kk: string };
  shortName: { ru: string; kk: string };
  count: string;
  icon: LucideIcon;
  tone: string;
  searchPlaceholder: { ru: string; kk: string };
  titlePlaceholder: { ru: string; kk: string };
  descriptionHint: { ru: string; kk: string };
  filters: CategoryFilter[];
};

const option = (value: string, ru: string, kk: string = ru): FilterOption => ({ value, label: { ru, kk } });
const select = (id: string, ru: string, options: FilterOption[], kk: string = ru): CategoryFilter => ({ id, type: "select", label: { ru, kk }, options });
const checkbox = (id: string, ru: string, kk: string = ru): CategoryFilter => ({ id, type: "checkbox", label: { ru, kk } });

export const categoryConfigs: CategoryConfig[] = [
  {
    slug: "transport", name: { ru: "Транспорт", kk: "Көлік" }, shortName: { ru: "Авто", kk: "Авто" }, count: "12 540", icon: CarFront, tone: "blue",
    searchPlaceholder: { ru: "Например, Toyota Camry", kk: "Мысалы, Toyota Camry" },
    titlePlaceholder: { ru: "Например, Toyota Camry 2020", kk: "Мысалы, Toyota Camry 2020" },
    descriptionHint: { ru: "Укажите состояние, пробег, комплектацию и историю обслуживания.", kk: "Күйін, жүрісін, жинақтамасын және қызмет көрсету тарихын көрсетіңіз." },
    filters: [
      select("brand", "Марка", [option("toyota", "Toyota"), option("hyundai", "Hyundai"), option("kia", "Kia"), option("lexus", "Lexus"), option("chevrolet", "Chevrolet")]),
      select("year", "Год выпуска", [option("2024", "2024 и новее"), option("2020", "2020–2023"), option("2015", "2015–2019"), option("older", "До 2015")]),
      select("transmission", "Коробка передач", [option("automatic", "Автомат", "Автомат"), option("manual", "Механика", "Механика")]),
      select("drive", "Привод", [option("front", "Передний", "Алдыңғы"), option("rear", "Задний", "Артқы"), option("all", "Полный", "Толық")]),
    ],
  },
  {
    slug: "real-estate", name: { ru: "Недвижимость", kk: "Жылжымайтын мүлік" }, shortName: { ru: "Недвижимость", kk: "Жылжымайтын мүлік" }, count: "8 120", icon: Building2, tone: "amber",
    searchPlaceholder: { ru: "Например, 2-комнатная квартира", kk: "Мысалы, 2 бөлмелі пәтер" },
    titlePlaceholder: { ru: "Например, 2-комнатная квартира, 56 м²", kk: "Мысалы, 2 бөлмелі пәтер, 56 м²" },
    descriptionHint: { ru: "Опишите площадь, этаж, ремонт, район и условия сделки.", kk: "Ауданын, қабатын, жөндеуін, ауданын және мәміле шарттарын сипаттаңыз." },
    filters: [
      select("deal", "Тип сделки", [option("sale", "Продажа", "Сату"), option("rent", "Аренда", "Жалдау")]),
      select("property", "Тип недвижимости", [option("flat", "Квартира", "Пәтер"), option("house", "Дом", "Үй"), option("commercial", "Коммерческая", "Коммерциялық")]),
      select("rooms", "Комнаты", [option("1", "1 комната", "1 бөлме"), option("2", "2 комнаты", "2 бөлме"), option("3", "3 комнаты", "3 бөлме"), option("4", "4 и больше", "4 және көп")]),
    ],
  },
  {
    slug: "electronics", name: { ru: "Электроника", kk: "Электроника" }, shortName: { ru: "Электроника", kk: "Электроника" }, count: "15 230", icon: Laptop, tone: "cyan",
    searchPlaceholder: { ru: "Например, iPhone 15", kk: "Мысалы, iPhone 15" },
    titlePlaceholder: { ru: "Например, iPhone 15 Pro 256GB", kk: "Мысалы, iPhone 15 Pro 256GB" },
    descriptionHint: { ru: "Укажите модель, память, комплект, состояние и гарантию.", kk: "Моделін, жадын, жинағын, күйін және кепілдігін көрсетіңіз." },
    filters: [select("device", "Тип устройства", [option("phone", "Смартфоны", "Смартфондар"), option("computer", "Компьютеры", "Компьютерлер"), option("tv", "Телевизоры", "Теледидарлар")]), select("condition", "Состояние", [option("new", "Новое", "Жаңа"), option("used", "Б/у", "Қолданылған")])],
  },
  {
    slug: "home-garden", name: { ru: "Для дома и сада", kk: "Үй және бақша" }, shortName: { ru: "Дом и сад", kk: "Үй және бақша" }, count: "10 340", icon: Sofa, tone: "green",
    searchPlaceholder: { ru: "Например, диван, холодильник", kk: "Мысалы, диван, тоңазытқыш" },
    titlePlaceholder: { ru: "Например, раскладной диван", kk: "Мысалы, жиналмалы диван" },
    descriptionHint: { ru: "Опишите размеры, материал, состояние и возможность доставки.", kk: "Өлшемін, материалын, күйін және жеткізу мүмкіндігін сипаттаңыз." },
    filters: [select("homeType", "Раздел", [option("furniture", "Мебель", "Жиһаз"), option("appliances", "Бытовая техника", "Тұрмыстық техника"), option("garden", "Сад и огород", "Бақша")]), checkbox("delivery", "Есть доставка", "Жеткізу бар")],
  },
  {
    slug: "personal", name: { ru: "Личные вещи", kk: "Жеке заттар" }, shortName: { ru: "Личные вещи", kk: "Жеке заттар" }, count: "7 230", icon: Shirt, tone: "rose",
    searchPlaceholder: { ru: "Например, зимняя куртка", kk: "Мысалы, қысқы күрте" },
    titlePlaceholder: { ru: "Например, зимняя куртка, размер M", kk: "Мысалы, қысқы күрте, M өлшемі" },
    descriptionHint: { ru: "Укажите размер, бренд, материал и состояние.", kk: "Өлшемін, брендін, материалын және күйін көрсетіңіз." },
    filters: [select("audience", "Для кого", [option("women", "Женщинам", "Әйелдерге"), option("men", "Мужчинам", "Ерлерге"), option("children", "Детям", "Балаларға")]), select("condition", "Состояние", [option("new", "Новое", "Жаңа"), option("used", "Б/у", "Қолданылған")])],
  },
  {
    slug: "jobs", name: { ru: "Работа", kk: "Жұмыс" }, shortName: { ru: "Работа", kk: "Жұмыс" }, count: "5 340", icon: BriefcaseBusiness, tone: "violet",
    searchPlaceholder: { ru: "Например, водитель, продавец, бухгалтер", kk: "Мысалы, жүргізуші, сатушы, бухгалтер" },
    titlePlaceholder: { ru: "Например, водитель категории C", kk: "Мысалы, C санатты жүргізуші" },
    descriptionHint: { ru: "Опишите обязанности, график, требования и условия оплаты.", kk: "Міндеттерді, кестені, талаптарды және төлем шарттарын сипаттаңыз." },
    filters: [
      select("employment", "Тип занятости", [option("full", "Полная", "Толық"), option("part", "Частичная", "Жартылай"), option("shift", "Вахта", "Вахта")]),
      select("schedule", "График", [option("5-2", "5/2"), option("2-2", "2/2"), option("flex", "Гибкий", "Икемді")]),
      select("experience", "Опыт", [option("none", "Без опыта", "Тәжірибесіз"), option("1", "От 1 года", "1 жылдан"), option("3", "От 3 лет", "3 жылдан")]),
      checkbox("remote", "Удалённая работа", "Қашықтан жұмыс"),
    ],
  },
  {
    slug: "services", name: { ru: "Услуги", kk: "Қызметтер" }, shortName: { ru: "Услуги", kk: "Қызметтер" }, count: "9 870", icon: Wrench, tone: "orange",
    searchPlaceholder: { ru: "Например, ремонт квартир, сантехник", kk: "Мысалы, пәтер жөндеу, сантехник" },
    titlePlaceholder: { ru: "Например, ремонт кондиционеров", kk: "Мысалы, кондиционер жөндеу" },
    descriptionHint: { ru: "Опишите состав услуги, опыт, выезд и от какой суммы работаете.", kk: "Қызмет құрамын, тәжірибені, шығуды және бастапқы бағаны сипаттаңыз." },
    filters: [select("serviceType", "Вид услуги", [option("repair", "Ремонт и строительство", "Жөндеу және құрылыс"), option("transport", "Перевозки", "Тасымалдау"), option("beauty", "Красота и здоровье", "Сұлулық және денсаулық")]), checkbox("visit", "Выезд к клиенту", "Клиентке бару"), select("priceType", "Оплата", [option("fixed", "Фиксированная", "Тұрақты"), option("hour", "Почасовая", "Сағаттық"), option("agreement", "Договорная", "Келісімді")])],
  },
  {
    slug: "hobby", name: { ru: "Хобби и отдых", kk: "Хобби және демалыс" }, shortName: { ru: "Хобби", kk: "Хобби" }, count: "4 610", icon: Volleyball, tone: "lime",
    searchPlaceholder: { ru: "Например, велосипед, гитара", kk: "Мысалы, велосипед, гитара" }, titlePlaceholder: { ru: "Например, горный велосипед", kk: "Мысалы, тау велосипеді" }, descriptionHint: { ru: "Опишите модель, состояние и комплект.", kk: "Моделін, күйін және жинағын сипаттаңыз." },
    filters: [select("hobbyType", "Раздел", [option("sport", "Спорт", "Спорт"), option("music", "Музыка", "Музыка"), option("travel", "Туризм", "Туризм")])],
  },
  {
    slug: "business", name: { ru: "Для бизнеса", kk: "Бизнеске арналған" }, shortName: { ru: "Для бизнеса", kk: "Бизнеске" }, count: "3 980", icon: House, tone: "indigo",
    searchPlaceholder: { ru: "Например, торговое оборудование", kk: "Мысалы, сауда жабдығы" }, titlePlaceholder: { ru: "Например, холодильная витрина", kk: "Мысалы, тоңазытқыш витрина" }, descriptionHint: { ru: "Укажите назначение, характеристики, состояние и документы.", kk: "Мақсатын, сипаттамаларын, күйін және құжаттарын көрсетіңіз." },
    filters: [select("businessType", "Тип оборудования", [option("retail", "Торговое", "Сауда"), option("production", "Производственное", "Өндірістік"), option("office", "Офисное", "Кеңселік")])],
  },
  {
    slug: "animals", name: { ru: "Животные", kk: "Жануарлар" }, shortName: { ru: "Животные", kk: "Жануарлар" }, count: "2 760", icon: Cat, tone: "yellow",
    searchPlaceholder: { ru: "Например, котёнок", kk: "Мысалы, марғау" }, titlePlaceholder: { ru: "Например, котёнок британской породы", kk: "Мысалы, британдық марғау" }, descriptionHint: { ru: "Укажите возраст, породу, прививки и особенности ухода.", kk: "Жасын, тұқымын, екпелерін және күтім ерекшеліктерін көрсетіңіз." },
    filters: [select("animalType", "Вид животного", [option("cats", "Кошки", "Мысықтар"), option("dogs", "Собаки", "Иттер"), option("farm", "Сельхозживотные", "Ауыл шаруашылық жануарлары")])],
  },
  {
    slug: "free", name: { ru: "Отдам даром", kk: "Тегін беремін" }, shortName: { ru: "Даром", kk: "Тегін" }, count: "1 330", icon: Gift, tone: "pink",
    searchPlaceholder: { ru: "Что вы хотите забрать?", kk: "Нені алғыңыз келеді?" }, titlePlaceholder: { ru: "Например, книги в хорошем состоянии", kk: "Мысалы, жақсы күйдегі кітаптар" }, descriptionHint: { ru: "Опишите состояние и условия передачи.", kk: "Күйін және беру шарттарын сипаттаңыз." }, filters: [select("freeType", "Раздел", [option("home", "Для дома", "Үйге"), option("clothes", "Одежда", "Киім"), option("other", "Другое", "Басқа")])],
  },
  {
    slug: "exchange", name: { ru: "Обмен", kk: "Айырбас" }, shortName: { ru: "Обмен", kk: "Айырбас" }, count: "940", icon: Handshake, tone: "teal",
    searchPlaceholder: { ru: "Что хотите обменять?", kk: "Нені айырбастағыңыз келеді?" }, titlePlaceholder: { ru: "Например, обменяю ноутбук на смартфон", kk: "Мысалы, ноутбукты смартфонға айырбастаймын" }, descriptionHint: { ru: "Опишите предмет и желаемые варианты обмена.", kk: "Затты және қалаған айырбас нұсқаларын сипаттаңыз." }, filters: [select("exchangeType", "Категория обмена", [option("electronics", "Электроника", "Электроника"), option("transport", "Транспорт", "Көлік"), option("other", "Другое", "Басқа")])],
  },
];

export const allSearchPlaceholder = {
  ru: "Найти товар, услугу или работу…",
  kk: "Тауарды, қызметті немесе жұмысты табу…",
};

export function getCategoryBySlug(slug?: string | null) {
  return categoryConfigs.find((category) => category.slug === slug);
}

export function getCategoryByName(name?: string | null) {
  return categoryConfigs.find((category) => category.name.ru === name || category.name.kk === name);
}
