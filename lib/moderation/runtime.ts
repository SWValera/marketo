import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {createSupabaseAdminClient} from '../supabase/admin';
import {getListingMediaBucket} from '../media/bucket';
import {ENGINE_VERSION,ruleSchema,snapshotSchema} from './contracts';
import {moderate,finding} from './engine';
import {UnavailableAIProvider,UnavailableOCRProvider} from './providers';
import type {Json} from '../supabase/database.types';

const jobSchema=z.object({id:z.string().uuid(),listing_id:z.string().uuid(),claim_token:z.string().uuid(),snapshot:snapshotSchema,rules:z.array(ruleSchema).min(1),auto_approve:z.boolean(),fraud:z.object({recent_submissions:z.number(),prior_rejections:z.number(),confirmed_reports:z.number(),duplicate_content:z.number(),reused_images:z.number()})});
/** Bounded durable jobs. Never called by a public unauthenticated mutation API. */
export async function processModerationQueue(){
  if(env.MODERATION_FRAMEWORK_ENABLED!=='true')return;
  const client=createSupabaseAdminClient();
  const claimed=await client.rpc('claim_moderation_job');
  if(claimed.error)throw new Error('moderation_claim_failed');
  if(!claimed.data)return;
  const identity=z.object({id:z.string().uuid(),claim_token:z.string().uuid()}).parse(claimed.data);
  const start=Date.now();
  try{
    const job=jobSchema.parse(claimed.data);
    // An enabled flag does not create a provider. Install a reviewed adapter and
    // regional/data-processing agreement before replacing these implementations.
    const result=await moderate({snapshot:job.snapshot,rules:job.rules,fraud:job.fraud,ai:new UnavailableAIProvider(),ocr:new UnavailableOCRProvider(),allowExternal:false,timeoutMs:3000,
      loadImage:async key=>{const object=await getListingMediaBucket().get(key);if(!object||object.size>12*1024*1024)throw new Error('image_unavailable');return new Uint8Array(await object.arrayBuffer());}});
    const reused=await client.rpc('count_moderation_image_reuse',{target_listing_id:job.listing_id,hashes:result.images.flatMap(i=>i.sha256?[i.sha256]:[])});
    if(reused.error)throw new Error('fraud_read_failed');
    if(reused.data>3){result.findings.push(finding('reused_images','HUMAN_REVIEW','fraud'));result.risk_score=Math.max(40,result.risk_score);if(result.decision!=='REJECTED')result.decision='HUMAN_REVIEW';}
    if(result.decision==='APPROVED'&&(!job.auto_approve||env.MODERATION_AI_ENABLED!=='true'))result.decision='HUMAN_REVIEW';
    const finished=await client.rpc('finish_moderation_job',{job_id:job.id,token:job.claim_token,result:result as unknown as Json});
    if(finished.error)throw new Error('moderation_finish_failed');
    console.info(JSON.stringify({event:'moderation.completed',engine:ENGINE_VERSION,decision:finished.data,duration_ms:Date.now()-start,provider_error:result.error_code!==null,finding_codes:result.findings.map(f=>f.finding_code)}));
  }catch{
    await client.rpc('fail_moderation_job',{job_id:identity.id,token:identity.claim_token});
    console.warn(JSON.stringify({event:'moderation.system_error',engine:ENGINE_VERSION,duration_ms:Date.now()-start}));
  }
}
export async function safelyProcessModerationQueue(){try{await processModerationQueue();}catch{console.warn(JSON.stringify({event:'moderation.queue_unavailable'}));}}
