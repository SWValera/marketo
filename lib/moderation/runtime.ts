import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {createSupabaseAdminClient} from '../supabase/admin';
import {getListingMediaBucket} from '../media/bucket';
import {getListingImageProcessor} from '../media/photo-service';
import {ENGINE_VERSION,ruleSchema,snapshotSchema} from './contracts';
import {moderate,finding} from './engine';
import {UnavailableAIProvider,UnavailableOCRProvider} from './providers';
import {moderationAIConfig} from './ai-config';
import {OpenAIModerationProvider} from './openai-provider';
import {moderationDerivatives} from './image-derivatives';
import {executeShadow} from './ai-execution';
import {emptyShadow} from './shadow';
import {semanticCallRequired} from './lexical';
import {recordLexicalExecution,lexicalAIStateAfterShadow} from './lexical-execution';
import {bounded} from './providers';
import {AI_SCHEMA_VERSION,type AIInput,type AICallResult} from './ai-contract';
import {evaluateAutomatic} from './automatic';
import type {Json} from '../supabase/database.types';

const jobSchema=z.object({id:z.string().uuid(),listing_id:z.string().uuid(),claim_token:z.string().uuid(),created_at:z.string(),engine_version:z.string().optional(),automatic_enabled:z.boolean().default(false),auto_reject:z.boolean().default(false),automatic_since:z.string().nullable().optional(),snapshot:snapshotSchema,rules:z.array(ruleSchema).min(1),auto_approve:z.boolean(),fraud:z.object({recent_submissions:z.number(),prior_rejections:z.number(),confirmed_reports:z.number(),duplicate_content:z.number(),reused_images:z.number()})});
/** Bounded durable jobs. Never called by a public unauthenticated mutation API. */
export async function processModerationQueue(budgetMs=90_000){
  const deadline=Date.now()+budgetMs,remaining=()=>Math.max(1,deadline-Date.now());
  if(env.MODERATION_FRAMEWORK_ENABLED!=='true')return;
  const client=createSupabaseAdminClient();
  const claimed=await client.rpc('claim_moderation_job');
  if(claimed.error)throw new Error('moderation_claim_failed');
  if(!claimed.data)return;
  const identity=z.object({id:z.string().uuid(),claim_token:z.string().uuid()}).parse(claimed.data);
  const start=Date.now();
  try{
    const job=jobSchema.parse(claimed.data);
    const config=moderationAIConfig(env,job.created_at),loaded=new Map<string,Uint8Array>();
    // Local policy checks run before any external analysis.
    let result=await moderate({snapshot:job.snapshot,rules:job.rules,fraud:job.fraud,ai:new UnavailableAIProvider(),ocr:new UnavailableOCRProvider(),allowExternal:false,timeoutMs:3000,lexicalAIState:env.MODERATION_EXTERNAL_AI_ENABLED!=='true'?'DISABLED':config.enabled&&config.eligible&&config.key&&config.model?'READY':'UNAVAILABLE',
      loadImage:async key=>{const object=await getListingMediaBucket().get(key);if(!object||object.size>4*1024*1024)throw new Error('image_unavailable');const bytes=new Uint8Array(await object.arrayBuffer());loaded.set(key,bytes);return bytes;}});
    const localDurationMs=Date.now()-start;
    let response:AICallResult|undefined;
    let shadow=emptyShadow(!config.enabled?'disabled':!config.eligible?'not_eligible':!config.key||!config.model?'configuration_missing':'content_unavailable');
    const automaticEligible=job.engine_version===ENGINE_VERSION&&job.automatic_enabled&&env.MODERATION_AUTOMATIC_ENABLED==='true'&&Boolean(job.automatic_since)&&Date.parse(job.created_at)>=Date.parse(job.automatic_since!);
    const vision=(env.MODERATION_AI_SHADOW_MODE!=='false'||automaticEligible)&&config.enabled&&config.eligible&&Boolean(config.key&&config.model)&&semanticCallRequired(result.lexical,job.snapshot.images.length>0),derivatives:AIInput['images']=[];
    const shadowRPC=async(operation:string,payload:Json={})=>{const reply=await client.rpc('moderation_shadow_job',{operation,job_id:job.id,token:job.claim_token,payload});if(reply.error)throw new Error('shadow_storage_failed');return reply.data;};
    const duplicates:{image_index:number;exact:number;perceptual:number}[]=[];
    try{
      await bounded(async signal=>{
        for(const item of result.images){
          const key=job.snapshot.images[item.image_index].storage_key,bytes=loaded.get(key);loaded.delete(key);
          if(!bytes||item.status!=='PASS'||(!vision&&!config.hash))continue;
          const derivative=await moderationDerivatives(bytes,getListingImageProcessor(),signal,{vision,hash:config.hash});
          item.perceptual_hash=derivative.perceptual_hash??null;item.algorithm=derivative.algorithm;
          if(derivative.vision)derivatives.push({image_index:item.image_index,bytes:derivative.vision,mimeType:'image/jpeg'});
          const matches=await shadowRPC('similar',{sha256:item.sha256,perceptual_hash:item.perceptual_hash,algorithm:item.algorithm??null});
          const match=z.object({exact:z.number(),perceptual:z.number()}).parse(matches);if(match.exact||match.perceptual)duplicates.push({image_index:item.image_index,...match});
        }
      },Math.min(25_000,remaining()));
      if(vision&&derivatives.length===job.snapshot.images.length){
        const rules=job.rules.filter(r=>r.applicable_categories.length===0||job.snapshot.category_path.some(c=>r.applicable_categories.includes(c.slug)));
        shadow=await executeShadow({provider:new OpenAIModerationProvider({key:config.key,model:config.model}),data:{title:job.snapshot.title,description:job.snapshot.description,attributes:JSON.stringify(job.snapshot.attributes),category:job.snapshot.category_path.map(c=>`${c.slug} ${c.ru} ${c.kk}`).join(' / '),images:derivatives},rules,base:result,signal:AbortSignal.timeout(Math.min(45_000,remaining())),
          reserve:async()=>{const value=await shadowRPC('reserve',{model:config.model!,eligible_since:config.since!,schema_version:AI_SCHEMA_VERSION});return value===null?null:z.number().int().min(1).max(2).parse(value);},
          record:async(attempt,metadata)=>{await shadowRPC('record',{attempt,...metadata});},onValidated:value=>{response=value;}});
      }
    }catch{shadow=emptyShadow('content_unavailable');}
    finally{loaded.clear();derivatives.length=0;}
    for(const match of duplicates)shadow.findings.push({code:'duplicate_or_reused_image',source:'fraud',image_index:match.image_index,confidence:null,action:'SHADOW_HUMAN_REVIEW',rule_code:null,reason:'duplicate_or_reused_image'});
    if(duplicates.length&&shadow.recommendation==='SHADOW_APPROVE')shadow.recommendation='SHADOW_HUMAN_REVIEW';
    const reused=await client.rpc('count_moderation_image_reuse',{target_listing_id:job.listing_id,hashes:result.images.flatMap(i=>i.sha256?[i.sha256]:[])});
    if(reused.error)throw new Error('fraud_read_failed');
    if(reused.data>3){result.findings.push(finding('reused_images','HUMAN_REVIEW','fraud'));result.risk_score=Math.max(40,result.risk_score);if(result.decision!=='REJECTED')result.decision='HUMAN_REVIEW';}
    const enabled=automaticEligible&&env.MODERATION_AI_SHADOW_MODE==='false';
    const automatic=await evaluateAutomatic({base:result,rules:job.rules,response,providerStatus:shadow.status,localDurationMs,switches:{enabled,approval:job.auto_approve&&env.MODERATION_AUTOMATIC_APPROVAL_ENABLED==='true',rejection:job.auto_reject&&env.MODERATION_AUTOMATIC_REJECTION_ENABLED==='true'}});
    result=automatic.result;
    response=undefined; // Raw OCR/observations were consumed in memory only.
    if(result.lexical)recordLexicalExecution(result.lexical,result.stages,env.MODERATION_EXTERNAL_AI_ENABLED!=='true'?'DISABLED':!config.enabled?'UNAVAILABLE':lexicalAIStateAfterShadow(shadow.status));
    const finished=await client.rpc('finish_moderation_job',{job_id:job.id,token:job.claim_token,result:{...result,shadow,automatic:automatic.trace} as unknown as Json});
    if(finished.error)throw new Error('moderation_finish_failed');
    console.info(JSON.stringify({event:'moderation.completed',engine:ENGINE_VERSION,decision:finished.data,duration_ms:Date.now()-start,shadow_status:shadow.status,shadow_recommendation:shadow.recommendation,provider_error:lexicalAIStateAfterShadow(shadow.status)==='PROVIDER_ERROR',finding_codes:result.findings.map(f=>f.finding_code),...(result.lexical?{lexical_routing_decision:result.lexical.lexical_routing_decision,execution_decision:result.lexical.execution_decision,fallback_reason:result.lexical.fallback_reason,canonical_finding_families:result.lexical.canonical_finding_families}:{})}));
  }catch{
    await client.rpc('fail_moderation_job',{job_id:identity.id,token:identity.claim_token});
    console.warn(JSON.stringify({event:'moderation.system_error',engine:ENGINE_VERSION,duration_ms:Date.now()-start}));
  }
}
export async function safelyProcessModerationQueue(budgetMs=90_000){try{await processModerationQueue(budgetMs);}catch{console.warn(JSON.stringify({event:'moderation.queue_unavailable'}));}}
