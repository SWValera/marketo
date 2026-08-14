export type LocalizedName = { ru: string; kk: string };

export type Settlement = {
  id: string;
  kato?: string;
  type: "city" | "settlement";
  name: LocalizedName;
  regionId: string;
};

export type Region = {
  id: string;
  kind: "region" | "republican_city";
  name: LocalizedName;
  settlements: Settlement[];
};

const city = (regionId: string, id: string, ru: string, kk: string = ru): Settlement => ({
  id,
  regionId,
  type: "city",
  name: { ru, kk },
});

export const KAZAKHSTAN = {
  id: "kz",
  iso2: "KZ",
  currency: "KZT",
  currencySymbol: "₸",
  name: { ru: "Казахстан", kk: "Қазақстан" },
} as const;

export const regions: Region[] = [
  { id: "astana", kind: "republican_city", name: { ru: "Астана", kk: "Астана" }, settlements: [city("astana", "astana", "Астана")] },
  { id: "almaty-city", kind: "republican_city", name: { ru: "Алматы", kk: "Алматы" }, settlements: [city("almaty-city", "almaty", "Алматы")] },
  { id: "shymkent", kind: "republican_city", name: { ru: "Шымкент", kk: "Шымкент" }, settlements: [city("shymkent", "shymkent", "Шымкент")] },
  {
    id: "abay", kind: "region", name: { ru: "Абайская область", kk: "Абай облысы" }, settlements: [
      city("abay", "semey", "Семей"), city("abay", "ayagoz", "Аягоз"), city("abay", "kurchatov", "Курчатов"), city("abay", "shar", "Шар"),
    ],
  },
  {
    id: "akmola", kind: "region", name: { ru: "Акмолинская область", kk: "Ақмола облысы" }, settlements: [
      city("akmola", "kokshetau", "Кокшетау", "Көкшетау"), city("akmola", "kosshy", "Косшы", "Қосшы"), city("akmola", "stepnogorsk", "Степногорск"), city("akmola", "atbasar", "Атбасар"), city("akmola", "akkol", "Акколь", "Ақкөл"), city("akmola", "derzhavinsk", "Державинск"), city("akmola", "ereymentau", "Ерейментау"), city("akmola", "esil", "Есиль", "Есіл"), city("akmola", "makinsk", "Макинск"), city("akmola", "shchuchinsk", "Щучинск"), city("akmola", "stepnyak", "Степняк"),
    ],
  },
  {
    id: "aktobe", kind: "region", name: { ru: "Актюбинская область", kk: "Ақтөбе облысы" }, settlements: [
      city("aktobe", "aktobe", "Актобе", "Ақтөбе"), city("aktobe", "alga", "Алга", "Алға"), city("aktobe", "kandyagash", "Кандыагаш", "Қандыағаш"), city("aktobe", "khromtau", "Хромтау"), city("aktobe", "shalkar", "Шалкар", "Шалқар"), city("aktobe", "temir", "Темир", "Темір"), city("aktobe", "emba", "Эмба", "Ембі"), city("aktobe", "zhem", "Жем"),
    ],
  },
  {
    id: "almaty-region", kind: "region", name: { ru: "Алматинская область", kk: "Алматы облысы" }, settlements: [
      city("almaty-region", "konaev", "Конаев", "Қонаев"), city("almaty-region", "alatau", "Алатау"), city("almaty-region", "kaskelen", "Каскелен", "Қаскелең"), city("almaty-region", "talgar", "Талгар", "Талғар"), city("almaty-region", "esik", "Есик", "Есік"),
    ],
  },
  { id: "atyrau", kind: "region", name: { ru: "Атырауская область", kk: "Атырау облысы" }, settlements: [city("atyrau", "atyrau", "Атырау"), city("atyrau", "kulsary", "Кульсары", "Құлсары")] },
  {
    id: "east-kazakhstan", kind: "region", name: { ru: "Восточно-Казахстанская область", kk: "Шығыс Қазақстан облысы" }, settlements: [
      city("east-kazakhstan", "oskemen", "Усть-Каменогорск", "Өскемен"), city("east-kazakhstan", "ridder", "Риддер"), city("east-kazakhstan", "altai", "Алтай"), city("east-kazakhstan", "serebryansk", "Серебрянск"), city("east-kazakhstan", "shemonaikha", "Шемонаиха"), city("east-kazakhstan", "zaysan", "Зайсан"),
    ],
  },
  {
    id: "zhambyl", kind: "region", name: { ru: "Жамбылская область", kk: "Жамбыл облысы" }, settlements: [
      city("zhambyl", "taraz", "Тараз"), city("zhambyl", "karatau", "Каратау", "Қаратау"), city("zhambyl", "zhanatas", "Жанатас"), city("zhambyl", "shu", "Шу"),
    ],
  },
  {
    id: "zhetisu", kind: "region", name: { ru: "Жетысуская область", kk: "Жетісу облысы" }, settlements: [
      city("zhetisu", "taldykorgan", "Талдыкорган", "Талдықорған"), city("zhetisu", "tekeli", "Текели"), city("zhetisu", "zharkent", "Жаркент"), city("zhetisu", "usharal", "Ушарал", "Үшарал"), city("zhetisu", "sarkan", "Саркан", "Сарқан"), city("zhetisu", "ushtobe", "Уштобе", "Үштөбе"),
    ],
  },
  { id: "west-kazakhstan", kind: "region", name: { ru: "Западно-Казахстанская область", kk: "Батыс Қазақстан облысы" }, settlements: [city("west-kazakhstan", "oral", "Уральск", "Орал"), city("west-kazakhstan", "aksai", "Аксай", "Ақсай")] },
  {
    id: "karaganda", kind: "region", name: { ru: "Карагандинская область", kk: "Қарағанды облысы" }, settlements: [
      city("karaganda", "karaganda", "Караганда", "Қарағанды"), city("karaganda", "temirtau", "Темиртау"), city("karaganda", "balkhash", "Балхаш", "Балқаш"), city("karaganda", "saran", "Сарань", "Саран"), city("karaganda", "shakhtinsk", "Шахтинск"), city("karaganda", "abay-city", "Абай"), city("karaganda", "priozersk", "Приозерск"), city("karaganda", "karkaraly", "Каркаралинск", "Қарқаралы"),
    ],
  },
  {
    id: "kostanay", kind: "region", name: { ru: "Костанайская область", kk: "Қостанай облысы" }, settlements: [
      city("kostanay", "kostanay", "Костанай", "Қостанай"), city("kostanay", "rudny", "Рудный"), city("kostanay", "lisakovsk", "Лисаковск"), city("kostanay", "arkalyk", "Аркалык", "Арқалық"), city("kostanay", "tobyl", "Тобыл"), city("kostanay", "zhitikara", "Житикара", "Жітіқара"),
    ],
  },
  { id: "kyzylorda", kind: "region", name: { ru: "Кызылординская область", kk: "Қызылорда облысы" }, settlements: [city("kyzylorda", "kyzylorda", "Кызылорда", "Қызылорда"), city("kyzylorda", "baikonyr", "Байконыр", "Байқоңыр"), city("kyzylorda", "aral", "Аральск", "Арал"), city("kyzylorda", "kazalinsk", "Казалинск", "Қазалы")] },
  { id: "mangystau", kind: "region", name: { ru: "Мангистауская область", kk: "Маңғыстау облысы" }, settlements: [city("mangystau", "aktau", "Актау", "Ақтау"), city("mangystau", "zhanaozen", "Жанаозен", "Жаңаөзен"), city("mangystau", "fort-shevchenko", "Форт-Шевченко")] },
  { id: "pavlodar", kind: "region", name: { ru: "Павлодарская область", kk: "Павлодар облысы" }, settlements: [city("pavlodar", "pavlodar", "Павлодар"), city("pavlodar", "ekibastuz", "Экибастуз"), city("pavlodar", "aksu", "Аксу", "Ақсу")] },
  {
    id: "north-kazakhstan", kind: "region", name: { ru: "Северо-Казахстанская область", kk: "Солтүстік Қазақстан облысы" }, settlements: [
      city("north-kazakhstan", "petropavl", "Петропавловск", "Петропавл"), city("north-kazakhstan", "bulaevo", "Булаево"), city("north-kazakhstan", "mamlyutka", "Мамлютка"), city("north-kazakhstan", "sergeevka", "Сергеевка"), city("north-kazakhstan", "taiynsha", "Тайынша"),
    ],
  },
  {
    id: "turkistan", kind: "region", name: { ru: "Туркестанская область", kk: "Түркістан облысы" }, settlements: [
      city("turkistan", "turkistan", "Туркестан", "Түркістан"), city("turkistan", "kentau", "Кентау"), city("turkistan", "arys", "Арысь", "Арыс"), city("turkistan", "zhetysai", "Жетысай", "Жетісай"), city("turkistan", "saryagash", "Сарыагаш", "Сарыағаш"), city("turkistan", "lenger", "Ленгер"), city("turkistan", "shardara", "Шардара"),
    ],
  },
  { id: "ulytau", kind: "region", name: { ru: "Улытауская область", kk: "Ұлытау облысы" }, settlements: [city("ulytau", "zhezkazgan", "Жезказган", "Жезқазған"), city("ulytau", "satpayev", "Сатпаев", "Сәтбаев"), city("ulytau", "karazhal", "Каражал", "Қаражал")] },
];

export const settlements = regions.flatMap((region) => region.settlements);

export const popularSettlementIds = ["almaty", "astana", "shymkent", "karaganda", "aktobe", "petropavl", "kostanay", "atyrau"];

export const popularSettlements = popularSettlementIds
  .map((id) => settlements.find((settlement) => settlement.id === id))
  .filter((settlement): settlement is Settlement => Boolean(settlement));

export function getRegion(regionId: string) {
  return regions.find((region) => region.id === regionId);
}

export function getSettlement(settlementId: string) {
  return settlements.find((settlement) => settlement.id === settlementId);
}

export const geographySource = {
  title: "КАТО НК РК 11-2025",
  updatedAt: "2026-07-17",
  url: "https://stat.gov.kz/ru/classifiers/statistical/21/",
};
