// Immutable successor to v1. Only scoped exceptions, explicit intent and routing
// metadata change; the existing JEVU policy/legal metadata is copied on release.
import {lexicalConfigs as previous} from './lexical-v1.ts';
import {lexicalConfigSchema,LEXICAL_VERSION} from '../lexical-contract.ts';
import {canonicalFindingFamily} from '../finding-taxonomy.ts';
import type {Rule} from '../contracts.ts';
export const LEXICAL_RULESET_VERSION='kz-policy-2026-09-26.3';
export const LEXICAL_BASE_VERSION='kz-policy-2026-09-26.2';
const configs=structuredClone(previous);
const literalContext=(code:string,terms:string[])=>configs[code].patterns.push({code:code+'_literal_context',type:'context_exception',level:'exception',languages:['ru','kk','mixed','latin'],terms,max_distance:6,effect:'benign',anchor_scope:'contains'});
literalContext('weapon',['водяной пистолет','пистолет для герметика','справочник по истории оружия','қару тарихы жөніндегі еңбек','не оружие','қару емес','қарудың өзі сатылмайды']);
literalContext('ammunition',['никаких боеприпас*','без боеприпас*','оқ дәрі жоқ']);
literalContext('vape',['обзором запрета vape','обзор запрета vape','электронды темекі туралы мақала*']);
literalContext('tobacco',['электронды темекі туралы мақала*','темекі өнімі емес']);
literalContext('nicotine',['никакая никотиновая продукция не продается']);
// A realistic identity-document imitation requires accountable human assessment;
// this narrow direct route is independent of any provider's availability.
configs.forged_document.patterns.push({code:'forged_document_authentic_use',type:'exact_phrase',level:'suspicious',languages:['ru','kk','mixed','latin'],max_distance:6,terms:['как у настоящего документа','использовать как настоящий документ','шынайы құжатқа ұқсайды','түпнұсқаға ұқсайды'],routing:'HUMAN_REVIEW'});
const liquid=configs.vape.patterns.find(p=>p.code==='vape_liquid')!;
liquid.groups=[liquid.terms!,configs.vape.patterns.find(p=>p.code==='vape_offer')!.groups![1]];delete liquid.terms;liquid.type='proximity_match';liquid.max_distance=8;
const precursor=configs.illegal_precursors.patterns.find(p=>p.code==='illegal_precursors_intent')!;
precursor.groups![0].push('сырье','шикізат');
// Drug mentions inside the illegal-purpose group describe use of the precursor,
// not a second offered drug. Separate drug offers must retain their own finding.
precursor.contextualizes={rule_code:'drugs',group_index:1};
export const lexicalConfigs=Object.fromEntries(Object.entries(configs).map(([code,c])=>[code,lexicalConfigSchema.parse({...c,version:LEXICAL_VERSION,ruleset_version:LEXICAL_RULESET_VERSION,canonical_finding_family:canonicalFindingFamily(code)})]));
export function withLexicalRules<T extends Pick<Rule,'code'|'config'>>(rules:T[]){return rules.map(r=>{const lexical=lexicalConfigs[r.code];if(!lexical)throw Error('unknown_lexical_rule_code');return {...r,ruleset_version:LEXICAL_RULESET_VERSION,config:{...r.config,lexical}};});}
export function lexicalInventory(){
 const all=Object.values(lexicalConfigs).flatMap(c=>c.patterns),old=Object.values(previous).flatMap(c=>c.patterns),byCode=new Map(old.map(p=>[p.code,p]));
 return {ruleset_version:LEXICAL_RULESET_VERSION,lexical_engine_version:LEXICAL_VERSION,families:Object.keys(lexicalConfigs).length,patterns_before:old.length,patterns:all.length,added:all.filter(p=>!byCode.has(p.code)).length,modified:all.filter(p=>byCode.has(p.code)&&JSON.stringify(byCode.get(p.code))!==JSON.stringify(p)).length,removed:old.filter(p=>!all.some(n=>n.code===p.code)).length,hard:all.filter(p=>p.level==='hard').length,suspicious:all.filter(p=>p.level==='suspicious').length,exceptions:all.filter(p=>p.level==='exception').length,matcher_types:[...new Set(all.map(p=>p.type))]};
}
