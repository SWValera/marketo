import { Sparkles } from "lucide-react";
import { categoryConfigs } from "@/lib/catalog-config";

export const categories = categoryConfigs.map((category) => ({
  ...category,
  name: category.name.ru,
}));

export type Listing = {
  id: string;
  slug: string;
  title: string;
  price: string;
  numericPrice: number;
  location: string;
  time: string;
  image: string;
  category: string;
  categorySlug: string;
  cityId: string;
  description: string;
  attributes?: Record<string, string | boolean>;
  top?: boolean;
};

export const listings: Listing[] = [
  {
    id: "mk-10345",
    slug: "toyota-camry-2020",
    title: "Toyota Camry 2020",
    price: "8 500 000 ₸",
    numericPrice: 8500000,
    location: "Алматы, Бостандыкский р-н",
    time: "Сегодня, 10:30",
    image: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1000&q=82",
    category: "Транспорт",
    categorySlug: "transport",
    cityId: "almaty",
    description: "Автомобиль в отличном состоянии. Не битый, не крашеный. Все техническое обслуживание проходило вовремя.",
    attributes: { brand: "toyota", year: "2020", transmission: "automatic", drive: "front" },
    top: true,
  },
  {
    id: "mk-10349",
    slug: "hyundai-elantra-2019",
    title: "Hyundai Elantra 2019",
    price: "6 200 000 ₸",
    numericPrice: 6200000,
    location: "Алматы, Бостандыкский р-н",
    time: "Сегодня, 09:45",
    image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1000&q=82",
    category: "Транспорт",
    categorySlug: "transport",
    cityId: "almaty",
    description: "Надёжный городской автомобиль. Один владелец, аккуратный салон, своевременное обслуживание.",
    attributes: { brand: "hyundai", year: "2015", transmission: "automatic", drive: "front" },
  },
  {
    id: "mk-10350",
    slug: "lexus-rx-300-2021",
    title: "Lexus RX 300 2021",
    price: "12 800 000 ₸",
    numericPrice: 12800000,
    location: "Алматы, Медеуский р-н",
    time: "Вчера, 20:15",
    image: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1000&q=82",
    category: "Транспорт",
    categorySlug: "transport",
    cityId: "almaty",
    description: "Кроссовер в богатой комплектации. Полная история обслуживания, два комплекта резины.",
    attributes: { brand: "lexus", year: "2020", transmission: "automatic", drive: "all" },
    top: true,
  },
  {
    id: "mk-10351",
    slug: "chevrolet-cobalt-2018",
    title: "Chevrolet Cobalt 2018",
    price: "5 300 000 ₸",
    numericPrice: 5300000,
    location: "Алматы, Турксибский р-н",
    time: "Вчера, 18:50",
    image: "https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=1000&q=82",
    category: "Транспорт",
    categorySlug: "transport",
    cityId: "almaty",
    description: "Экономичный автомобиль для города. Двигатель и коробка работают без нареканий.",
    attributes: { brand: "chevrolet", year: "2015", transmission: "automatic", drive: "front" },
  },
  {
    id: "mk-10352",
    slug: "kia-k5-2021",
    title: "Kia K5 2021",
    price: "9 700 000 ₸",
    numericPrice: 9700000,
    location: "Алматы, Ауэзовский р-н",
    time: "Вчера, 17:30",
    image: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1000&q=82",
    category: "Транспорт",
    categorySlug: "transport",
    cityId: "almaty",
    description: "Современный седан, отличное техническое состояние, чистый и ухоженный салон.",
    attributes: { brand: "kia", year: "2020", transmission: "automatic", drive: "front" },
  },
  {
    id: "mk-10346",
    slug: "dvuhkomnatnaya-kvartira",
    title: "2-комнатная квартира",
    price: "180 000 ₸ / мес.",
    numericPrice: 180000,
    location: "Алматы, Медеуский р-н",
    time: "Сегодня, 09:15",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=82",
    category: "Недвижимость",
    categorySlug: "real-estate",
    cityId: "almaty",
    description: "Светлая двухкомнатная квартира с мебелью и техникой. Удобный район, рядом магазины и остановки.",
    attributes: { deal: "rent", property: "flat", rooms: "2" },
  },
  {
    id: "mk-10347",
    slug: "iphone-13-128gb",
    title: "iPhone 13 128GB",
    price: "350 000 ₸",
    numericPrice: 350000,
    location: "Алматы, Алмалинский р-н",
    time: "Вчера, 18:45",
    image: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=1000&q=82",
    category: "Электроника",
    categorySlug: "electronics",
    cityId: "almaty",
    description: "Телефон в отличном состоянии, полный комплект. Аккумулятор держит заряд весь день.",
    attributes: { device: "phone", condition: "used" },
  },
  {
    id: "mk-10348",
    slug: "divan-v-otlichnom-sostoyanii",
    title: "Диван в отличном состоянии",
    price: "120 000 ₸",
    numericPrice: 120000,
    location: "Алматы, Ауэзовский р-н",
    time: "Вчера, 17:20",
    image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&q=82",
    category: "Для дома и сада",
    categorySlug: "home-garden",
    cityId: "almaty",
    description: "Удобный раскладной диван без повреждений. Чистый, из квартиры без животных.",
    attributes: { homeType: "furniture", delivery: true },
  },
  {
    id: "mk-10353", slug: "voditel-kategorii-c", title: "Водитель категории C", price: "350 000 ₸", numericPrice: 350000,
    location: "Петропавловск", cityId: "petropavl", time: "Сегодня, 11:20", image: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1000&q=82",
    category: "Работа", categorySlug: "jobs", description: "Требуется водитель категории C. График 5/2, официальное оформление, стабильная заработная плата.",
    attributes: { employment: "full", schedule: "5-2", experience: "1", remote: false },
  },
  {
    id: "mk-10354", slug: "remont-kondicionerov", title: "Ремонт кондиционеров", price: "от 10 000 ₸", numericPrice: 10000,
    location: "Алматы", cityId: "almaty", time: "Сегодня, 10:55", image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1000&q=82",
    category: "Услуги", categorySlug: "services", description: "Диагностика, чистка, заправка и ремонт бытовых кондиционеров с выездом по городу.",
    attributes: { serviceType: "repair", visit: true, priceType: "fixed" }, top: true,
  },
  {
    id: "mk-10355", slug: "dvuhkomnatnaya-kvartira-astana", title: "2-комнатная квартира, 56 м²", price: "28 500 000 ₸", numericPrice: 28500000,
    location: "Астана, район Есиль", cityId: "astana", time: "Сегодня, 09:40", image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=82",
    category: "Недвижимость", categorySlug: "real-estate", description: "Светлая квартира в новом доме. Чистовая отделка, закрытый двор, рядом школа и остановки.",
    attributes: { deal: "sale", property: "flat", rooms: "2" },
  },
  {
    id: "mk-10356", slug: "zimnyaya-kurtka", title: "Зимняя куртка, размер M", price: "45 000 ₸", numericPrice: 45000,
    location: "Костанай", cityId: "kostanay", time: "Вчера, 21:10", image: "https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?auto=format&fit=crop&w=1000&q=82",
    category: "Личные вещи", categorySlug: "personal", description: "Тёплая зимняя куртка в отличном состоянии. Носилась один сезон.", attributes: { audience: "men", condition: "used" },
  },
  {
    id: "mk-10357", slug: "britanskiy-kotenok", title: "Британский котёнок", price: "80 000 ₸", numericPrice: 80000,
    location: "Караганда", cityId: "karaganda", time: "Вчера, 19:35", image: "https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=1000&q=82",
    category: "Животные", categorySlug: "animals", description: "Котёнок приучен к лотку, обработан от паразитов, есть ветеринарный паспорт.", attributes: { animalType: "cats" },
  },
  {
    id: "mk-10358", slug: "gornyy-velosiped", title: "Горный велосипед", price: "190 000 ₸", numericPrice: 190000,
    location: "Усть-Каменогорск", cityId: "oskemen", time: "Вчера, 18:20", image: "https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?auto=format&fit=crop&w=1000&q=82",
    category: "Хобби и отдых", categorySlug: "hobby", description: "Алюминиевая рама, гидравлические тормоза, 27 скоростей. Полностью обслужен.", attributes: { hobbyType: "sport" },
  },
  {
    id: "mk-10359", slug: "holodilnaya-vitrina", title: "Холодильная витрина", price: "620 000 ₸", numericPrice: 620000,
    location: "Шымкент", cityId: "shymkent", time: "Вчера, 16:45", image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1000&q=82",
    category: "Для бизнеса", categorySlug: "business", description: "Рабочая холодильная витрина для магазина. Обслужена, возможна доставка.", attributes: { businessType: "retail" },
  },
  {
    id: "mk-10360", slug: "knigi-darom", title: "Книги в хорошем состоянии", price: "Бесплатно", numericPrice: 0,
    location: "Павлодар", cityId: "pavlodar", time: "Вчера, 15:10", image: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=1000&q=82",
    category: "Отдам даром", categorySlug: "free", description: "Подборка художественной литературы. Самовывоз, можно забрать все сразу.", attributes: { freeType: "other" },
  },
  {
    id: "mk-10361", slug: "obmen-noutbuka-na-smartfon", title: "Обменяю ноутбук на смартфон", price: "Обмен", numericPrice: 0,
    location: "Актобе", cityId: "aktobe", time: "Вчера, 14:25", image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1000&q=82",
    category: "Обмен", categorySlug: "exchange", description: "Рабочий ноутбук с зарядным устройством. Рассмотрю обмен на современный смартфон с моей доплатой.", attributes: { exchangeType: "electronics" },
  },
];

export const heroStats = [
  { value: "78 000+", label: "активных объявлений" },
  { value: "90", label: "городов Казахстана" },
  { value: "24/7", label: "поиск и общение" },
];

export const SparklesIcon = Sparkles;
