import {z} from 'zod';

export const AI_SCHEMA_VERSION='moderation-ai-observation-v2' as const;
export const imageObjectTypes=['vehicle','phone','furniture','document','weapon_like','vape_like','other','uncertain'] as const;
export const observationCodes=['possible_vape','possible_tobacco','possible_nicotine_product','possible_weapon','possible_ammunition','possible_explosive','possible_drug','possible_precursor','possible_fake_document','document_visible','possible_identity_document','possible_payment_card','possible_personal_identifier','possible_adult_content','possible_illegal_service','possible_scam_instruction','category_mismatch','image_text_mismatch','duplicate_or_reused_image','prompt_injection_attempt','uncertain'] as const;
const observation=z.object({code:z.enum(observationCodes),present:z.boolean(),confidence:z.number().min(0).max(1),source:z.enum(['text','image','ocr']),image_index:z.number().int().min(0).max(6).nullable(),subject:z.enum(['offered_item','background','accessory','educational','toy','unknown']),reason:z.string().max(160)}).strict();
/** Provider describes content only. Recommendations are computed by our rules. */
export const aiObservationSchema=z.object({
  schema_version:z.literal(AI_SCHEMA_VERSION),
  detected_languages:z.array(z.enum(['ru','kk','en','other'])).min(1).max(4),
  text_observations:z.array(observation).max(32),image_observations:z.array(observation).max(56),
  visible_text:z.array(z.object({image_index:z.number().int().min(0).max(6),text:z.string().max(2000),ocr_status:z.enum(['NO_TEXT_DETECTED','TEXT_READ','PARTIAL_TEXT','TECHNICAL_FAILURE']),moderation_relevance:z.enum(['none','possible_risk'])}).strict()).max(7),
  image_subjects:z.array(z.object({image_index:z.number().int().min(0).max(6),object_type:z.enum(imageObjectTypes),confidence:z.number().min(0).max(1)}).strict()).max(7),
  images_checked:z.array(z.number().int().min(0).max(6)).max(7),
  category_consistency:z.object({status:z.enum(['match','mismatch','uncertain']),confidence:z.number().min(0).max(1),reason:z.string().max(160)}).strict(),
  possible_prompt_injection:z.boolean(),overall_uncertainty:z.number().min(0).max(1),
}).strict();
export type AIObservations=z.infer<typeof aiObservationSchema>;
export type AIInput={title:string;description:string;category:string;attributes:string;required_text_checks?:AIObservations['text_observations'][number]['code'][];images:{image_index:number;bytes:Uint8Array;mimeType:'image/jpeg'}[]};
export const errorCodes=['timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','ocr_failure','ocr_incomplete','content_unavailable','configuration_missing','provider_4xx','budget_exhausted','disabled','not_eligible'] as const;
export type AIErrorCode=typeof errorCodes[number];
export type AICallMetadata={provider:'openai';model:string;schema_version:typeof AI_SCHEMA_VERSION;request_id:string|null;latency_ms:number;input_tokens:number|null;output_tokens:number|null;image_count:number;status:'success'|AIErrorCode;retry_count:number;validation_issue?:'json'|'envelope'|'shape'|'coverage'|'provenance'|'ocr_incomplete'|'ocr_semantics'};
export type AICallResult={observations:AIObservations;metadata:AICallMetadata};
export class AIProviderError extends Error {
  readonly code:AIErrorCode;readonly metadata?:AICallMetadata;readonly validationIssue?:AICallMetadata['validation_issue'];
  constructor(code:AIErrorCode,metadata?:AICallMetadata,validationIssue?:AICallMetadata['validation_issue']){super(code);this.code=code;this.metadata=metadata;this.validationIssue=validationIssue;}
}
export function validateObservations(raw:unknown,indexes:number[],requiredTextChecks:NonNullable<AIInput['required_text_checks']>=[]):AIObservations{
  const parsed=aiObservationSchema.safeParse(raw);if(!parsed.success)throw new AIProviderError('invalid_schema',undefined,'shape');const result=parsed.data;
  const same=(values:number[])=>values.length===indexes.length&&new Set(values).size===indexes.length&&values.every(i=>indexes.includes(i));
  if(!same(result.images_checked)||!same(result.image_subjects.map(i=>i.image_index))||!same(result.visible_text.map(t=>t.image_index)))throw new AIProviderError('invalid_schema',undefined,'coverage');
  if(result.text_observations.some(o=>o.source!=='text'||o.image_index!==null)||result.image_observations.some(o=>o.source==='text'||o.image_index===null||!indexes.includes(o.image_index)))throw new AIProviderError('invalid_schema',undefined,'provenance');
  // An omitted candidate is not negative evidence. Require an explicit,
  // source-correct assessment for each server-selected lexical question.
  if(requiredTextChecks.some(code=>result.text_observations.filter(o=>o.code===code).length!==1))throw new AIProviderError('invalid_schema',undefined,'coverage');
  // Coverage is mandatory; writing on every photograph is not. Never turn a
  // malformed state into a benign no-text result.
  if(result.visible_text.some(t=>t.ocr_status==='NO_TEXT_DETECTED'&&(t.text.trim()!==''||t.moderation_relevance!=='none')||t.ocr_status==='TEXT_READ'&&!t.text.trim()))throw new AIProviderError('invalid_schema',undefined,'ocr_semantics');
  if(result.visible_text.some(t=>t.ocr_status==='TECHNICAL_FAILURE'))throw new AIProviderError('ocr_failure');
  return result;
}
