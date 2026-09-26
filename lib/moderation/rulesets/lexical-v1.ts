// Canonical authoring source for moderation_rules.config.lexical. Loaded by the
// release/offline tools, not by React or the production matcher. No legal claims.
import {lexicalConfigSchema,type LexicalConfig} from '../lexical-contract.ts';
import type {Rule} from '../contracts.ts';
export const LEXICAL_RULESET_VERSION='kz-policy-2026-09-26.2';
export const LEXICAL_BASE_VERSION='kz-policy-2026-09-26.1';
const languages=['ru','kk','mixed','latin'] as const;
const offer=['продам','продаю','продажа','продается','продаются','в продаже','в наличии','оптом','предлагаю','предлагается','предлагаются','предлагаем','упаковками','сатамын','сатылады','сатуды ұсынамын','ұсынамын','ұсынылады','көтерме','сатылымда','satamyn','satylady','satylymda','prod am','prodam','prodaju','for sale'];
const educational=['книга*','учебник*','пособие*','энциклопедия*','исследование*','профилактика*','о вреде','кітап*','оқулық*','зерттеу*','зияны туралы','алдын алу','kitap','oqulyq','book'];
const toys=['игрушка*','игрушечн*','ойыншық*','ойыншығ*','балаларға арналған ойыншық','toy','oyinshyq'];
const accessories=['чехол*','аксессуар*','қап','қаптар','қабы','accessory','case'];
const props=['макет*','реквизит*','сценическ*','муляж*','сувенир*','коллекционн*','сахна*','коллекциялық','кәдесый*','replica','prop'];
const negation=['не продаю','не продам','не продается','не для продажи','сатпаймын','сатылмайды','сатуға арналмаған','not for sale'];
type Pattern=LexicalConfig['patterns'][number];
const p=(code:string,type:Pattern['type'],level:Pattern['level'],data:Partial<Pattern>):Pattern=>({code,type,level,languages:[...languages],max_distance:6,...data});
const patterns:Record<string,Pattern[]>={};
function family(code:string,terms:string[],saleItems:string[],extra:Pattern[]=[],safeTerms:string[]=[],prop=false){
 const group=[
  p(code+'_candidate','normalized_keyword','suspicious',{terms}),
  p(code+'_latin','transliteration_match','suspicious',{terms}),
  p(code+'_obfuscated','obfuscated_match','suspicious',{terms}),
  p(code+'_education','context_exception','exception',{terms:educational,effect:'benign'}),
  p(code+'_negation','context_exception','exception',{terms:negation,effect:'review'}),
 ];
 if(saleItems.length)group.push(p(code+'_offer','proximity_match','hard',{groups:[saleItems,offer],max_distance:8}));
 if(safeTerms.length)group.push(p(code+'_safe_context','context_exception','exception',{terms:safeTerms,effect:'benign'}));
 if(prop)group.push(p(code+'_prop','context_exception','exception',{terms:props,effect:'review'}));
 patterns[code]=[...group,...extra];
}
const vape=['вейп*','vape*','veip*','электронная сигарета*','электронные сигареты','электронды темекі*','электрондық темекі*','одноразк*','парилк*','бу тартуға','бу шығаратын құрылғы*','бір реттік құрылғы*'];
family('vape',vape,vape,[
 p('vape_liquid','exact_phrase','hard',{terms:['жидкость для вейпа','жидкости для вейпа','ароматизаторы для вейпа','вейпке арналған сұйықтық','вейп сұйықтығы']}),
 p('vape_bulk_flavours','token_combination','hard',{groups:[['одноразк*'],['в наличии','оптом','упаковками']],max_distance:8}),
 p('vape_variant','regex_safe','suspicious',{regex:'^в[еэ]ип$'}),
],accessories.concat(toys));
const tobacco=['табак*','табачн*','сигарет*','темекі*','tobacco','temeki','sigarety'];
family('tobacco',tobacco,tobacco,[],accessories);
const nicotine=['никотин*','nicotine','nikotin','снюс*','snus','насвай*','насыбай*','никотинді қалташа*'];
family('nicotine',nicotine,nicotine,[],['лечебный пластырь','лечение зависимости','медицинский препарат','емдік дәрі','тәуелділікті емдеу']);
const weapons=['оружие','оружия','огнестрельн*','пистолет*','ружье','винтовк*','ствол*','қару*','мылтық*','qaru','pistolet','pistol','weapon','gun'];
family('weapon',weapons,['боевой пистолет','настоящий пистолет','огнестрельное оружие','действующее оружие','атыс қару*','мылтық*','қару','qaru'],[],toys.concat(['ствол дерева','ствол яблони','деревянный ствол','ағаш діңі','спортивный снаряд']),true);
const ammo=['боеприпас*','патрон*','оқ дәрі','оқ дәрі*','оқдәрі*','ammunition','oq dari'];
family('ammunition',ammo,['боеприпас*','боевые патроны','настоящие патроны','патроны для стрельбы','оқ дәрі','оқ дәрі*','оқдәрі*','ammunition'],[],['электрический патрон','патрон для лампы','патрон для дрели','патрон светильника','шам патроны','бос гильза','пустые гильзы'],true);
const explosives=['взрывчат*','взрывное устройство','взрывател*','детонатор*','жарылғыш*','жарғыш*','explosive','detonator','zharylgysh'];
family('explosive',explosives,explosives,[],[],true);
const drugs=['наркотик*','наркотическ*','мефедрон*','героин*','кокаин*','есірткі*','есірткіні','kokain','heroin','mefedron','marijuana','трава','закладк*'];
family('drugs',drugs,drugs.filter(t=>!['трава','закладк*'].includes(t)),[],['газонная трава','трава для газона','луговая трава','закладка для книги','книжная закладка','шөп шабу','көгал шөбі']);
const precursors=['прекурсор*','precursor','prekursor','химическое сырье','химические реактивы','химиялық шикізат'];
family('illegal_precursors',precursors,[],[
 p('illegal_precursors_intent','token_combination','hard',{groups:[precursors,['для изготовления наркотиков','для незаконного производства наркотиков','для незаконного оборота','есірткі жасауға','есірткіні заңсыз жасау','есірткі өндіруге'],offer],max_distance:12}),
],[],true);
const docs=['поддельн*','фиктивн*','жалған құжат*','жалған төлқұжат*','fake document','fake passport','документ*','төлқұжат*','удостоверени*','без документов','құжатсыз'];
family('forged_document',docs,[],[
 p('forged_document_offer','token_combination','hard',{groups:[['поддельный паспорт','фиктивный паспорт','поддельные документы','жалған құжат*','жалған төлқұжат*','fake passport','fake document'],['сделаю','изготовлю','продам','предлагаю','жасаймын','ұсынамын','сатамын','сатылады','for sale']],max_distance:10}),
],['документы на автомобиль','құжаттары бар','техническая документация','руководство пользователя'],true);
const payments=['украденные карты','украденные данные','данные карт*','данные банковских карт','платежные данные','ұрланған карта*','ұрланған төлем*','карта деректері','stolen card*','card data'];
family('stolen_payment_data',payments,[],[
 p('stolen_payment_data_offer','token_combination','hard',{groups:[['украденные карты','украденные данные','украденные платежные данные','ұрланған карта*','ұрланған төлем*','stolen card*'],offer],max_distance:10}),
],['карта памяти','географическая карта','тестовые платежные данные','test card','test document','сынақ картасы']);
const illegal=['взлом*','vzlom','аккаунт с балансом','обнал*','заказное убийство','чужой аккаунт','рұқсатсыз кіру','келісімінсіз','бөгде тіркелгі*','аккаунт бұзу'];
family('illegal_service',illegal,[],[
 p('illegal_service_intrusion','token_combination','hard',{groups:[['взломаю','взлом','vzlom','аккаунт бұзу','кіру қызметін'],['чужой аккаунт','без согласия','без разрешения','рұқсатсыз','келісімінсіз'],['за деньги','услуга','ақшаға','ұсынамын']],max_distance:12}),
 p('illegal_service_violent_offer','proximity_match','hard',{groups:[['заказное убийство','тапсырыспен кісі өлтіру'],['услуга','услуги','предлагаю','ұсынамын']],max_distance:6}),
],['восстановление своего аккаунта','защита от взлома','проверка по договору','келісіммен тексеру','өз аккаунтымды']);
// Existing review-only families remain review-only, with no new legal assertions.
family('regulated',['лекарств*','дәрі дәрмек','алкогол*','ішімдік*','пестицид*','редкое животное'],[],[],[],true);
family('adult_content',['порнограф*','порнография'],[]);
export const lexicalConfigs=Object.fromEntries(Object.entries(patterns).map(([code,list])=>[code,lexicalConfigSchema.parse({version:'jevu-lexical-1',ruleset_version:LEXICAL_RULESET_VERSION,rule_code:code,patterns:list})]));
export function withLexicalRules<T extends Pick<Rule,'code'|'config'>>(rules:T[]){
 return rules.map(rule=>{const lexical=lexicalConfigs[rule.code];if(!lexical)throw Error('unknown_lexical_rule_code');return {...rule,ruleset_version:LEXICAL_RULESET_VERSION,config:{...rule.config,lexical}};});
}
export function lexicalInventory(){const all=Object.values(lexicalConfigs).flatMap(c=>c.patterns);return {ruleset_version:LEXICAL_RULESET_VERSION,families:Object.keys(lexicalConfigs).length,patterns:all.length,hard:all.filter(p=>p.level==='hard').length,suspicious:all.filter(p=>p.level==='suspicious').length,exceptions:all.filter(p=>p.level==='exception').length,matcher_types:[...new Set(all.map(p=>p.type))]};}
