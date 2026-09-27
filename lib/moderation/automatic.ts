import {validateObservations, type AICallResult, type AIObservations} from './ai-contract.ts';
import {decide, finding} from './engine.ts';
import {detectPersonalData} from './normalize.ts';
import {compileLexicalRules, evaluateLexical} from './lexical.ts';
import {findingFamilies} from './finding-taxonomy.ts';
import type {ModerationResult, Rule, Finding} from './contracts.ts';

export type AutomaticSwitches={enabled:boolean;approval:boolean;rejection:boolean};
export type TimelineStep={code:string;status:'PASS'|'FINDING'|'FAILED'|'SKIPPED';duration_ms:number|null};
/** Machine codes only: neither model reasons nor OCR text may reach this trace. */
export type AutomaticTrace={
 version:'jevu-automatic-1';decision_source:'AUTOMATIC';mode:'automatic'|'manual_fallback';
 basis:'deterministic'|'ai_assisted'|'fixable'|'uncertain'|'technical_hold'|'switch_disabled';
 lexical:ModerationResult['lexical']|null;schema_validated:boolean;provider_status:string;
 category:{status:'match'|'mismatch'|'uncertain';confidence:number}|null;
 uncertainty:number|null;ocr_images:number;vision_images:number;
 observations:{code:string;present:boolean;confidence:number;source:string;image_index:number|null;subject:string}[];
 resolved_local_rules:string[];canonical_families:string[];timeline:TimelineStep[];
};
const familyToRule=new Map<string,string>(Object.entries(findingFamilies).map(([rule,family])=>[family,rule]));
const privacy:Record<string,string>={document_visible:'document_visible',possible_identity_document:'document_visible',possible_payment_card:'payment_card',possible_personal_identifier:'personal_id'};
const harmlessSubjects=new Set(['educational','accessory','toy']);
const policyFinding=(rule:Rule,source:Finding['source_type'],index:number|null,confidence:number)=>{
 const f={...finding(rule.code,'REJECTED',source,index??undefined),rule_id:rule.id,confidence};
 f.user_reason_ru='Размещение данного типа товара запрещено правилами JEVU.';
 f.user_reason_kk='JEVU ережелері бойынша тауардың осы түрін орналастыруға тыйым салынған.';
 return f;
};

/** Provider observations are evidence. This local engine alone selects an outcome.
 * Missing/invalid analysis cannot fill a mandatory stage or authorize publication. */
export async function evaluateAutomatic(input:{base:ModerationResult;rules:Rule[];response?:AICallResult;providerStatus:string;switches:AutomaticSwitches;localDurationMs?:number}):Promise<{result:ModerationResult;trace:AutomaticTrace}>{
 const result:ModerationResult=structuredClone(input.base), rules=input.rules.filter(r=>r.enabled);
 const trace:AutomaticTrace={version:'jevu-automatic-1',decision_source:'AUTOMATIC',mode:input.switches.enabled?'automatic':'manual_fallback',basis:'uncertain',lexical:result.lexical??null,schema_validated:false,provider_status:input.providerStatus,category:null,uncertainty:null,ocr_images:0,vision_images:0,observations:[],resolved_local_rules:[],canonical_families:[],timeline:[]};
 let analysis:AIObservations|undefined;
 const hard=result.findings.some(f=>f.source_type==='text'&&f.confidence===1&&f.recommended_action==='REJECTED'&&rules.some(r=>r.id===f.rule_id&&r.code===f.finding_code&&r.legal_status==='JEVU_POLICY'&&r.action==='REJECTED'));
 if(input.response&&input.providerStatus==='success')try{
  analysis=validateObservations(input.response.observations,result.images.map(i=>i.image_index));
  if(input.response.metadata.status!=='success'||input.response.metadata.image_count!==result.images.length)analysis=undefined;
 }catch{trace.provider_status='invalid_schema';}
 if(analysis){
  trace.schema_validated=true;trace.category={status:analysis.category_consistency.status,confidence:analysis.category_consistency.confidence};
  trace.uncertainty=analysis.overall_uncertainty;trace.ocr_images=analysis.visible_text.length;trace.vision_images=analysis.images_checked.length;
  trace.observations=[...analysis.text_observations,...analysis.image_observations].map(({code,present,confidence,source,image_index,subject})=>({code,present,confidence,source,image_index,subject}));
 }
 if(!input.switches.enabled){result.decision='HUMAN_REVIEW';trace.basis='switch_disabled';}
 else if(hard){result.decision=input.switches.rejection?'REJECTED':'HUMAN_REVIEW';trace.basis=input.switches.rejection?'deterministic':'switch_disabled';trace.provider_status='not_required';result.error_code=null;result.findings=result.findings.filter(f=>f.source_type!=='system'||!['provider_unavailable','provider_error'].includes(f.finding_code));}
 else if(result.lexical?.lexical_routing_decision==='HUMAN_REVIEW'){result.decision='HUMAN_REVIEW';trace.basis='uncertain';trace.provider_status='not_required';result.error_code=null;result.findings=result.findings.filter(f=>f.source_type!=='system'||!['provider_unavailable','provider_error'].includes(f.finding_code));}
 else if(!analysis){result.decision='HUMAN_REVIEW';result.error_code='required_stage_unavailable';trace.basis='technical_hold';}
 else {
  // Resolve only the placeholders from the local pass. Real local privacy,
  // technical, fraud and unresolved lexical findings survive the AI call.
  result.findings=result.findings.filter(f=>!(f.source_type==='system'&&['provider_unavailable','provider_error'].includes(f.finding_code)));
  const observations=trace.observations,positive=observations.filter(o=>o.present);
  const uncertainty=analysis.overall_uncertainty>.15||analysis.detected_languages.includes('other')||analysis.image_subjects.some(s=>s.object_type==='uncertain'||s.confidence<.85);
  const contextConflict=positive.some(o=>o.code==='uncertain'||o.subject==='unknown')||positive.some(o=>familyToRule.has(o.code)&&o.subject==='offered_item'&&positive.some(p=>p.code===o.code&&harmlessSubjects.has(p.subject)));
  const lexicalConflict=positive.some(o=>o.subject==='offered_item'&&result.lexical?.benign_rule_codes.includes(familyToRule.get(o.code)??''));
  const conflict=uncertainty||contextConflict||lexicalConflict;
  for(const code of result.lexical?.review_rule_codes??[]){
   const family=findingFamilies[code as keyof typeof findingFamilies];
   const evidence=observations.filter(o=>o.code===family&&o.confidence>=.98);
   if(!conflict&&evidence.length&&evidence.every(o=>!o.present||harmlessSubjects.has(o.subject)||o.subject==='offered_item')){
    result.findings=result.findings.filter(f=>!(f.source_type==='text'&&f.finding_code===code&&f.confidence===.6));trace.resolved_local_rules.push(code);
   }
  }
  for(const o of positive){
   const ruleCode=familyToRule.get(o.code),rule=rules.find(r=>r.code===ruleCode&&r.scope.includes(o.source));
   // An explicitly educational/accessory/toy use is not the prohibited offered item.
   if(rule&&harmlessSubjects.has(o.subject)&&o.confidence>=.98&&!conflict)continue;
   if(rule?.legal_status==='JEVU_POLICY'&&rule.action==='REJECTED'&&o.subject==='offered_item'&&o.confidence>=.98&&!conflict){result.findings.push(policyFinding(rule,o.source as Finding['source_type'],o.image_index,o.confidence));continue;}
   const privacyCode=privacy[o.code],categoryCode=o.code==='image_text_mismatch'?'image_mismatch':o.code==='category_mismatch'?'category_mismatch':null;
   const safeProp=privacyCode&&harmlessSubjects.has(o.subject);
   const code=privacyCode??categoryCode??o.code;
   const fixable=!safeProp&&(privacyCode||categoryCode)&&o.confidence>=(privacyCode ? .85 : .95);
   result.findings.push({...finding(code,fixable?'NEEDS_FIX':'HUMAN_REVIEW',o.source as Finding['source_type'],o.image_index??undefined),confidence:o.confidence,...(rule?{rule_id:rule.id}:{})});
  }
  for(const image of analysis.visible_text){
   for(const code of detectPersonalData(image.text))result.findings.push({...finding(code,'NEEDS_FIX','ocr',image.image_index),confidence:1});
   const lexicalRules=rules.filter(r=>r.config.lexical&&r.scope.includes('ocr'));
   if(lexicalRules.length){
    const ocr=await evaluateLexical(image.text,compileLexicalRules(lexicalRules),{aiState:'READY'});
    for(const code of ocr.finding_codes){
     const rule=lexicalRules.find(r=>r.code===code)!;
     // OCR is provider-derived: a keyword alone never becomes an AI hard block.
     const corroborated=positive.some(o=>o.code===findingFamilies[code as keyof typeof findingFamilies]&&o.subject==='offered_item'&&o.confidence>=.98);
     result.findings.push(ocr.confirmed_rule_codes.includes(code)&&corroborated&&!conflict&&rule.legal_status==='JEVU_POLICY'&&rule.action==='REJECTED'?policyFinding(rule,'ocr',image.image_index,.98):{...finding(code,'HUMAN_REVIEW','ocr',image.image_index),rule_id:rule.id});
    }
   }
  }
  if(analysis.possible_prompt_injection&&!result.findings.some(f=>f.finding_code==='prompt_injection_attempt'))result.findings.push(finding('prompt_injection_attempt','HUMAN_REVIEW','text'));
  if(conflict)result.findings.push(finding('unresolved_context','HUMAN_REVIEW'));
  if(analysis.category_consistency.status!=='match'||analysis.category_consistency.confidence<.9)result.findings.push(finding('category_mismatch',analysis.category_consistency.status==='mismatch'&&analysis.category_consistency.confidence>=.95?'NEEDS_FIX':'HUMAN_REVIEW','category'));
  result.provider='openai';result.provider_version=input.response!.metadata.model;result.ocr_provider='openai_vision_ocr';result.ocr_version=result.provider_version;
  result.stages=result.stages.map(s=>s.code==='ai_text'||/^image_semantic_|^ocr_/.test(s.code)?{...s,status:'PASS',provider:s.code.startsWith('ocr_')?result.ocr_provider:result.provider,version:result.provider_version}:s);
  const failed=result.stages.some(s=>s.status!=='PASS')||result.images.some(i=>i.status!=='PASS');
  result.findings=result.findings.filter((f,i,all)=>all.findIndex(other=>other.finding_code===f.finding_code&&other.source_type===f.source_type&&other.image_index===f.image_index&&other.recommended_action===f.recommended_action)===i).slice(0,100);
  result.risk_score=Math.max(0,...result.findings.map(f=>f.severity==='critical'?100:f.severity==='high'?60:30));
  result.error_code=failed?'required_stage_unavailable':null;
  // Uncertainty has precedence over provider-derived hard blocks. Proven local
  // blocks were handled above; failed checks never reject or publish a listing.
  result.decision=failed||conflict?'HUMAN_REVIEW':decide(result.stages,result.findings,result.risk_score,result.images.length);
  // A proven privacy repair also resolves weaker category/privacy doubts by
  // requiring new content and a complete rerun. It cannot override technical,
  // regulated-item, prop, fraud or other critical uncertainty.
  const repairCodes=new Set(['payment_card','personal_id','document_visible','category_mismatch','image_mismatch']);
  if(!failed&&!conflict&&result.decision==='HUMAN_REVIEW'&&result.findings.some(f=>f.recommended_action==='NEEDS_FIX')&&result.findings.every(f=>repairCodes.has(f.finding_code)))result.decision='NEEDS_FIX';
  trace.basis=failed?'technical_hold':result.decision==='REJECTED'?'ai_assisted':result.decision==='NEEDS_FIX'?'fixable':result.decision==='HUMAN_REVIEW'?'uncertain':'ai_assisted';
  if(result.decision==='APPROVED'&&!input.switches.approval||result.decision==='REJECTED'&&!input.switches.rejection){result.decision='HUMAN_REVIEW';trace.basis='switch_disabled';}
 }
 trace.canonical_families=[...new Set(result.findings.map(f=>findingFamilies[f.finding_code as keyof typeof findingFamilies]??f.finding_code))];
 const imageFailure=result.images.some(i=>i.status!=='PASS'),aiStatus=hard||result.lexical?.lexical_routing_decision==='HUMAN_REVIEW'?'SKIPPED':analysis?'PASS':input.providerStatus==='disabled'||input.providerStatus==='not_eligible'?'SKIPPED':'FAILED';
 trace.timeline=[
  {code:'SUBMITTED',status:'PASS',duration_ms:null},
  {code:'LOCAL_RULES',status:result.lexical?.finding_codes.length?'FINDING':'PASS',duration_ms:input.localDurationMs??null},
  {code:'IMAGE_VALIDATION',status:imageFailure?'FAILED':'PASS',duration_ms:null},
  {code:'AI_ANALYSIS',status:aiStatus,duration_ms:input.response?.metadata.latency_ms??null},
  {code:'VISION',status:aiStatus==='PASS'?(trace.observations.some(o=>o.present&&o.source==='image')?'FINDING':'PASS'):aiStatus,duration_ms:null},
  {code:'OCR',status:aiStatus==='PASS'?(result.findings.some(f=>f.source_type==='ocr')?'FINDING':'PASS'):aiStatus,duration_ms:null},
  {code:'RULE_EVALUATION',status:result.findings.length?'FINDING':'PASS',duration_ms:null},
  {code:'FINAL_DECISION',status:trace.basis==='technical_hold'?'FAILED':result.decision==='APPROVED'?'PASS':'FINDING',duration_ms:null},
 ];
 return {result,trace};
}
