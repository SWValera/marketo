// Evaluation composition only; all moderation, OCR, hashing and decisions reuse JEVU.
// This module has no database, storage mutation, auth, publication or queue client.
import {moderate} from '../../lib/moderation/engine.ts';
import {UnavailableAIProvider,UnavailableOCRProvider} from '../../lib/moderation/providers.ts';
import {evaluateShadow,emptyShadow,enforceShadowDecision} from '../../lib/moderation/shadow.ts';
import {moderationDerivatives} from '../../lib/moderation/image-derivatives.ts';
import {hammingDistance} from '../../lib/moderation/perceptual-hash.ts';
import {AIProviderError} from '../../lib/moderation/ai-contract.ts';
const aliases={vape:'possible_vape',tobacco:'possible_tobacco',nicotine:'possible_nicotine_product',weapon:'possible_weapon',ammunition:'possible_ammunition',explosive:'possible_explosive',drugs:'possible_drug',illegal_precursors:'possible_precursor',forged_document:'possible_fake_document',illegal_service:'possible_illegal_service',adult_content:'possible_adult_content'};
const codes=list=>[...new Set(list.map(c=>aliases[c]??c))];
export async function evaluateBenchmarkCase(c,{rules,provider,processor,loadFixture,signal}){
 const loaded=new Map();
 const load=async ref=>{if(!loaded.has(ref))loaded.set(ref,await loadFixture(ref));return loaded.get(ref);};
 const imageRows=await Promise.all(c.image_fixture_refs.map(async(ref,i)=>{const item=await load(ref);return {id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),storage_key:ref,sort_order:i,width:item.width,height:item.height,byte_size:item.bytes.length,mime_type:'image/jpeg'};}));
 const snapshot={title:c.title,description:c.description,category_id:'00000000-0000-4000-8000-000000000001',settlement_id:'00000000-0000-4000-8000-000000000002',category_path:[{id:'synthetic',slug:c.category_slug,ru:c.category_name,kk:c.category_name}],attributes:[c.attributes],price_minor:c.price===null?null:Math.round(c.price*100),currency_code:c.currency,images:imageRows};
 const base=await moderate({snapshot,rules,ai:new UnavailableAIProvider(),ocr:new UnavailableOCRProvider(),allowExternal:false,loadImage:async ref=>(await load(ref)).bytes,fraud:{recent_submissions:1,prior_rejections:0,confirmed_reports:0,duplicate_content:0,reused_images:0}});
 if(base.images.some(i=>i.status!=='PASS'))throw Error('technical_failure');
 const inputs=[],hashes=[];
 for(const [image_index,ref] of c.image_fixture_refs.entries()){
  const derivative=await moderationDerivatives((await load(ref)).bytes,processor,signal,{vision:true,hash:Boolean(c.duplicate_reference_refs?.length)});
  inputs.push({image_index,bytes:derivative.vision,mimeType:'image/jpeg'});hashes.push(derivative.perceptual_hash);
 }
 let duplicate=null;
 if(c.duplicate_reference_refs?.length){
  const reference=await load(c.duplicate_reference_refs[0]),hash=await moderationDerivatives(reference.bytes,processor,signal,{vision:false,hash:true});
  const original=await load(c.image_fixture_refs[0]);
  const exact=original.bytes.length===reference.bytes.length&&original.bytes.every((b,i)=>b===reference.bytes[i]);
  const distance=hammingDistance(hashes[0],hash.perceptual_hash);duplicate={exact,similar:distance<=3,distance};
 }
 let shadow,meta,ai=[],ocr=null;
 try{
  const result=await provider.analyzeListing({title:c.title,description:c.description,category:c.category_name,attributes:JSON.stringify(c.attributes),images:inputs},signal);
  const analysis=result.observations;meta=result.metadata;
  shadow=evaluateShadow(analysis,rules,base);
  ai=codes([...analysis.text_observations,...analysis.image_observations].filter(o=>o.present).map(o=>o.code).concat(shadow.findings.filter(f=>f.source==='ocr').map(f=>f.code)));
  ocr={text_present:analysis.visible_text.some(t=>t.text.trim().length>0),complete:analysis.visible_text.every(t=>t.complete),privacy_detected:shadow.findings.some(f=>f.source==='ocr'&&['payment_card','personal_id'].includes(f.code))};
  // Feed local measured reuse into the existing observation/decision evaluator.
  // No final-publication or bespoke scoring policy exists in the benchmark.
  if(duplicate&&(duplicate.exact||duplicate.similar))shadow=evaluateShadow({...analysis,image_observations:[...analysis.image_observations,{code:'duplicate_or_reused_image',present:true,confidence:1,source:'image',image_index:0,subject:'unknown',reason:'duplicate_or_reused_image'}]},rules,base);
 }catch(error){if(!(error instanceof AIProviderError))throw error;shadow=emptyShadow(error.code);meta=error.metadata??{provider:'openai',model:provider.version,status:error.code,latency_ms:null,input_tokens:null,output_tokens:null,image_count:inputs.length};}
 finally{loaded.clear();inputs.length=0;}
 return {shadow_recommendation:shadow.recommendation,actual_findings:codes(shadow.findings.map(f=>f.code).concat(ai)),ai_findings:ai,latency_ms:meta.latency_ms,input_tokens:meta.input_tokens,output_tokens:meta.output_tokens,image_count:meta.image_count,schema_valid:meta.status==='success',provider_status:meta.status,model:meta.model,ocr_check:ocr,duplicate_check:duplicate,final_decision:enforceShadowDecision(base).decision};
}
