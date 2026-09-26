import { z } from 'zod';

export const ENGINE_VERSION = 'jevu-moderation-1';
export const decisionSchema = z.enum(['APPROVED','NEEDS_FIX','REJECTED','HUMAN_REVIEW']);
export type Decision = z.infer<typeof decisionSchema>;
export const observationSchema = z.object({
  code:z.enum(['drugs','illegal_precursors','vape','tobacco','nicotine','weapon','ammunition','explosive','forged_document','stolen_payment_data','illegal_service','regulated','document_visible','payment_card','personal_id','category_mismatch','image_mismatch','scam_instruction','adult_content','safe_context','uncertain']),
  confidence:z.number().min(0).max(1),
  subject:z.enum(['offered_item','background','accessory','educational','toy','unknown']),
}).strict();
export const analysisSchema = z.object({
  language:z.enum(['ru','kk','mixed','other']),
  observations:z.array(observationSchema).max(40),
  complete:z.literal(true),
}).strict();
export const ocrSchema = z.object({text:z.string().max(20000),complete:z.literal(true),languages:z.array(z.enum(['ru','kk','en'])).min(1)}).strict();
export type Analysis = z.infer<typeof analysisSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Stage = { code:string; status:'PASS'|'ERROR'|'UNAVAILABLE'; provider?:string; version?:string };
export type Finding = { rule_id?:string; finding_code:string; source_type:'text'|'image'|'ocr'|'category'|'fraud'|'system'; image_index?:number; severity:'low'|'medium'|'high'|'critical'; confidence?:number; recommended_action:Decision; evidence_summary:string; user_reason_ru:string; user_reason_kk:string };
export const ruleSchema = z.object({
  id:z.string().uuid(),code:z.string(),jurisdiction:z.literal('KZ'),ruleset_version:z.string(),enabled:z.boolean(),
  title_ru:z.string(),title_kk:z.string(),description_ru:z.string(),description_kk:z.string(),
  rule_type:z.string(),scope:z.array(z.string()),applicable_categories:z.array(z.string()),severity:z.enum(['low','medium','high','critical']),
  action:decisionSchema,priority:z.number(),legal_status:z.enum(['LAW','REGULATION','JEVU_POLICY','LEGAL_REVIEW_REQUIRED']),
  legal_basis:z.string(),legal_source_title:z.string(),legal_source_reference:z.string(),effective_from:z.string(),effective_to:z.string().nullable(),
  config:z.object({terms:z.array(z.string()).max(80),observation:observationSchema.shape.code,explicit_offers:z.array(z.string()).max(40)}).strict(),
}).passthrough();
export type Rule = z.infer<typeof ruleSchema>;
export const snapshotSchema = z.object({
  title:z.string().max(120),description:z.string().max(20000),category_id:z.string().uuid(),category_path:z.array(z.object({id:z.string(),slug:z.string(),ru:z.string(),kk:z.string()})),
  settlement_id:z.string().uuid(),price_minor:z.number().nullable(),currency_code:z.string(),
  attributes:z.array(z.record(z.string(),z.unknown())).max(200),
  images:z.array(z.object({id:z.string().uuid(),storage_key:z.string(),sort_order:z.number(),width:z.number().nullable(),height:z.number().nullable(),byte_size:z.number().nullable(),mime_type:z.string().nullable()})).min(1).max(7),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type FraudSignals = { recent_submissions:number; prior_rejections:number; confirmed_reports:number; duplicate_content:number; reused_images:number };
export type ModerationResult = { decision:Decision; risk_score:number; findings:Finding[]; stages:Stage[]; images:{image_index:number; sha256:string|null; perceptual_hash:null; status:'PASS'|'ERROR'}[]; provider:string; provider_version:string; ocr_provider:string; ocr_version:string; error_code:string|null };
