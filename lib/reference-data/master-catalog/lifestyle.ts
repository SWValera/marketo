import type { MasterCatalogNode } from "./types.ts";
import { branch, fallbackLeaf, leaves, overlay } from "./types.ts";

const items = (entries: Parameters<typeof leaves>[0], profiles: readonly string[] = ["goodsBrand"]) =>
  leaves(entries, profiles);

export const homeGardenCatalogOverlays: MasterCatalogNode[] = [overlay("home-garden", [
  branch("furniture", "Мебель", "Жиһаз", [
    ...items([["home-sofas", "Диваны", "Дивандар"], ["home-armchairs", "Кресла", "Креслолар"], ["home-beds", "Кровати", "Кереуеттер"], ["home-mattresses", "Матрасы", "Матрастар"], ["home-wardrobes", "Шкафы и комоды", "Шкафтар мен комодтар"], ["home-tables", "Столы", "Үстелдер"], ["home-chairs", "Стулья и табуреты", "Орындықтар мен табуреттер"], ["home-kitchen-furniture", "Кухонная мебель", "Асүй жиһазы"], ["home-office-furniture", "Офисная мебель", "Кеңсе жиһазы"], ["home-outdoor-furniture", "Садовая мебель", "Бақша жиһазы"]], ["furniture"]),
    fallbackLeaf("other-home-furniture", "Другая мебель", "Басқа жиһаз", ["furniture"]),
  ], ["furniture"]),
  branch("interior", "Предметы интерьера", "Интерьер бұйымдары", items([
    ["home-mirrors", "Зеркала", "Айналар"], ["home-clocks", "Настенные и настольные часы", "Қабырға және үстел сағаттары"], ["home-pictures-posters", "Картины и постеры", "Суреттер мен постерлер"], ["home-vases-figurines", "Вазы и фигурки", "Вазалар мен мүсіншелер"], ["home-candles-decor", "Свечи и декор", "Шамдар мен безендіру"], ["home-storage-organizers", "Хранение и органайзеры", "Сақтау және ұйымдастырғыштар"],
  ])),
  branch("lighting", "Освещение", "Жарықтандыру", items([
    ["home-chandeliers", "Люстры", "Аспашамдар"], ["home-ceiling-lights", "Потолочные светильники", "Төбе шамдары"], ["home-wall-lights", "Бра и настенные светильники", "Қабырға шамдары"], ["home-floor-desk-lamps", "Торшеры и настольные лампы", "Еден және үстел шамдары"], ["home-outdoor-lighting", "Уличное освещение", "Көше жарығы"], ["home-bulbs-led-strips", "Лампы и LED-ленты", "Шамдар мен LED таспалар"],
  ], ["lighting"]), ["lighting"]),
  branch("textiles", "Текстиль", "Тоқыма", items([
    ["home-curtains-blinds", "Шторы и жалюзи", "Перделер мен жалюзи"], ["home-carpets", "Ковры", "Кілемдер"], ["home-bed-linen", "Постельное бельё", "Төсек-орын жабдықтары"], ["home-blankets-pillows", "Одеяла и подушки", "Көрпелер мен жастықтар"], ["home-towels-bathrobes", "Полотенца и халаты", "Сүлгілер мен халаттар"], ["home-table-textiles", "Скатерти и кухонный текстиль", "Дастарқан және асүй тоқымасы"],
  ])),
  branch("dishes", "Посуда и кухонная утварь", "Ыдыс және асүй керек-жарағы", items([
    ["home-pots-pans", "Кастрюли и сковороды", "Кәстрөлдер мен табалар"], ["home-tableware", "Столовая посуда", "Асхана ыдыстары"], ["home-tea-coffee-ware", "Чайная и кофейная посуда", "Шай және кофе ыдыстары"], ["home-knives-cutlery", "Ножи и столовые приборы", "Пышақтар мен асхана құралдары"], ["home-baking-tools", "Формы и инвентарь для выпечки", "Пісіру қалыптары мен құралдары"], ["home-storage-containers", "Контейнеры для хранения", "Сақтау контейнерлері"],
  ])),
  branch("household-goods", "Хозяйственные товары", "Шаруашылық тауарлары", items([
    ["home-cleaning-tools", "Инвентарь для уборки", "Тазалау құралдары"], ["home-laundry-drying", "Стирка и сушка", "Жуу және кептіру"], ["home-bathroom-accessories", "Товары для ванной", "Жуыну бөлмесіне арналған тауарлар"], ["home-bags-film-foil", "Пакеты, плёнка и фольга", "Пакеттер, үлдір және фольга"], ["home-repair-smallwares", "Мелочи для дома", "Үйге арналған ұсақ-түйек"],
  ])),
  branch("household-chemicals", "Бытовая химия", "Тұрмыстық химия", items([
    ["home-laundry-detergents", "Средства для стирки", "Кір жуу құралдары"], ["home-dish-detergents", "Средства для посуды", "Ыдыс жуу құралдары"], ["home-surface-cleaners", "Чистящие средства", "Тазартқыш құралдар"], ["home-air-fresheners", "Освежители и ароматизаторы", "Ауа сергіткіштер мен хош иістендіргіштер"], ["home-pest-control", "Средства от насекомых и грызунов", "Жәндіктер мен кеміргіштерге қарсы құралдар"],
  ], ["consumableLot", "regulatedSafety"]), ["consumableLot", "regulatedSafety"]),
  branch("indoor-plants", "Комнатные растения", "Бөлме өсімдіктері", items([
    ["home-live-plants", "Живые растения", "Тірі өсімдіктер"], ["home-seedlings-cuttings", "Рассада и черенки", "Көшеттер мен қалемшелер"], ["home-pots-planters", "Горшки и кашпо", "Құмыралар мен кашпо"], ["home-plant-care", "Грунты и уход", "Топырақ пен күтім"],
  ], ["gardenGoods"]), ["gardenGoods"]),
  branch("garden", "Сад и огород", "Бақша және көконіс бағы", items([
    ["garden-seeds", "Семена", "Тұқымдар", ["consumableLot", "regulatedSafety"]],
    ["garden-seedlings", "Саженцы", "Көшеттер"],
    ["garden-fertilizers-soil", "Удобрения и грунт", "Тыңайтқыштар мен топырақ", ["consumableLot", "regulatedSafety"]],
    ["garden-irrigation", "Полив", "Суару"], ["garden-greenhouses", "Теплицы и парники", "Жылыжайлар"], ["garden-fences-decor", "Ограждения и декор", "Қоршаулар мен безендіру"], ["garden-pools", "Бассейны и аксессуары", "Хауыздар мен аксессуарлар"],
  ], ["gardenGoods"]), ["gardenGoods"]),
  branch("garden-tools", "Садовый инвентарь", "Бақша құралдары", items([
    ["garden-hand-tools", "Ручной инвентарь", "Қол құралдары"], ["garden-lawn-mowers", "Газонокосилки и триммеры", "Шөп шапқыштар мен триммерлер"], ["garden-chainsaws", "Бензопилы и электропилы", "Бензинді және электр аралар"], ["garden-cultivators", "Культиваторы и мотоблоки", "Культиваторлар мен мотоблоктар"], ["garden-pumps", "Насосы", "Сорғылар"],
  ], ["tool"]), ["tool"]),
  branch("office-supplies", "Канцтовары", "Кеңсе тауарлары", items([
    ["office-paper-notebooks", "Бумага и блокноты", "Қағаз және дәптерлер"], ["office-writing-supplies", "Письменные принадлежности", "Жазу құралдары"], ["office-folders-archiving", "Папки и архивирование", "Папкалар мен мұрағаттау"], ["office-presentation-supplies", "Доски и товары для презентаций", "Тақталар мен презентация тауарлары"],
  ])),
  branch("food-drinks", "Продукты и напитки", "Азық-түлік пен сусындар", items([
    ["food-farm-products", "Фермерские продукты", "Ферма өнімдері"], ["food-meat-fish", "Мясо и рыба", "Ет пен балық"], ["food-dairy-eggs", "Молочные продукты и яйца", "Сүт өнімдері мен жұмыртқа"], ["food-fruit-vegetables", "Фрукты и овощи", "Жемістер мен көконістер"], ["food-honey-preserves", "Мёд, варенье и заготовки", "Бал, тосап және дайындамалар"], ["food-bakery-sweets", "Выпечка и сладости", "Нан-тоқаш пен тәттілер"], ["food-tea-coffee", "Чай и кофе", "Шай мен кофе"], ["food-nonalcoholic-drinks", "Безалкогольные напитки", "Алкогольсіз сусындар"],
  ], ["consumableLot", "regulatedSafety"]), ["consumableLot", "regulatedSafety"]),
])];

export const fashionCatalogOverlays: MasterCatalogNode[] = [overlay("personal", [
  branch("women-clothing", "Женская одежда", "Әйелдер киімі", items([
    ["women-dresses", "Платья и сарафаны", "Көйлектер"], ["women-outerwear", "Верхняя одежда", "Сыртқы киім"], ["women-tops", "Кофты, блузки и рубашки", "Кофталар, блузкалар және жейделер"], ["women-trousers-jeans", "Брюки и джинсы", "Шалбарлар мен джинсылар"], ["women-skirts", "Юбки", "Белдемшелер"], ["women-suits", "Костюмы", "Костюмдер"], ["women-knitwear", "Трикотаж", "Трикотаж"], ["women-sportswear", "Спортивная одежда", "Спорт киімі"],
  ], ["clothing"]), ["clothing"]),
  branch("men-clothing", "Мужская одежда", "Ерлер киімі", items([
    ["men-outerwear", "Верхняя одежда", "Сыртқы киім"], ["men-shirts", "Рубашки", "Жейделер"], ["men-tshirts", "Футболки и поло", "Футболкалар мен поло"], ["men-trousers-jeans", "Брюки и джинсы", "Шалбарлар мен джинсылар"], ["men-suits", "Костюмы и пиджаки", "Костюмдер мен пиджактар"], ["men-knitwear", "Свитеры и трикотаж", "Жемпірлер мен трикотаж"], ["men-sportswear", "Спортивная одежда", "Спорт киімі"],
  ], ["clothing"]), ["clothing"]),
  branch("women-shoes", "Женская обувь", "Әйелдер аяқ киімі", items([
    ["women-boots", "Сапоги и ботинки", "Етіктер мен бәтеңкелер"], ["women-sneakers", "Кроссовки и кеды", "Кроссовкалар мен кедалар"], ["women-shoes-heels", "Туфли", "Туфли"], ["women-sandals", "Босоножки и сандалии", "Босоножкалар мен сандалилер"], ["women-home-shoes", "Домашняя обувь", "Үй аяқ киімі"],
  ], ["shoes"]), ["shoes"]),
  branch("men-shoes", "Мужская обувь", "Ерлер аяқ киімі", items([
    ["men-boots", "Ботинки и сапоги", "Бәтеңкелер мен етіктер"], ["men-sneakers", "Кроссовки и кеды", "Кроссовкалар мен кедалар"], ["men-classic-shoes", "Классическая обувь", "Классикалық аяқ киім"], ["men-sandals", "Сандалии и шлёпанцы", "Сандалилер мен тәпішкелер"], ["men-home-shoes", "Домашняя обувь", "Үй аяқ киімі"],
  ], ["shoes"]), ["shoes"]),
  branch("underwear-swimwear", "Бельё и купальники", "Іш киім және шомылу киімі", items([
    ["women-underwear", "Женское бельё", "Әйелдер іш киімі"], ["men-underwear", "Мужское бельё", "Ерлер іш киімі"], ["swimwear", "Купальники", "Шомылу киімдері"], ["sleepwear", "Одежда для сна", "Ұйқы киімі"], ["hosiery", "Носки и колготки", "Шұлықтар мен колготкалар"],
  ], ["clothing"]), ["clothing"]),
  branch("headwear", "Головные уборы", "Бас киімдер", items([
    ["fashion-hats-caps", "Шапки и кепки", "Бөріктер мен кепкалар"], ["fashion-hats", "Шляпы и панамы", "Қалпақтар мен панамалар"], ["fashion-scarves", "Платки и шарфы", "Орамалдар мен шарфтар"],
  ], ["clothing"]), ["clothing"]),
  branch("bags", "Сумки и рюкзаки", "Сөмкелер мен арқа сөмкелер", items([
    ["fashion-women-bags", "Женские сумки", "Әйелдер сөмкелері"], ["fashion-men-bags", "Мужские сумки", "Ерлер сөмкелері"], ["fashion-backpacks", "Рюкзаки", "Арқа сөмкелер"], ["fashion-suitcases", "Чемоданы и дорожные сумки", "Чемодандар мен жол сөмкелері"], ["fashion-wallets", "Кошельки и визитницы", "Әмияндар мен карта салғыштар"],
  ], ["bags"]), ["bags"]),
  branch("fashion-accessories", "Аксессуары", "Аксессуарлар", items([
    ["fashion-belts", "Ремни", "Белдіктер"], ["fashion-gloves", "Перчатки и варежки", "Қолғаптар"], ["fashion-sunglasses", "Солнцезащитные очки", "Күннен қорғайтын көзілдірік"], ["fashion-ties", "Галстуки и бабочки", "Галстуктар мен көбелектер"], ["fashion-hair-accessories", "Аксессуары для волос", "Шашқа арналған аксессуарлар"],
  ])),
  branch("watches-jewelry", "Часы и украшения", "Сағаттар мен әшекейлер", items([
    ["fashion-wristwatches", "Наручные часы", "Қол сағаттары"], ["fashion-rings", "Кольца", "Сақиналар"], ["fashion-earrings", "Серьги", "Сырғалар"], ["fashion-chains-necklaces", "Цепочки и колье", "Шынжырлар мен алқалар"], ["fashion-bracelets", "Браслеты", "Білезіктер"], ["fashion-costume-jewelry", "Бижутерия", "Бижутерия"],
  ], ["jewelry"]), ["jewelry"]),
  branch("wedding", "Всё для свадьбы", "Үйлену тойына арналған тауарлар", items([
    ["wedding-dresses", "Свадебные платья", "Үйлену көйлектері"], ["wedding-suits", "Свадебные костюмы", "Үйлену костюмдері"], ["wedding-accessories", "Свадебные аксессуары", "Үйлену аксессуарлары"], ["wedding-decor-goods", "Декор и атрибутика", "Безендіру және атрибуттар"],
  ], ["clothing"]), ["clothing"]),
  branch("beauty-products", "Красота и здоровье", "Сұлулық және денсаулық", items([
    ["beauty-makeup", "Макияж", "Макияж"], ["beauty-face-care", "Уход за лицом", "Бет күтімі"], ["beauty-hair-care", "Уход за волосами", "Шаш күтімі"], ["beauty-body-care", "Уход за телом", "Дене күтімі"], ["beauty-perfume", "Парфюмерия", "Парфюмерия"], ["beauty-manicure-products", "Маникюр и педикюр", "Маникюр және педикюр"], ["beauty-health-goods", "Товары для здоровья", "Денсаулық тауарлары"],
  ], ["consumableLot", "regulatedSafety"]), ["consumableLot", "regulatedSafety"]),
  branch("workwear", "Спецодежда и спецобувь", "Арнайы киім мен арнайы аяқ киім", items([
    ["workwear-clothing", "Рабочая одежда", "Жұмыс киімі"], ["workwear-footwear", "Рабочая обувь", "Жұмыс аяқ киімі"], ["workwear-medical", "Медицинская одежда", "Медициналық киім"], ["workwear-ppe", "Средства индивидуальной защиты", "Жеке қорғаныс құралдары"],
  ], ["clothing"]), ["clothing"]),
])];

export const kidsCatalogOverlays: MasterCatalogNode[] = [overlay("kids", [
  branch("kids-clothing", "Детская одежда", "Балалар киімі", items([
    ["baby-clothing", "Одежда для новорождённых", "Жаңа туғандар киімі"], ["girls-clothing", "Одежда для девочек", "Қыздар киімі"], ["boys-clothing", "Одежда для мальчиков", "Ұлдар киімі"], ["kids-outerwear", "Верхняя одежда", "Балалардың сыртқы киімі"], ["kids-school-uniform", "Школьная форма", "Мектеп формасы"], ["kids-sportswear", "Спортивная одежда", "Балалар спорт киімі"],
  ], ["kidsClothing"]), ["kidsClothing"]),
  branch("kids-shoes", "Детская обувь", "Балалар аяқ киімі", items([
    ["kids-boots", "Сапоги и ботинки", "Етіктер мен бәтеңкелер"], ["kids-sneakers", "Кроссовки и кеды", "Кроссовкалар мен кедалар"], ["kids-sandals", "Сандалии", "Сандалилер"], ["kids-first-steps-shoes", "Обувь для первых шагов", "Алғашқы қадамға арналған аяқ киім"], ["kids-home-shoes", "Домашняя обувь", "Үй аяқ киімі"],
  ], ["kidsClothing"]), ["kidsClothing"]),
  branch("strollers", "Коляски", "Бала арбалары", items([
    ["stroller-carrycots", "Коляски-люльки", "Бесік арбалар"], ["stroller-walking", "Прогулочные коляски", "Серуен арбалары"], ["stroller-modular", "Коляски 2 в 1 и 3 в 1", "2-де 1 және 3-те 1 арбалар"], ["stroller-twins", "Коляски для двойни", "Егіздерге арналған арбалар"],
    ["stroller-accessories", "Аксессуары для колясок", "Арба аксессуарлары", ["productCore"]],
  ], ["stroller"]), ["stroller"]),
  branch("car-seats", "Автокресла", "Автоорындықтар", items([
    ["infant-carriers", "Автолюльки 0/0+", "0/0+ автобесіктер", ["carSeat", "regulatedSafety"]],
    ["child-car-seats", "Автокресла 9–36 кг", "9–36 кг автоорындықтар", ["carSeat", "regulatedSafety"]],
    ["car-seat-boosters", "Бустеры", "Бустерлер", ["carSeat", "regulatedSafety"]],
    ["car-seat-accessories", "Аксессуары для автокресел", "Автоорындық аксессуарлары", ["productCore"]],
  ], ["carSeat"]), ["carSeat"]),
  branch("toys", "Игрушки", "Ойыншықтар", items([
    ["toys-babies", "Игрушки для малышей", "Сәбилерге арналған ойыншықтар"], ["toys-dolls", "Куклы и домики", "Қуыршақтар мен үйшіктер"], ["toys-construction", "Конструкторы", "Құрастырғыштар"], ["toys-vehicles", "Машинки и транспорт", "Машиналар мен көлік"], ["toys-roleplay", "Сюжетно-ролевые игры", "Сюжеттік-рөлдік ойындар"], ["toys-educational", "Развивающие игрушки", "Дамытушы ойыншықтар"], ["toys-outdoor", "Игрушки для улицы", "Далаға арналған ойыншықтар"], ["toys-soft", "Мягкие игрушки", "Жұмсақ ойыншықтар"],
  ], ["toy"]), ["toy"]),
  branch("feeding", "Кормление", "Тамақтандыру", items([
    ["feeding-highchairs", "Стульчики для кормления", "Тамақтандыру орындықтары", ["furniture", "regulatedSafety"]],
    ["feeding-bottles", "Бутылочки и посуда", "Бөтелкелер мен ыдыстар", ["productCore", "regulatedSafety"]],
    ["feeding-breast-pumps", "Молокоотсосы и аксессуары", "Сүт сауғыштар мен аксессуарлар", ["appliance", "breastPumpAppliance", "regulatedSafety"]],
    ["feeding-sterilizers-heaters", "Стерилизаторы и подогреватели", "Стерилизаторлар мен жылытқыштар", ["appliance", "sterilizerWarmerAppliance", "regulatedSafety"]],
  ])),
  branch("kids-furniture", "Детская мебель", "Балалар жиһазы", items([
    ["kids-cots", "Детские кроватки", "Балалар кереуеттері"], ["kids-mattresses", "Детские матрасы", "Балалар матрастары"], ["kids-tables-chairs", "Столы и стулья", "Үстелдер мен орындықтар"], ["kids-wardrobes-storage", "Шкафы и хранение", "Шкафтар мен сақтау"], ["kids-playpens", "Манежи", "Манеждер"],
  ], ["furniture"]), ["furniture"]),
  branch("school", "Школа и канцелярия", "Мектеп және кеңсе тауарлары", items([
    ["school-backpacks", "Школьные рюкзаки", "Мектеп арқа сөмкелері", ["bags"]],
    ["school-stationery", "Школьная канцелярия", "Мектеп кеңсе тауарлары", ["productCore"]],
    ["school-textbooks-workbooks", "Учебники и рабочие тетради", "Оқулықтар мен жұмыс дәптерлері", ["bookMedia"]],
    ["school-art-supplies", "Товары для рисования и творчества", "Сурет салу және шығармашылық тауарлары", ["handmadeMaterial"]],
  ])),
  branch("baby-care", "Уход за ребёнком", "Бала күтімі", items([
    ["baby-diapers", "Подгузники и пелёнки", "Жөргектер мен жаялықтар", ["consumableLot", "regulatedSafety"]],
    ["baby-bathing", "Купание", "Шомылдыру", ["productCore", "regulatedSafety"]],
    ["baby-hygiene", "Гигиена и косметика", "Гигиена және косметика", ["consumableLot", "regulatedSafety"]],
    ["baby-monitors-scales", "Радионяни, весы и термометры", "Радиобақылау, таразы және термометрлер", ["appliance", "babyMonitoringAppliance", "regulatedSafety"]],
    ["baby-carriers", "Слинги и рюкзаки-переноски", "Слингтер мен тасымалдау сөмкелері", ["bags", "regulatedSafety"]],
  ])),
  branch("kids-transport", "Детский транспорт", "Балалар көлігі", items([
    ["kids-bicycles", "Детские велосипеды", "Балалар велосипедтері"], ["kids-scooters", "Самокаты", "Самокаттар"], ["kids-balance-bikes", "Беговелы", "Тепе-теңдік велосипедтері"], ["kids-electric-cars", "Электромобили", "Электр машиналар"], ["kids-sledges", "Санки и снегокаты", "Шаналар мен қар самокаттары"],
  ], ["bicycle"]), ["bicycle"]),
])];

export const hobbyCatalogOverlays: MasterCatalogNode[] = [overlay("hobby", [
  branch("sports", "Спорт и фитнес", "Спорт және фитнес", items([
    ["sports-fitness-equipment", "Тренажёры и фитнес", "Жаттықтырғыштар мен фитнес"], ["sports-team", "Командные виды спорта", "Командалық спорт"], ["sports-racket", "Теннис, бадминтон и сквош", "Теннис, бадминтон және сквош"], ["sports-combat", "Единоборства", "Жекпе-жек"], ["sports-winter", "Зимний спорт", "Қысқы спорт"], ["sports-water", "Водный спорт", "Су спорты"], ["sports-skates-skateboards", "Ролики и скейтборды", "Роликтер мен скейтбордтар"], ["sports-protection", "Спортивная защита", "Спорттық қорғаныс"],
  ], ["sportsGoods"]), ["sportsGoods"]),
  branch("bicycles", "Велосипеды", "Велосипедтер", items([
    ["bicycles-mountain", "Горные велосипеды", "Тау велосипедтері"], ["bicycles-road", "Шоссейные и гравийные", "Шоссе және гравий велосипедтері"], ["bicycles-city", "Городские велосипеды", "Қалалық велосипедтер"], ["bicycles-bmx", "BMX и трюковые", "BMX және трюктік"], ["bicycles-electric", "Электровелосипеды", "Электр велосипедтер"], ["bicycles-parts", "Запчасти и аксессуары", "Қосалқы бөлшектер мен аксессуарлар"],
  ], ["bicycle"]), ["bicycle"]),
  branch("tourism", "Туризм и кемпинг", "Туризм және кемпинг", items([
    ["tourism-tents", "Палатки и тенты", "Шатырлар мен тенттер"], ["tourism-sleeping-bags", "Спальные мешки и коврики", "Ұйқы қаптары мен төсеніштер"], ["tourism-backpacks", "Туристические рюкзаки", "Туристік арқа сөмкелері"], ["tourism-cooking", "Походная кухня", "Сапар асүйі"], ["tourism-furniture", "Кемпинговая мебель", "Кемпинг жиһазы"], ["tourism-navigation", "Навигация и оптика", "Навигация және оптика"], ["tourism-climbing", "Альпинизм и страховка", "Альпинизм және сақтандыру"],
  ], ["outdoorGear"]), ["outdoorGear"]),
  branch("fishing", "Рыбалка", "Балық аулау", items([
    ["fishing-rods", "Удилища", "Қармақтар"], ["fishing-reels", "Катушки", "Катушкалар"], ["fishing-lures", "Приманки и наживки", "Жемдер мен қармақ жемдері"], ["fishing-tackle", "Леска, крючки и оснастка", "Қармақ жібі, ілмектер мен жабдық"], ["fishing-boats", "Лодки и моторы", "Қайықтар мен қозғалтқыштар"], ["fishing-clothing", "Одежда и экипировка", "Киім мен жабдық"],
  ], ["fishingGear"]), ["fishingGear"]),
  branch("hunting", "Охота", "Аңшылық", items([
    ["hunting-clothing", "Охотничья одежда и обувь", "Аңшылық киімі мен аяқ киімі"], ["hunting-optics", "Оптика", "Оптика"], ["hunting-decoys", "Манки и приманки", "Алдағыштар мен жемдер"], ["hunting-knives", "Ножи и инструмент", "Пышақтар мен құралдар"], ["hunting-storage", "Чехлы, сейфы и аксессуары", "Қаптар, сейфтер мен аксессуарлар"],
  ], ["huntingGear"]), ["huntingGear"]),
  branch("musical-instruments", "Музыкальные инструменты", "Музыкалық аспаптар", items([
    ["music-guitars", "Гитары", "Гитаралар"], ["music-keyboards", "Клавишные", "Пернелі аспаптар"], ["music-drums", "Ударные", "Ұрмалы аспаптар"], ["music-wind", "Духовые", "Үрмелі аспаптар"], ["music-bowed-folk", "Смычковые и народные", "Ысқышты және ұлттық аспаптар"], ["music-studio-equipment", "Студийное оборудование", "Студиялық жабдық"], ["music-dj-equipment", "DJ-оборудование", "DJ жабдығы"], ["music-accessories", "Аксессуары и расходники", "Аксессуарлар мен шығын материалдары"],
  ], ["instrument"]), ["instrument"]),
  branch("books", "Книги и журналы", "Кітаптар мен журналдар", items([
    ["books-fiction", "Художественная литература", "Көркем әдебиет"], ["books-children", "Детские книги", "Балалар кітаптары"], ["books-education", "Учебная литература", "Оқу әдебиеті"], ["books-business", "Бизнес и профессиональная литература", "Бизнес және кәсіби әдебиет"], ["books-comics-manga", "Комиксы и манга", "Комикстер мен манга"], ["books-magazines", "Журналы", "Журналдар"],
  ], ["bookMedia"]), ["bookMedia"]),
  branch("collecting", "Коллекционирование", "Коллекциялау", items([
    ["collecting-coins", "Монеты", "Монеталар"], ["collecting-banknotes", "Банкноты", "Банкноттар"], ["collecting-stamps", "Марки", "Маркалар"], ["collecting-models", "Модели техники", "Техника модельдері"], ["collecting-antiques", "Антиквариат", "Антиквариат"], ["collecting-militaria", "Военная атрибутика", "Әскери атрибуттар"], ["collecting-cards", "Коллекционные карты", "Коллекциялық карталар"],
  ], ["collectible"]), ["collectible"]),
  branch("board-games", "Настольные игры", "Үстел ойындары", items([
    ["board-family-games", "Семейные игры", "Отбасылық ойындар"], ["board-strategy-games", "Стратегии", "Стратегиялық ойындар"], ["board-roleplaying-games", "Настольные ролевые игры", "Үстел рөлдік ойындары"], ["board-puzzles", "Пазлы и головоломки", "Пазлдар мен басқатырғыштар"], ["board-chess-checkers", "Шахматы, шашки и нарды", "Шахмат, дойбы және нард"],
  ], ["goodsBrand"]), ["goodsBrand"]),
  branch("tickets", "Билеты", "Билеттер", items([
    ["tickets-concerts", "Концерты", "Концерттер"], ["tickets-theatre-cinema", "Театр и кино", "Театр және кино"], ["tickets-sports", "Спортивные события", "Спорттық іс-шаралар"], ["tickets-festivals", "Фестивали и выставки", "Фестивальдар мен көрмелер"], ["tickets-travel", "Проездные билеты", "Жол жүру билеттері"],
  ], ["ticket"]), ["ticket"]),
  branch("handmade", "Рукоделие", "Қолөнер", items([
    ["handmade-yarn", "Пряжа и вязание", "Жіп және тоқу"], ["handmade-sewing", "Шитьё и ткани", "Тігу және маталар"], ["handmade-embroidery", "Вышивание", "Кесте тігу"], ["handmade-beads-jewelry", "Бисер и изготовление украшений", "Моншақ және әшекей жасау"], ["handmade-painting", "Рисование", "Сурет салу"], ["handmade-soap-candles", "Мыло и свечи", "Сабын мен шам жасау"], ["handmade-scrapbooking", "Скрапбукинг и декор", "Скрапбукинг және безендіру"],
  ], ["handmadeMaterial"]), ["handmadeMaterial"]),
])];

export const animalCatalogOverlays: MasterCatalogNode[] = [overlay("animals", [
  branch("birds", "Птицы", "Құстар", items([
    ["pet-parrots", "Попугаи", "Тотықұстар", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-songbirds", "Певчие и декоративные птицы", "Әнші және сәндік құстар", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-pigeons", "Голуби", "Көгершіндер", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-bird-cages", "Клетки и аксессуары", "Торлар мен аксессуарлар", ["animalSupply"]],
  ], ["smallAnimal", "liveAnimalDetails"]), ["smallAnimal", "liveAnimalDetails"]),
  branch("fish-aquariums", "Рыбы и аквариумы", "Балықтар мен аквариумдар", items([
    ["pet-freshwater-fish", "Пресноводные рыбы", "Тұщы су балықтары", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-marine-fish", "Морские рыбы и кораллы", "Теңіз балықтары мен маржандар", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-aquariums", "Аквариумы и тумбы", "Аквариумдар мен тұғырлар", ["animalSupply"]],
    ["pet-aquarium-equipment", "Аквариумное оборудование", "Аквариум жабдығы", ["animalSupply"]],
    ["pet-aquarium-decor", "Грунт, растения и декор", "Топырақ, өсімдіктер және безендіру", ["animalSupply"]],
  ], ["smallAnimal", "liveAnimalDetails"]), ["smallAnimal", "liveAnimalDetails"]),
  branch("rodents", "Грызуны", "Кеміргіштер", items([
    ["pet-hamsters", "Хомяки", "Аламандар", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-guinea-pigs", "Морские свинки", "Теңіз шошқалары", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-rabbits", "Декоративные кролики", "Сәндік қояндар", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-rats-mice", "Крысы и мыши", "Егеуқұйрықтар мен тышқандар", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-chinchillas", "Шиншиллы и дегу", "Шиншиллалар мен дегу", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-rodent-cages", "Клетки и аксессуары", "Торлар мен аксессуарлар", ["animalSupply"]],
  ], ["smallAnimal", "liveAnimalDetails"]), ["smallAnimal", "liveAnimalDetails"]),
  branch("reptiles", "Рептилии", "Бауырымен жорғалаушылар", items([
    ["pet-turtles", "Черепахи", "Тасбақалар", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-lizards", "Ящерицы", "Кесірткелер", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-snakes", "Змеи", "Жыландар", ["smallAnimal", "liveAnimalDetails"]],
    ["pet-terrariums", "Террариумы и оборудование", "Террариумдар мен жабдық", ["animalSupply"]],
  ], ["smallAnimal", "liveAnimalDetails"]), ["smallAnimal", "liveAnimalDetails"]),
  branch("farm-animals", "Сельскохозяйственные животные", "Ауыл шаруашылығы жануарлары", items([
    ["farm-cattle", "Крупный рогатый скот", "Ірі қара"], ["farm-horses", "Лошади", "Жылқы"], ["farm-sheep-goats", "Овцы и козы", "Қой мен ешкі"], ["farm-pigs", "Свиньи", "Шошқалар"], ["farm-poultry", "Домашняя птица", "Үй құстары"], ["farm-rabbits", "Кролики", "Қояндар"], ["farm-bees", "Пчёлы и пчелопакеты", "Аралар мен ара пакеттері"],
  ], ["farmAnimal", "liveAnimalDetails"]), ["farmAnimal", "liveAnimalDetails"]),
  branch("pet-supplies", "Товары для животных", "Жануарларға арналған тауарлар", items([
    ["pet-food", "Корм", "Жем", ["consumableLot", "petConsumable", "regulatedSafety"]],
    ["pet-beds-houses", "Лежанки и домики", "Төсектер мен үйшіктер", ["animalSupply"]],
    ["pet-carriers", "Переноски и клетки", "Тасымалдағыштар мен торлар", ["animalSupply"]],
    ["pet-collars-leashes", "Ошейники, поводки и амуниция", "Қарғыбаулар, жетектер мен жабдық", ["animalSupply"]],
    ["pet-toys-training", "Игрушки и дрессировка", "Ойыншықтар мен үйрету", ["animalSupply"]],
    ["pet-grooming-hygiene", "Груминг и гигиена", "Груминг және гигиена", ["animalSupply", "regulatedSafety"]],
    ["pet-veterinary-goods", "Ветеринарные товары", "Ветеринарлық тауарлар", ["animalSupply", "regulatedSafety"]],
  ], ["animalSupply"]), ["animalSupply"]),
])];

export const businessCatalogOverlays: MasterCatalogNode[] = [overlay("business", [
  branch("retail-equipment", "Торговое оборудование", "Сауда жабдығы", items([
    ["business-showcases-counters", "Витрины и прилавки", "Витриналар мен сөрелер"], ["business-shelving", "Стеллажи и торговые системы", "Сөрелер мен сауда жүйелері"], ["business-cash-registers", "Кассовое и POS-оборудование", "Касса және POS жабдығы"], ["business-scales-retail", "Торговые весы", "Сауда таразылары"], ["business-refrigerated-display", "Холодильные витрины", "Тоңазытқыш витриналар"], ["business-advertising-stands", "Рекламные стенды и вывески", "Жарнама стендтері мен маңдайшалар"],
  ], ["equipment"]), ["equipment"]),
  branch("industrial-equipment", "Промышленное оборудование", "Өнеркәсіптік жабдық", items([
    ["business-metalworking", "Металлообработка", "Металл өңдеу"], ["business-woodworking", "Деревообработка", "Ағаш өңдеу"], ["business-plastics", "Оборудование для пластика", "Пластикке арналған жабдық"], ["business-textile", "Швейное и текстильное", "Тігін және тоқыма жабдығы"], ["business-packaging-lines", "Фасовочное и упаковочное", "Орау және қаптау жабдығы"], ["business-compressors-pumps", "Компрессоры и промышленные насосы", "Компрессорлар мен өнеркәсіптік сорғылар"], ["business-generators", "Генераторы и энергетика", "Генераторлар мен энергетика"],
  ], ["equipment"]), ["equipment"]),
  branch("food-equipment", "Оборудование для общепита", "Қоғамдық тамақтану жабдығы", items([
    ["business-cooking-equipment", "Тепловое оборудование", "Жылу жабдығы"], ["business-refrigeration", "Холодильное оборудование", "Тоңазытқыш жабдығы"], ["business-dishwashing", "Посудомоечное оборудование", "Ыдыс жуу жабдығы"], ["business-bakery", "Пекарское и кондитерское", "Наубайхана және кондитер жабдығы"], ["business-coffee-bar", "Кофейное и барное", "Кофе және бар жабдығы"], ["business-food-processing", "Пищевое производство", "Тамақ өндірісі"], ["business-restaurant-furniture", "Мебель для HoReCa", "HoReCa жиһазы"],
  ], ["equipment"]), ["equipment"]),
  branch("agro-equipment", "Фермерское оборудование", "Ферма жабдығы", items([
    ["business-livestock-equipment", "Животноводство", "Мал шаруашылығы"], ["business-poultry-equipment", "Птицеводство", "Құс шаруашылығы"], ["business-dairy-equipment", "Молочное оборудование", "Сүт жабдығы"], ["business-feed-equipment", "Кормопроизводство", "Жем өндірісі"], ["business-greenhouse-equipment", "Тепличное оборудование", "Жылыжай жабдығы"], ["business-irrigation-equipment", "Полив и орошение", "Суару жабдығы"], ["business-beekeeping-equipment", "Пчеловодство", "Омарташылық"],
  ], ["equipment"]), ["equipment"]),
  branch("medical-equipment", "Медицинское оборудование", "Медициналық жабдық", items([
    ["business-diagnostic-medical", "Диагностическое оборудование", "Диагностикалық жабдық", ["equipment", "regulatedSafety"]],
    ["business-dental-medical", "Стоматологическое", "Стоматологиялық жабдық", ["equipment", "regulatedSafety"]],
    ["business-lab-medical", "Лабораторное", "Зертханалық жабдық", ["equipment", "regulatedSafety"]],
    ["business-rehab-medical", "Реабилитация и уход", "Оңалту және күтім", ["equipment", "regulatedSafety"]],
    ["business-medical-furniture", "Медицинская мебель", "Медициналық жиһаз", ["equipment", "regulatedSafety"]],
    ["business-medical-consumables", "Расходные материалы", "Шығын материалдары", ["consumableLot", "regulatedSafety"]],
  ], ["equipment"]), ["equipment"]),
  branch("beauty-equipment", "Оборудование для салонов", "Салон жабдығы", items([
    ["business-hairdressing-equipment", "Парикмахерское оборудование", "Шаштараз жабдығы"], ["business-nail-equipment", "Маникюрное оборудование", "Маникюр жабдығы"], ["business-cosmetology-equipment", "Косметологическое", "Косметологиялық жабдық"], ["business-massage-equipment", "Массажное и SPA-оборудование", "Массаж және SPA жабдығы"], ["business-tattoo-equipment", "Тату-оборудование", "Тату жабдығы"], ["business-salon-furniture", "Мебель для салона", "Салон жиһазы"],
  ], ["equipment"]), ["equipment"]),
  branch("office-equipment", "Офисное оборудование", "Кеңсе жабдығы", items([
    ["business-office-printing", "Печать и копирование", "Басып шығару және көшіру"], ["business-office-telephony", "Телефония и видеоконференции", "Телефония және бейнеконференция"], ["business-office-shredders", "Уничтожители бумаг и ламинаторы", "Қағаз жойғыштар мен ламинаторлар"], ["business-office-safes", "Сейфы и хранение", "Сейфтер мен сақтау"], ["business-office-badges-time", "Системы учёта и контроля", "Есепке алу және бақылау жүйелері"],
  ], ["equipment"]), ["equipment"]),
  branch("tools-materials", "Инструменты и материалы", "Құралдар мен материалдар", items([
    ["business-power-tools", "Профессиональный электроинструмент", "Кәсіби электр құралы"], ["business-hand-tools", "Ручной инструмент", "Қол құралы"], ["business-welding", "Сварочное оборудование", "Дәнекерлеу жабдығы"], ["business-abrasives-cutting", "Оснастка, абразивы и режущий инструмент", "Жабдық, абразивтер мен кесу құралы"], ["business-safety-tools", "Промышленная безопасность", "Өнеркәсіптік қауіпсіздік"],
  ], ["tool"]), ["tool"]),
  branch("raw-materials", "Сырьё", "Шикізат", items([
    ["business-metal-raw", "Металлы и сплавы", "Металдар мен қорытпалар"], ["business-wood-raw", "Древесина и пиломатериалы", "Ағаш және араланған материалдар"], ["business-plastic-raw", "Пластики и полимеры", "Пластиктер мен полимерлер"], ["business-textile-raw", "Ткани и текстильное сырьё", "Маталар мен тоқыма шикізаты"], ["business-food-raw", "Пищевое сырьё", "Тамақ шикізаты"], ["business-chemical-raw", "Химическое сырьё", "Химиялық шикізат"], ["business-recyclables", "Вторсырьё", "Қайталама шикізат"],
  ], ["consumableLot", "regulatedSafety"]), ["consumableLot", "regulatedSafety"]),
  branch("containers", "Тара и упаковка", "Ыдыс және қаптама", items([
    ["business-cardboard-packaging", "Картонные коробки", "Картон қораптар"], ["business-plastic-packaging", "Пластиковая тара", "Пластик ыдыс"], ["business-glass-packaging", "Стеклянная тара", "Әйнек ыдыс"], ["business-bags-sacks", "Пакеты и мешки", "Пакеттер мен қаптар"], ["business-labels-tape", "Этикетки, скотч и расходники", "Жапсырмалар, таспа және шығын материалдары"], ["business-pallets-crates", "Паллеты и ящики", "Паллеттер мен жәшіктер"],
  ], ["productCore"]), ["productCore"]),
  branch("ready-business", "Готовый бизнес", "Дайын бизнес", items([
    ["business-ready-retail", "Магазины и розница", "Дүкендер мен бөлшек сауда"], ["business-ready-horeca", "Кафе, рестораны и общепит", "Кафе, мейрамхана және қоғамдық тамақтану"], ["business-ready-services", "Сервисный бизнес", "Сервистік бизнес"], ["business-ready-beauty", "Салоны красоты", "Сұлулық салондары"], ["business-ready-production", "Производство", "Өндіріс"], ["business-ready-online", "Интернет-бизнес", "Интернет-бизнес"], ["business-ready-agriculture", "Сельское хозяйство", "Ауыл шаруашылығы"],
  ], ["readyBusiness", "businessCommercials"]), ["readyBusiness", "businessCommercials"]),
])];

export const communityCatalogOverlays: MasterCatalogNode[] = [
  overlay("free", [
    branch("free-home", "Для дома", "Үйге арналған", items([
      ["free-furniture", "Мебель", "Жиһаз", ["free", "furniture"]], ["free-dishes-household", "Посуда и хозтовары", "Ыдыс және үй тауарлары", ["free", "goods"]], ["free-textiles", "Текстиль", "Тоқыма", ["free", "goods"]], ["free-plants", "Растения", "Өсімдіктер", ["free", "gardenGoods"]]
    ], ["free"]), ["free"]),
    branch("free-clothes", "Одежда и обувь", "Киім және аяқ киім", items([
      ["free-women-clothing", "Женское", "Әйелдерге", ["free", "clothing"]], ["free-men-clothing", "Мужское", "Ерлерге", ["free", "clothing"]], ["free-shoes", "Обувь", "Аяқ киім", ["free", "shoes"]]
    ], ["free"]), ["free"]),
    branch("free-kids", "Детское", "Балаларға", items([
      ["free-kids-clothing", "Одежда и обувь", "Киім және аяқ киім", ["free", "kidsClothing"]], ["free-kids-toys", "Игрушки", "Ойыншықтар", ["free", "toy"]], ["free-kids-gear", "Коляски, мебель и уход", "Арба, жиһаз және күтім", ["free", "goods", "freeKidsGear"]]
    ], ["free"]), ["free"]),
    branch("free-electronics", "Электроника", "Электроника", items([
      ["free-phones-computers", "Телефоны и компьютеры", "Телефондар мен компьютерлер", ["free", "goodsBrand", "freePhoneComputer"]], ["free-home-appliances", "Бытовая техника", "Тұрмыстық техника", ["free", "appliance", "genericAppliance"]], ["free-electronics-parts", "На запчасти", "Қосалқы бөлшекке", ["free", "goods"]]
    ], ["free"]), ["free"]),
    fallbackLeaf("free-other", "Другое", "Басқа", ["free"]),
  ]),
  overlay("exchange", [
    branch("exchange-transport", "Транспорт", "Көлік", items([
      ["exchange-cars", "Легковые автомобили", "Жеңіл автомобильдер", ["exchange", "passengerCarExchange", "vehicleCompliance"]],
      ["exchange-moto", "Мототранспорт", "Мотокөлік", ["exchange", "motorcycleExchange"]],
      ["exchange-commercial-vehicles", "Коммерческий транспорт", "Коммерциялық көлік", ["exchange", "commercialVehicle"]],
      ["exchange-parts", "Запчасти", "Қосалқы бөлшектер", ["exchange", "autoPart"]]
    ], ["exchange", "transportSimple"]), ["exchange", "transportSimple"]),
    branch("exchange-property", "Недвижимость", "Жылжымайтын мүлік", items([
      ["exchange-flats", "Квартиры", "Пәтерлер", ["exchange", "flatSale", "propertyDocsUtilities"]],
      ["exchange-houses", "Дома", "Үйлер", ["exchange", "house", "propertyDocsUtilities", "houseRenovationCompatible"]],
      ["exchange-land-commercial", "Участки и коммерческая недвижимость", "Жер және коммерциялық мүлік", ["exchange", "land", "propertyDocsUtilities", "exchangePropertyMixed"]]
    ], ["exchange", "flatSale"]), ["exchange", "flatSale"]),
    branch("exchange-electronics", "Электроника", "Электроника", items([
      ["exchange-phones", "Телефоны и планшеты", "Телефондар мен планшеттер", ["exchange", "goodsBrand", "deviceSpecs", "exchangeMobileDevice"]],
      ["exchange-computers", "Компьютеры", "Компьютерлер", ["exchange", "computer"]],
      ["exchange-gaming", "Игровые приставки и игры", "Ойын консольдары мен ойындар", ["exchange", "gaming", "exchangeGaming"]],
      ["exchange-appliances", "Бытовая техника", "Тұрмыстық техника", ["exchange", "appliance", "genericAppliance"]]
    ], ["exchange", "goodsBrand"]), ["exchange", "goodsBrand"]),
    fallbackLeaf("exchange-other", "Другое", "Басқа", ["exchange", "goods"]),
  ]),
];
