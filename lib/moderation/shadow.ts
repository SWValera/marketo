import type {Rule,ModerationResult} from './contracts.ts';
import {checkRules} from './engine.ts';
import {detectPersonalData} from './normalize.ts';
import {AI_SCHEMA_VERSION,type AIObservations,type AIErrorCode} from './ai-contract.ts';

export type ShadowDecision='SHADOW_APPROVE'|'SHADOW_REJECT'|'SHADOW_NEEDS_FIX'|'SHADOW_HUMAN_REVIEW';
export type ShadowFinding={code:string;source:'text'|'image'|'ocr'|'fraud'|'category';image_index:number|null;confidence:number|null;action:ShadowDecision;rule_code:string|null;reason:string};
export type ShadowResult={schema_version:typeof AI_SCHEMA_VERSION;mode:'shadow';status:'success'|AIErrorCode;recommendation:ShadowDecision;findings:ShadowFinding[];ocr_images:number;languages:string[];uncertainty:number|null;subjects:AIObservations['image_subjects']};
const mapped:Record<string,string>={possible_vape:'vape',possible_tobacco:'tobacco',possible_nicotine_product:'nicotine',possible_weapon:'weapon',possible_ammunition:'ammunition',possible_explosive:'explosive',possible_drug:'drugs',possible_precursor:'illegal_precursors',possible_fake_document:'forged_document',possible_illegal_service:'illegal_service',possible_adult_content:'adult_content'};
export function emptyShadow(status:ShadowResult['status']):ShadowResult{return {schema_version:AI_SCHEMA_VERSION,mode:'shadow',status,recommendation:'SHADOW_HUMAN_REVIEW',findings:[],ocr_images:0,languages:[],uncertainty:null,subjects:[]};}
/** No model prose/OCR is persisted. Deterministic generic reasons are safer than
 * guessing whether a provider's freeform sentence contains a person's name. */
export function evaluateShadow(analysis:AIObservations,rules:Rule[],base:ModerationResult):ShadowResult{
 const out:ShadowResult={...emptyShadow('success'),languages:analysis.detected_languages,uncertainty:analysis.overall_uncertainty,ocr_images:analysis.visible_text.length,subjects:analysis.image_subjects};
 const add=(code:string,source:ShadowFinding['source'],image_index:number|null,confidence:number|null,action:ShadowDecision,rule_code:string|null=null)=>out.findings.push({code,source,image_index,confidence,action,rule_code,reason:code});
 for(const o of [...analysis.text_observations,...analysis.image_observations].filter(o=>o.present)){
  const rule=rules.find(r=>r.enabled&&r.config.observation===mapped[o.code]&&(!r.scope||r.scope.includes(o.source)));
  let action:ShadowDecision='SHADOW_HUMAN_REVIEW';
  if(['document_visible','possible_identity_document','possible_payment_card','possible_personal_identifier','category_mismatch','image_text_mismatch'].includes(o.code)&&o.confidence>=.85)action='SHADOW_NEEDS_FIX';
  if(rule?.legal_status==='JEVU_POLICY'&&rule.action==='REJECTED'&&o.subject==='offered_item'&&o.confidence>=.95&&analysis.overall_uncertainty<=.15)action='SHADOW_REJECT';
  add(o.code,o.source,o.image_index,o.confidence,action,rule?.code??null);
 }
 for(const text of analysis.visible_text){
  for(const code of detectPersonalData(text.text))add(code,'ocr',text.image_index,1,'SHADOW_NEEDS_FIX');
  for(const f of checkRules(text.text,rules,'ocr',text.image_index))add(f.finding_code,'ocr',text.image_index,f.confidence??null,f.recommended_action==='REJECTED'?'SHADOW_REJECT':'SHADOW_HUMAN_REVIEW',f.finding_code);
 }
 if(analysis.possible_prompt_injection)add('prompt_injection_attempt','text',null,null,'SHADOW_HUMAN_REVIEW');
 if(analysis.category_consistency.status!=='match')add('category_mismatch','category',null,analysis.category_consistency.confidence,analysis.category_consistency.status==='mismatch'&&analysis.category_consistency.confidence>=.95?'SHADOW_NEEDS_FIX':'SHADOW_HUMAN_REVIEW');
 // Completeness/uncertainty are prerequisites, never confidence-only approval.
 const incomplete=base.images.some(i=>i.status!=='PASS')||base.findings.some(f=>f.source_type!=='system')||analysis.image_subjects.some(i=>i.object_type==='uncertain'||i.confidence<.85)||analysis.overall_uncertainty>.15||analysis.detected_languages.includes('other');
 out.recommendation=out.findings.some(f=>f.action==='SHADOW_REJECT')?'SHADOW_REJECT':out.findings.some(f=>f.action==='SHADOW_HUMAN_REVIEW')||incomplete?'SHADOW_HUMAN_REVIEW':out.findings.some(f=>f.action==='SHADOW_NEEDS_FIX')?'SHADOW_NEEDS_FIX':'SHADOW_APPROVE';
 out.findings=out.findings.slice(0,100);return out;
}
export function enforceShadowDecision(result:ModerationResult){
 // Only pre-existing deterministic rules may hard-block; provider data never
 // enters result.findings. Production approval is prohibited even with flags on.
 if(result.decision==='APPROVED')result.decision='HUMAN_REVIEW';
 return result;
}
