import {z} from 'zod';
import {canonicalFindingFamily,type CanonicalFindingFamily} from './finding-taxonomy.ts';
export const LEXICAL_VERSION='jevu-lexical-2';
export const lexicalRuleCodes=['vape','tobacco','nicotine','weapon','ammunition','explosive','drugs','illegal_precursors','forged_document','stolen_payment_data','illegal_service','regulated','adult_content'] as const;
export const matcherTypes=['exact_phrase','token_combination','regex_safe','proximity_match','normalized_keyword','transliteration_match','obfuscated_match','context_exception'] as const;
const term=z.string().min(1).max(100).refine(s=>/^[\p{L}\p{N}@ ._-]+\*?$/u.test(s)&&(!s.endsWith('*')||s.replace(/[^\p{L}]/gu,'').length>=4),'Invalid bounded lexical term');
export const lexicalPatternSchema=z.object({
 code:z.string().regex(/^[a-z][a-z0-9_]{1,70}$/),type:z.enum(matcherTypes),level:z.enum(['hard','suspicious','exception']),languages:z.array(z.enum(['ru','kk','mixed','latin'])).min(1),
 terms:z.array(term).max(100).optional(),groups:z.array(z.array(term).min(1).max(80)).min(2).max(4).optional(),
 max_distance:z.number().int().min(1).max(12).default(6),regex:z.string().max(100).optional(),effect:z.enum(['benign','review']).optional(),
 anchor_scope:z.literal('contains').optional(),routing:z.literal('HUMAN_REVIEW').optional(),
 contextualizes:z.object({rule_code:z.enum(lexicalRuleCodes),group_index:z.number().int().min(1).max(3)}).strict().optional(),
}).strict().superRefine((p,ctx)=>{
 const bad=()=>ctx.addIssue({code:'custom',message:'Invalid matcher contract'});
 if(p.level==='exception'&&p.type!=='context_exception'||p.type==='context_exception'&&(p.level!=='exception'||!p.effect))bad();
 if(['token_combination','proximity_match'].includes(p.type)){if(!p.groups||p.terms||p.regex)bad();}
 else if(p.type==='regex_safe'){
  // An anchored sequence of literal characters/classes only: no quantifiers,
  // backreferences, lookarounds or alternation. Applied to one bounded token.
  if(!p.regex||!/^\^(?:[\p{L}\p{N}]|\[[\p{L}\p{N}]{1,16}\]){1,64}\$$/u.test(p.regex)||p.groups||p.terms||p.level!=='suspicious')bad();
 }else if(!p.terms?.length||p.groups||p.regex)bad();
 if(p.level==='hard'&&!['exact_phrase','token_combination','proximity_match'].includes(p.type))bad();
 if(p.anchor_scope&&p.type!=='context_exception'||p.routing&&p.level!=='suspicious')bad();
 if(p.contextualizes&&(p.level!=='hard'||!p.groups||p.contextualizes.group_index>=p.groups.length))bad();
});
export const lexicalConfigSchema=z.object({
 version:z.enum(['jevu-lexical-1',LEXICAL_VERSION]),ruleset_version:z.string().regex(/^[a-zA-Z0-9_.-]{1,64}$/),rule_code:z.enum(lexicalRuleCodes),
 canonical_finding_family:z.string().max(60).optional(),
 patterns:z.array(lexicalPatternSchema).min(1).max(32),
}).strict().superRefine((c,ctx)=>{
 if(new Set(c.patterns.map(p=>p.code)).size!==c.patterns.length)ctx.addIssue({code:'custom',message:'Duplicate pattern code'});
 if((c.version===LEXICAL_VERSION||c.canonical_finding_family!==undefined)&&c.canonical_finding_family!==canonicalFindingFamily(c.rule_code))ctx.addIssue({code:'custom',message:'Invalid canonical family'});
});
export type LexicalConfig=z.infer<typeof lexicalConfigSchema>;
export type LexicalRouting='DETERMINISTIC_REJECT'|'SEND_TO_AI'|'HUMAN_REVIEW'|'NO_TEXT_RISK';
export type LexicalAIState='READY'|'DISABLED'|'UNAVAILABLE'|'PROVIDER_ERROR';
export type LexicalExecution={execution_decision:'REJECT'|'HUMAN_REVIEW'|'CONTINUE_PIPELINE';fallback_reason:'AI_DISABLED'|'AI_UNAVAILABLE'|'AI_PROVIDER_ERROR'|null};
export type LexicalResult={
 lexical_engine_version:typeof LEXICAL_VERSION;normalized_text_hash:string;ruleset_version:string;matched_rule_codes:string[];
 matched_hard_patterns:string[];matched_suspicious_patterns:string[];matched_exception_patterns:string[];
 confirmed_rule_codes:string[];review_rule_codes:string[];benign_rule_codes:string[];finding_codes:string[];
 lexical_risk:'high'|'medium'|'low'|'none';lexical_routing_decision:LexicalRouting;reason_codes:string[];obfuscation_detected:boolean;transliteration_detected:boolean;
 findings:{source_rule_code:string;canonical_finding_family:CanonicalFindingFamily}[];canonical_finding_families:CanonicalFindingFamily[];
}&LexicalExecution;
