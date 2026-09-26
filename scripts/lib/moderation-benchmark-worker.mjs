// Preview-only handler. Never imported by the application Worker.
import {OpenAIModerationProvider} from '../../lib/moderation/openai-provider.ts';
import {aiObservationSchema,validateObservations} from '../../lib/moderation/ai-contract.ts';
import {evaluateBenchmarkCase} from './moderation-benchmark-evaluate.mjs';
import {readPhotoBytes} from '../../lib/media/photo-contract.ts';
import {sanitizedResult} from './moderation-benchmark-core.mjs';
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
export function createBenchmarkWorker({cases,images,rules,nonce,expiresAt,model},dependencies={}){
 const used=new Set();let requests=0;
 return {async fetch(request,env){
  if(Date.now()>expiresAt||request.headers.get('authorization')!=='Bearer '+nonce)return json({error:'unauthorized'},403);
  if(request.method==='GET'&&new URL(request.url).pathname==='/health')return json({key_present:Boolean(env.OPENAI_API_KEY),shadow:true,auto_approve:false,ai_only_reject:false,production_external_ai:env.MODERATION_EXTERNAL_AI_ENABLED==='true',model});
  if(request.method!=='POST'||new URL(request.url).pathname!=='/evaluate')return json({error:'not_found'},404);
  if(!env.OPENAI_API_KEY||env.MODERATION_EXTERNAL_AI_ENABLED==='true')return json({error:'configuration_missing'},503);
  // No production credentials, URLs, case content or provider results accepted.
  if(Number(request.headers.get('content-length'))>4*1024*1024)return json({error:'payload_limit'},413);
  let body;try{const text=await request.text();if(text.length>4*1024*1024)throw Error();body=JSON.parse(text);}catch{return json({error:'invalid_request'},400);}
  const c=cases.find(c=>c.id===body?.id);
  if(!c||Object.keys(body).some(k=>!['id','fixtures'].includes(k)))return json({error:'invalid_request'},400);
  if(used.has(c.id)||requests>=cases.length)return json({error:'already_reserved'},409);
  const refs=[...new Set([...c.image_fixture_refs,...c.duplicate_reference_refs??[]])],fixtures=new Map();
  try{
   if(!body.fixtures||Object.keys(body.fixtures).length!==refs.length)throw Error();
   for(const ref of refs){
    const expected=Object.values(images).find(i=>i.file===ref),encoded=body.fixtures[ref];
    if(!expected||typeof encoded!=='string'||encoded.length>700000||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw Error();
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    if(await digest(bytes)!==expected.sha256)throw Error();fixtures.set(ref,{bytes,width:expected.width,height:expected.height});
   }
  }catch{return json({error:'fixture_integrity'},400);}
  used.add(c.id);requests++; // Irrevocable: an interrupted response is not retried.
  let actualCalls=0,httpStatus=null,diagnostics=null;
  const providerFetch=async(input,init)=>{
   if(actualCalls>=1)throw Error('request_limit');actualCalls++;
   const response=await (dependencies.fetch??fetch)(input,init);httpStatus=response.status;
   if(response.ok){
    // Inspect only contract booleans; provider text lives in memory until GC.
    try{const copy=response.clone();const data=JSON.parse(new TextDecoder().decode(await readPhotoBytes(copy.body,96*1024,init.signal)));const text=data.output?.flatMap(o=>o.content??[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');const value=JSON.parse(text);
     const parsed=aiObservationSchema.safeParse(value);let indexes=false;
     try{validateObservations(value,c.image_fixture_refs.map((_,i)=>i));indexes=true;}catch{}
     diagnostics={structure_valid:parsed.success,index_contract_valid:indexes,complete:value.visible_text?.every(t=>t.complete===true)===true};
    }catch{diagnostics={structure_valid:false,index_contract_valid:false,complete:false};}
   }
   return response;
  };
  let result;
  try{result=await evaluateBenchmarkCase(c,{rules,provider:new OpenAIModerationProvider({key:env.OPENAI_API_KEY,model,fetch:providerFetch}),processor:env.MARKETO_IMAGES,loadFixture:ref=>fixtures.get(ref),signal:AbortSignal.timeout(50000)});}
  catch{result={provider_status:'technical_failure',schema_valid:false,model};}
  finally{fixtures.clear();body=null;}
  return json(sanitizedResult(c,{...result,actual_calls:actualCalls,http_status:httpStatus,schema_diagnostics:diagnostics}));
 }};
}
