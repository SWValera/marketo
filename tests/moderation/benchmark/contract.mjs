import {z} from 'zod';
import {observationCodes} from '../../../lib/moderation/ai-contract.ts';
export const VERSION='moderation-benchmark-v1';
export const decisions=['APPROVE','NEEDS_FIX','REJECT','HUMAN_REVIEW'];
export const languages=['RU','KK','MIXED_RU_KK'];
export const difficulties=['EASY','MEDIUM','HARD'];
export const findingCodes=[...observationCodes,'payment_card','personal_id','stolen_payment_data','suspicious_payment'];
export const criticalCodes=['possible_vape','possible_tobacco','possible_nicotine_product','possible_weapon','possible_ammunition','possible_explosive','possible_drug','possible_precursor','possible_fake_document','possible_illegal_service'];
const reference=z.string().regex(/^images\/[a-z0-9-]+\.jpg$/);
const short=z.string().trim().min(1).max(3000);
export const caseSchema=z.object({
 id:z.string().regex(/^BENCH-\d{4}$/),benchmark_version:z.literal(VERSION),language:z.enum(languages),difficulty:z.enum(difficulties),
 category_name:short,category_slug:z.string().regex(/^[a-z0-9-]+$/),title:short.max(120),description:short.max(20000),
 attributes:z.record(z.string(),z.union([z.string().max(500),z.number(),z.boolean()])),price:z.number().nonnegative().nullable(),currency:z.literal('KZT'),
 image_fixture_refs:z.array(reference).max(7),expected_decision:z.enum(decisions),expected_findings:z.array(z.enum(findingCodes)).max(24),forbidden_findings:z.array(z.enum(findingCodes)).max(24),critical_expected_findings:z.array(z.enum(criticalCodes)),
 rationale:short,tags:z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1),requires_ai:z.boolean(),requires_image:z.boolean(),requires_ocr:z.boolean(),
 label_origin:z.literal('SYNTHETIC_EXPECTED_NOT_HUMAN_REVIEWED'),
 ocr_expectations:z.object({must_extract_visible_text:z.boolean(),synthetic_identifiers_only:z.literal(true)}).strict().optional(),
 duplicate_reference_refs:z.array(reference).max(1).optional(),duplicate_expectation:z.enum(['exact','near','different']).optional(),
}).strict();
export function summarize(cases){
 const count=key=>Object.fromEntries([...new Set(cases.map(c=>c[key]))].map(k=>[k,cases.filter(c=>c[key]===k).length]));
 return {total:cases.length,decisions:count('expected_decision'),languages:count('language'),difficulty:count('difficulty'),images:cases.filter(c=>c.requires_image).length,...Object.fromEntries(['ocr','obfuscation','prompt_injection','category_mismatch','duplicate'].map(tag=>[tag,cases.filter(c=>c.tags.includes(tag)).length]))};
}
