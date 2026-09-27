import type {AIObservations} from './ai-contract.ts';
import type {ModerationResult} from './contracts.ts';
import {detectPersonalData} from './normalize.ts';

/** An image-level "possible identifier" is a hypothesis, not proof of PII.
 * Preserve it in the observation trace; require independent context before it
 * becomes an actionable finding. Missing/risky OCR is never a benign result. */
export function unconfirmedImageIdentifier(
 observation:{code:string;source:string;image_index:number|null},
 analysis:AIObservations,
 base:ModerationResult,
){
 if(observation.code!=='possible_personal_identifier'||observation.source==='text'||observation.image_index===null)return false;
 const index=observation.image_index,ocr=analysis.visible_text.find(t=>t.image_index===index);
 if(!ocr||ocr.ocr_status==='TECHNICAL_FAILURE'||ocr.moderation_relevance!=='none'||detectPersonalData(ocr.text).length)return false;
 if(base.findings.some(f=>['personal_id','payment_card','document_visible'].includes(f.finding_code)))return false;
 if(analysis.image_subjects.some(s=>s.image_index===index&&s.object_type==='document'))return false;
 return !analysis.image_observations.some(o=>o.present&&o.image_index===index&&['document_visible','possible_identity_document','possible_payment_card'].includes(o.code));
}
