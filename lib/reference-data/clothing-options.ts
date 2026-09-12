import type { SeedAttributeDefinition as Attribute, SeedAttributeOption as Option } from "./category-attribute-schemas.ts";
const op = (value: string, ru: string, kk = ru): Option => ({ value, label: { ru, kk } });
export const productColor: Attribute = {
  key: "color", label: { ru: "Цвет", kk: "Түсі" }, dataType: "select", filterable: true, filterMode: "exact",
  options: [op("black","Чёрный","Қара"),op("white","Белый","Ақ"),op("gray","Серый","Сұр"),op("silver","Серебристый","Күміс"),op("blue","Синий","Көк"),op("light-blue","Голубой","Көгілдір"),op("red","Красный","Қызыл"),op("green","Зелёный","Жасыл"),op("brown","Коричневый","Қоңыр"),op("beige","Бежевый","Сарғыш"),op("pink","Розовый","Қызғылт"),op("purple","Фиолетовый","Күлгін"),op("yellow","Жёлтый","Сары"),op("orange","Оранжевый","Қызғылт сары"),op("gold","Золотистый","Алтын"),op("transparent","Прозрачный","Мөлдір"),op("multicolor","Разноцветный","Түрлі түсті"),op("other","Другой","Басқа")],
};
export const fabricOptions: Option[] = [
  op("cotton","Хлопок","Мақта"),op("linen","Лён","Зығыр"),op("wool","Шерсть","Жүн"),op("cashmere","Кашемир","Кашемир"),op("silk","Шёлк","Жібек"),op("viscose","Вискоза","Вискоза"),op("lyocell","Лиоцелл","Лиоцелл"),op("modal","Модал","Модал"),op("polyester","Полиэстер","Полиэстер"),op("polyamide","Полиамид / нейлон","Полиамид / нейлон"),op("acrylic","Акрил","Акрил"),op("elastane","Эластан","Эластан"),op("leather","Натуральная кожа","Табиғи былғары"),op("suede","Замша","Күдері"),op("faux-leather","Искусственная кожа","Жасанды былғары"),op("fur","Натуральный мех","Табиғи тері"),op("faux-fur","Искусственный мех","Жасанды тері"),op("mixed","Смешанный состав","Аралас құрам"),op("other","Другой материал","Басқа материал"),
];
const custom = (key: string, selected: string, labelRu: string, labelKk: string, placeholderRu: string, placeholderKk: string): Attribute => ({
  key: `${key}_other`, label: { ru: labelRu, kk: labelKk }, dataType: "text", searchable: true,
  validation: { maxLength: 160, placeholder: { ru: placeholderRu, kk: placeholderKk }, visibleWhen: { key, values: [selected] }, requiredWhen: { key, values: [selected] } },
});
export function clothingSizeFields(children = false): Attribute[] {
  const options = children
    ? [44,50,56,62,68,74,80,86,92,98,104,110,116,122,128,134,140,146,152,158,164,170,176,182].map(n => op(`height-${n}`, `${n} см (рост)`, `${n} см (бой)`))
    : [...["XXS","XS","S","M","L","XL","XXL","3XL","4XL","5XL","6XL","7XL","8XL"].map(name => op(`int-${name.toLowerCase()}`,name)),
      ...Array.from({length:20},(_,i) => 32+i*2).map(n => op(`ru-${n}`,`${n} RU`)),
      ...Array.from({length:18},(_,i) => 30+i*2).map(n => op(`eu-${n}`,`${n} EU`)),
      ...Array.from({length:29},(_,i) => 24+i).map(n => op(`waist-${n}`,`W${n} (джинсы)`,`W${n} (джинсы)`))];
  return [
    { key:"size",label:{ru:children?"Размер по росту":"Размер одежды",kk:children?"Бой бойынша өлшем":"Киім өлшемі"},dataType:"select",filterable:true,filterMode:"exact",options:[...options,op("one-size","Единый размер","Бір өлшем"),op("other-size","Другой размер","Басқа өлшем")] },
    custom("size","other-size","Укажите размер","Өлшемді көрсетіңіз","Размер и система обозначений с этикетки","Жапсырмадағы өлшем мен белгілеу жүйесі"),
  ];
}
export function shoeSizeFields(children = false): Attribute[] {
  const start=children?16:30,end=children?43:55;
  return [
    {key:"size",label:{ru:"Размер обуви EU",kk:"Аяқ киім өлшемі EU"},dataType:"select",filterable:true,filterMode:"exact",options:[...Array.from({length:(end-start)*2+1},(_,i)=>start+i/2).map(n=>op(String(n),`${n} EU`)),op("other-size","Другой размер","Басқа өлшем")]},
    custom("size","other-size","Укажите размер обуви","Аяқ киім өлшемін көрсетіңіз","Размер и система, например: 10 US / 9 UK","Өлшем мен жүйесі, мысалы: 10 US / 9 UK"),
  ];
}
export const clothingMaterialFields: Attribute[] = [
  {key:"material",label:{ru:"Материал / состав",kk:"Материал / құрам"},dataType:"multiselect",filterable:true,filterMode:"exact",options:fabricOptions},
  custom("material","other","Укажите материал","Материалды көрсетіңіз","Точный материал или состав по этикетке","Жапсырмадағы нақты материал немесе құрам"),
];
