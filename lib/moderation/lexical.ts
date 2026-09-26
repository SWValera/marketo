import type {Rule} from './contracts.ts';
import {normalizeLexicalText,type LexicalToken} from './normalize.ts';
import {LEXICAL_VERSION,lexicalConfigSchema,type LexicalResult,type LexicalConfig} from './lexical-contract.ts';
type Pattern=LexicalConfig['patterns'][number];
type Occurrence={start:number;end:number;clause:number;parts?:Occurrence[]};
type Term={key:string;words:string[];prefix:boolean};
type CompiledPattern={pattern:Pattern;terms:string[];groups:string[][];regex?:RegExp};
type CompiledRule={rule:Rule;patterns:CompiledPattern[]};
export type CompiledLexical={rules:CompiledRule[];exact:Map<string,Term[]>;prefix:Map<string,Term[]>};
/** Compile each immutable job snapshot once; never issue word-by-word DB reads. */
export function compileLexicalRules(rules:Rule[]):CompiledLexical{
 const exact=new Map<string,Term[]>(),prefix=new Map<string,Term[]>(),known=new Map<string,Term>();
 const term=(raw:string)=>{
  const isPrefix=raw.endsWith('*'),words=normalizeLexicalText(isPrefix?raw.slice(0,-1):raw).tokens.map(t=>t.value),key=words.join(' ')+(isPrefix?'*':'');
  if(!words.length||words.length>12)throw Error('invalid_lexical_phrase');
  if(!known.has(key)){const item={key,words,prefix:isPrefix};known.set(key,item);const map=isPrefix&&words.length===1?prefix:exact,index=map===prefix?words[0].slice(0,4):words[0];map.set(index,[...map.get(index)??[],item]);}return key;
 };
 const compiled:CompiledRule[]=[];
 for(const rule of rules.filter(r=>r.enabled&&r.config.lexical)){
  const config=lexicalConfigSchema.parse(rule.config.lexical);
  if(config.rule_code!==rule.code||config.ruleset_version!==rule.ruleset_version)throw Error('lexical_ruleset_mismatch');
  compiled.push({rule,patterns:config.patterns.map(pattern=>({pattern,terms:(pattern.terms??[]).map(term),groups:(pattern.groups??[]).map(g=>g.map(term)),...(pattern.regex?{regex:new RegExp(pattern.regex,'u')}:{})}))});
 }
 return {rules:compiled,exact,prefix};
}
function occurrences(tokens:LexicalToken[],compiled:CompiledLexical){
 const hits=new Map<string,Occurrence[]>();
 for(let i=0;i<tokens.length;i++)for(const term of [...compiled.exact.get(tokens[i].value)??[],...compiled.prefix.get(tokens[i].value.slice(0,4))??[]]){
  if(term.words.every((w,k)=>{const token=tokens[i+k],value=token?.value;return token?.clause===tokens[i].clause&&value!==undefined&&(term.prefix&&k===term.words.length-1?value.startsWith(w):value===w);})){const list=hits.get(term.key)??[];if(list.length>=256)throw Error('lexical_match_limit');list.push({start:i,end:i+term.words.length-1,clause:tokens[i].clause});hits.set(term.key,list);}
 }
 return hits;
}
function matchPattern(p:CompiledPattern,hits:Map<string,Occurrence[]>,tokens:LexicalToken[]):Occurrence[]{
 const all=(keys:string[])=>keys.flatMap(k=>hits.get(k)??[]);
 if(p.regex)return tokens.flatMap((t,i)=>t.value.length<=64&&p.regex!.test(t.value)?[{start:i,end:i,clause:t.clause}]:[]);
 if(p.groups.length){
  const groups=p.groups.map(all),out:Occurrence[]=[];
  for(const anchor of groups[0]){
   const parts=[anchor];let start=anchor.start,end=anchor.end;
   for(const group of groups.slice(1)){
    const found=group.find(o=>o.clause===anchor.clause&&Math.max(end,o.end)-Math.min(start,o.start)<=p.pattern.max_distance&&!(o.start===anchor.start&&o.end===anchor.end));
    if(!found)break;parts.push(found);start=Math.min(start,found.start);end=Math.max(end,found.end);
   }
   if(parts.length===groups.length)out.push({...anchor,parts});
  }return out;
 }
 return all(p.terms).filter(o=>p.pattern.type==='obfuscated_match'?tokens.slice(o.start,o.end+1).some(t=>t.obfuscated):p.pattern.type==='transliteration_match'?tokens.slice(o.start,o.end+1).some(t=>t.transliterated):true);
}
function negated(tokens:LexicalToken[],o:Occurrence){
 const before=tokens.slice(Math.max(0,o.start-2),o.start).filter(t=>t.clause===o.clause).map(t=>t.value);
 const after=tokens.slice(o.end+1,o.end+4).filter(t=>t.clause===o.clause).map(t=>t.value);
 return before.includes('не')||before.includes('нот')||after.includes('емес');
}
/** No raw text, excerpts, offsets or account data leave this function. */
export async function evaluateLexical(text:string,compiled:CompiledLexical,{aiAvailable=true}:{aiAvailable?:boolean}={}):Promise<LexicalResult>{
 const normalized=normalizeLexicalText(text),{tokens}=normalized,hits=occurrences(tokens,compiled);
 const hard=new Set<string>(),suspicious=new Set<string>(),exceptions=new Set<string>(),confirmed=new Set<string>(),review=new Set<string>(),benign=new Set<string>(),matched=new Set<string>(),reasons=new Set<string>();let obfuscated=false,transliterated=false;
 for(const {rule,patterns} of compiled.rules){
  const active=patterns.map(p=>({p,matches:matchPattern(p,hits,tokens)}));
  const exceptionMatches=active.filter(x=>x.p.pattern.level==='exception').flatMap(x=>x.matches.filter(o=>!negated(tokens,o)).map(o=>({o,p:x.p.pattern})));
  let ruleRisk=false,ruleBenign=false;
  for(const {p,matches} of active.filter(x=>x.p.pattern.level!=='exception'))for(const occurrence of matches){
   matched.add(rule.code);const scope=exceptionMatches.filter(e=>e.o.clause===occurrence.clause&&Math.max(e.o.start-occurrence.end,occurrence.start-e.o.end,0)<=e.p.max_distance);
   scope.forEach(e=>exceptions.add(e.p.code));
   const span=occurrence.parts??[occurrence];for(const part of span){obfuscated||=tokens.slice(part.start,part.end+1).some(t=>t.obfuscated);transliterated||=tokens.slice(part.start,part.end+1).some(t=>t.transliterated);}
   if(p.pattern.level==='hard'){
    hard.add(p.pattern.code);
    if(scope.length||span.some(o=>negated(tokens,o))){ruleRisk=true;reasons.add('hard_context_conflict');}
    else if(rule.legal_status==='JEVU_POLICY'&&rule.action==='REJECTED'&&rule.ruleset_version){confirmed.add(rule.code);reasons.add('confirmed_policy_offer');}
    else {ruleRisk=true;reasons.add('policy_review_required');}
   }else{
    suspicious.add(p.pattern.code);
    if(scope.some(e=>e.p.effect==='benign')){ruleBenign=true;reasons.add('bounded_benign_context');}
    else {ruleRisk=true;reasons.add('suspicious_lexical_context');}
   }
  }
  if(ruleRisk&&!confirmed.has(rule.code))review.add(rule.code);if(ruleBenign&&!ruleRisk&&!confirmed.has(rule.code))benign.add(rule.code);
 }
 obfuscated||=matched.size>0&&/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/.test(text);
 const routing=confirmed.size?'DETERMINISTIC_REJECT':review.size?(aiAvailable?'SEND_TO_AI':'HUMAN_REVIEW'):'NO_TEXT_RISK';
 if(routing==='NO_TEXT_RISK')reasons.add('no_text_risk_is_not_approval');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized.normalized))),b=>b.toString(16).padStart(2,'0')).join('');
 const sorted=(set:Set<string>)=>[...set].sort();
 return {version:LEXICAL_VERSION,normalized_text_hash:hash,ruleset_versions:[...new Set(compiled.rules.map(r=>r.rule.ruleset_version))].sort(),matched_rule_codes:sorted(matched),matched_hard_patterns:sorted(hard),matched_suspicious_patterns:sorted(suspicious),matched_exception_patterns:sorted(exceptions),confirmed_rule_codes:sorted(confirmed),review_rule_codes:sorted(review),benign_rule_codes:sorted(benign),finding_codes:sorted(new Set([...confirmed,...review])),lexical_risk:confirmed.size?'high':review.size?'medium':benign.size?'low':'none',routing_decision:routing,reason_codes:sorted(reasons),obfuscation_detected:obfuscated,transliteration_detected:transliterated};
}
export function semanticCallRequired(local:LexicalResult|undefined,hasImages:boolean){
 // A local rejection needs no semantic call. Clean text never waives Vision/OCR.
 return local?.routing_decision!=='DETERMINISTIC_REJECT'&&(hasImages||local?.routing_decision!=='NO_TEXT_RISK');
}
