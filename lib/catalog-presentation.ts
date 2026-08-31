import type { CategoryNode, LocalizedText } from "./catalog-config.ts";

type Locale = keyof LocalizedText;

type PresentationProfile = {
  searchPrefix: LocalizedText;
  titlePrefix: LocalizedText;
  description: LocalizedText;
};

export type ContextualCategoryPresentation = {
  searchPlaceholder: LocalizedText;
  titlePlaceholder: LocalizedText;
  descriptionHint: LocalizedText;
};

const profile = (
  searchRu: string,
  searchKk: string,
  titleRu: string,
  titleKk: string,
  descriptionRu: string,
  descriptionKk: string,
): PresentationProfile => ({
  searchPrefix: { ru: searchRu, kk: searchKk },
  titlePrefix: { ru: titleRu, kk: titleKk },
  description: { ru: descriptionRu, kk: descriptionKk },
});

/**
 * Source of truth for category-facing helper text. The selected category name
 * is included in every field, so a leaf can never inherit an example from an
 * unrelated sibling while each vertical keeps practical RU/KK guidance.
 */
export const CATEGORY_PRESENTATION_PROFILES: Record<string, PresentationProfile> = {
  transport: profile(
    "Поиск транспорта", "Көлікті іздеу",
    "Укажите марку, модель и год", "Маркасын, моделін және жылын көрсетіңіз",
    "Укажите тип транспорта, марку, модель, год, состояние и важные технические данные.",
    "Көлік түрін, маркасын, моделін, жылын, күйін және маңызды техникалық деректерін көрсетіңіз.",
  ),
  parts: profile(
    "Поиск запчастей", "Қосалқы бөлшектерді іздеу",
    "Укажите деталь и совместимость", "Бөлшек пен үйлесімділігін көрсетіңіз",
    "Укажите деталь, совместимость, производителя, артикул и состояние.",
    "Бөлшекті, үйлесімділігін, өндірушісін, артикулын және күйін көрсетіңіз.",
  ),
  "real-estate": profile(
    "Поиск недвижимости", "Жылжымайтын мүлікті іздеу",
    "Укажите объект и ключевые параметры", "Нысан мен негізгі параметрлерді көрсетіңіз",
    "Укажите тип сделки, площадь, расположение, состояние объекта и условия.",
    "Мәміле түрін, ауданын, орналасуын, нысанның күйін және шарттарын көрсетіңіз.",
  ),
  jobs: profile(
    "Поиск вакансий", "Бос орындарды іздеу",
    "Укажите должность и условия вакансии", "Лауазым мен бос орын шарттарын көрсетіңіз",
    "Для вакансии опишите обязанности, требования, график, формат работы и условия оплаты.",
    "Бос орын үшін міндеттерді, талаптарды, кестені, жұмыс форматын және төлем шарттарын сипаттаңыз.",
  ),
  services: profile(
    "Поиск услуг", "Қызметтерді іздеу",
    "Укажите конкретную услугу", "Нақты қызметті көрсетіңіз",
    "Опишите состав услуги, результат, сроки, опыт исполнителя и порядок расчёта.",
    "Қызмет құрамын, нәтижесін, мерзімін, орындаушы тәжірибесін және есеп айырысу тәртібін сипаттаңыз.",
  ),
  "construction-repair": profile(
    "Поиск строительных товаров", "Құрылыс тауарларын іздеу",
    "Укажите материал, товар или инструмент", "Материалды, тауарды немесе құралды көрсетіңіз",
    "Укажите назначение, материал, размер, количество, состояние и условия доставки.",
    "Мақсатын, материалын, өлшемін, санын, күйін және жеткізу шарттарын көрсетіңіз.",
  ),
  "goods-rental": profile(
    "Поиск товаров напрокат", "Жалға берілетін тауарларды іздеу",
    "Укажите предмет и срок проката", "Жалға берілетін зат пен мерзімді көрсетіңіз",
    "Укажите срок проката, залог, комплект, доставку и правила использования.",
    "Жалға алу мерзімін, кепілдікті, жиынтықты, жеткізуді және пайдалану ережелерін көрсетіңіз.",
  ),
  electronics: profile(
    "Поиск электроники", "Электрониканы іздеу",
    "Укажите устройство и точную модель", "Құрылғы мен нақты моделін көрсетіңіз",
    "Укажите тип устройства, производителя, точную модель, состояние, комплект и гарантию.",
    "Құрылғы түрін, өндірушісін, нақты моделін, күйін, жиынтығын және кепілдігін көрсетіңіз.",
  ),
  "home-garden": profile(
    "Поиск товаров для дома и сада", "Үй мен бақша тауарларын іздеу",
    "Укажите товар для дома или сада", "Үйге немесе бақшаға арналған тауарды көрсетіңіз",
    "Укажите назначение, размеры, материал, состояние, комплект и доставку.",
    "Мақсатын, өлшемдерін, материалын, күйін, жиынтығын және жеткізуді көрсетіңіз.",
  ),
  personal: profile(
    "Поиск одежды и аксессуаров", "Киім мен аксессуарларды іздеу",
    "Укажите вещь, бренд и размер", "Затты, брендті және өлшемді көрсетіңіз",
    "Укажите тип вещи, бренд, размер, материал, состояние и особенности посадки.",
    "Зат түрін, брендін, өлшемін, материалын, күйін және пішім ерекшеліктерін көрсетіңіз.",
  ),
  kids: profile(
    "Поиск детских товаров", "Балалар тауарларын іздеу",
    "Укажите детский товар и возраст", "Балалар тауары мен жасын көрсетіңіз",
    "Укажите возраст, размеры, состояние, комплект, безопасность и условия передачи.",
    "Жасын, өлшемдерін, күйін, жиынтығын, қауіпсіздігін және беру шарттарын көрсетіңіз.",
  ),
  hobby: profile(
    "Поиск товаров для хобби и спорта", "Хобби мен спорт тауарларын іздеу",
    "Укажите товар, инвентарь или коллекцию", "Тауарды, жабдықты немесе коллекцияны көрсетіңіз",
    "Укажите назначение, модель, состояние, комплект и важные характеристики.",
    "Мақсатын, моделін, күйін, жиынтығын және маңызды сипаттамаларын көрсетіңіз.",
  ),
  animals: profile(
    "Поиск животных и зоотоваров", "Жануарлар мен зоотауарларды іздеу",
    "Укажите животное или зоотовар", "Жануарды немесе зоотауарды көрсетіңіз",
    "Укажите вид, породу, возраст, состояние здоровья, документы и условия содержания.",
    "Түрін, тұқымын, жасын, денсаулық күйін, құжаттарын және күтіп-бағу шарттарын көрсетіңіз.",
  ),
  business: profile(
    "Поиск оборудования и бизнеса", "Жабдықтар мен бизнесті іздеу",
    "Укажите оборудование, сырьё или бизнес", "Жабдықты, шикізатты немесе бизнесті көрсетіңіз",
    "Укажите назначение, производителя, характеристики, состояние, документы и комплект.",
    "Мақсатын, өндірушісін, сипаттамаларын, күйін, құжаттарын және жиынтығын көрсетіңіз.",
  ),
  exchange: profile(
    "Поиск предложений для обмена", "Айырбас ұсыныстарын іздеу",
    "Укажите предмет обмена", "Айырбас затын көрсетіңіз",
    "Опишите предмет, его состояние, комплект и желаемые варианты обмена.",
    "Затты, оның күйін, жиынтығын және қалаған айырбас нұсқаларын сипаттаңыз.",
  ),
  free: profile(
    "Поиск бесплатных предложений", "Тегін ұсыныстарды іздеу",
    "Укажите, что отдаёте бесплатно", "Нені тегін беретініңізді көрсетіңіз",
    "Честно опишите предмет, его состояние, комплект и условия бесплатной передачи.",
    "Затты, оның күйін, жиынтығын және тегін беру шарттарын ашық сипаттаңыз.",
  ),
};

function withCategory(prefix: LocalizedText, name: LocalizedText, locale: Locale) {
  return `${prefix[locale]}: «${name[locale]}»`;
}

function descriptionWithCategory(description: LocalizedText, name: LocalizedText, locale: Locale) {
  const category = locale === "ru" ? "Категория" : "Санат";
  return `${category}: «${name[locale]}». ${description[locale]}`;
}

export function buildContextualCategoryPresentation(
  node: Pick<CategoryNode, "name">,
  rootSlug: string,
): ContextualCategoryPresentation {
  const selected = CATEGORY_PRESENTATION_PROFILES[rootSlug];
  if (!selected) throw new Error(`Missing category presentation profile: ${rootSlug}`);
  return {
    searchPlaceholder: {
      ru: withCategory(selected.searchPrefix, node.name, "ru"),
      kk: withCategory(selected.searchPrefix, node.name, "kk"),
    },
    titlePlaceholder: {
      ru: withCategory(selected.titlePrefix, node.name, "ru"),
      kk: withCategory(selected.titlePrefix, node.name, "kk"),
    },
    descriptionHint: {
      ru: descriptionWithCategory(selected.description, node.name, "ru"),
      kk: descriptionWithCategory(selected.description, node.name, "kk"),
    },
  };
}

export function applyContextualCategoryPresentation(
  nodes: CategoryNode[],
  rootSlug?: string,
): CategoryNode[] {
  for (const node of nodes) {
    const actualRootSlug = rootSlug ?? node.slug;
    Object.assign(node, buildContextualCategoryPresentation(node, actualRootSlug));
    if (node.children?.length) applyContextualCategoryPresentation(node.children, actualRootSlug);
  }
  return nodes;
}
