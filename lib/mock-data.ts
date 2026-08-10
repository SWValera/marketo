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
  Sparkles,
  Volleyball,
  Wrench,
} from "lucide-react";

export const categories = [
  { slug: "transport", name: "Транспорт", count: "12 540", icon: CarFront, tone: "blue" },
  { slug: "real-estate", name: "Недвижимость", count: "8 120", icon: Building2, tone: "amber" },
  { slug: "electronics", name: "Электроника", count: "15 230", icon: Laptop, tone: "cyan" },
  { slug: "home-garden", name: "Для дома и сада", count: "10 340", icon: Sofa, tone: "green" },
  { slug: "personal", name: "Личные вещи", count: "7 230", icon: Shirt, tone: "rose" },
  { slug: "jobs", name: "Работа", count: "5 340", icon: BriefcaseBusiness, tone: "violet" },
  { slug: "services", name: "Услуги", count: "9 870", icon: Wrench, tone: "orange" },
  { slug: "hobby", name: "Хобби и отдых", count: "4 610", icon: Volleyball, tone: "lime" },
  { slug: "business", name: "Для бизнеса", count: "3 980", icon: House, tone: "indigo" },
  { slug: "animals", name: "Животные", count: "2 760", icon: Cat, tone: "yellow" },
  { slug: "free", name: "Отдам даром", count: "1 330", icon: Gift, tone: "pink" },
  { slug: "exchange", name: "Обмен", count: "940", icon: Handshake, tone: "teal" },
];

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
  description: string;
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
    description: "Автомобиль в отличном состоянии. Не битый, не крашеный. Все техническое обслуживание проходило вовремя.",
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
    description: "Надёжный городской автомобиль. Один владелец, аккуратный салон, своевременное обслуживание.",
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
    description: "Кроссовер в богатой комплектации. Полная история обслуживания, два комплекта резины.",
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
    description: "Экономичный автомобиль для города. Двигатель и коробка работают без нареканий.",
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
    description: "Современный седан, отличное техническое состояние, чистый и ухоженный салон.",
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
    description: "Светлая двухкомнатная квартира с мебелью и техникой. Удобный район, рядом магазины и остановки.",
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
    description: "Телефон в отличном состоянии, полный комплект. Аккумулятор держит заряд весь день.",
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
    description: "Удобный раскладной диван без повреждений. Чистый, из квартиры без животных.",
  },
];

export const heroStats = [
  { value: "78 000+", label: "активных объявлений" },
  { value: "20", label: "городов Казахстана" },
  { value: "24/7", label: "поиск и общение" },
];

export const SparklesIcon = Sparkles;
