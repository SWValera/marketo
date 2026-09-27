// Isolated remote-preview release harness. Never part of the production Worker.
import {OpenAIModerationProvider} from '../../lib/moderation/openai-provider.ts';
import {moderate} from '../../lib/moderation/engine.ts';
import {UnavailableAIProvider,UnavailableOCRProvider} from '../../lib/moderation/providers.ts';
import {moderationDerivatives} from '../../lib/moderation/image-derivatives.ts';
import {executeShadow} from '../../lib/moderation/ai-execution.ts';
import {evaluateAutomatic} from '../../lib/moderation/automatic.ts';
import {semanticCallRequired} from '../../lib/moderation/lexical.ts';
export function automaticSmokeWorker({cases,nonce,expiresAt,model}){
 const used=new Set();
 return {async fetch(request,env){
  if(Date.now()>expiresAt||request.headers.get('authorization')!=='Bearer '+nonce)return new Response(null,{status:403});
  if(request.method==='GET')return Response.json({key_present:Boolean(env.OPENAI_API_KEY),model,isolated:true});
  let id;try{const body=await request.json();if(Object.keys(body).length!==1)throw Error();id=body.id;}catch{return new Response(null,{status:400});}
  const c=cases.find(c=>c.id===id);if(!c||used.has(id))return new Response(null,{status:409});used.add(id);
  const bytes=Uint8Array.from(atob(c.image),c=>c.charCodeAt(0)),job=c.job,metas=[];
  let response,attempt=0,shadow={status:'disabled'},actualCalls=0;
  const base=await moderate({snapshot:job.snapshot,rules:job.rules,fraud:job.fraud,ai:new UnavailableAIProvider(),ocr:new UnavailableOCRProvider(),loadImage:async()=>bytes,allowExternal:false,lexicalAIState:'READY'});
  if(semanticCallRequired(base.lexical,true)){
   const derivative=await moderationDerivatives(bytes,env.MARKETO_IMAGES,AbortSignal.timeout(25000),{hash:true,vision:true});
   base.images[0].perceptual_hash=derivative.perceptual_hash;base.images[0].algorithm=derivative.algorithm;
   const provider=new OpenAIModerationProvider({key:env.OPENAI_API_KEY,model,fetch:async(...args)=>{if(++actualCalls>1)throw Error('smoke_call_limit');return fetch(...args);}});
   shadow=await executeShadow({provider,data:{title:job.snapshot.title,description:job.snapshot.description,category:job.snapshot.category_path.map(c=>`${c.slug} ${c.ru} ${c.kk}`).join(' / '),attributes:JSON.stringify(job.snapshot.attributes),images:[{image_index:0,mimeType:'image/jpeg',bytes:derivative.vision}]},rules:job.rules,base,signal:AbortSignal.timeout(50000),reserve:async()=>++attempt===1?1:null,record:async(_n,m)=>metas.push(m),onValidated:r=>{response=r;},sleep:async()=>{}});
  }
  const {result,trace}=await evaluateAutomatic({base,rules:job.rules,response,providerStatus:shadow.status,switches:{enabled:true,approval:true,rejection:true}});
  // OCR was consumed above; return only booleans and sanitized findings/metadata.
  const ocrReadable=Boolean(response?.observations.visible_text.some(t=>t.complete&&t.text.trim().length>0));
  const value={...result,automatic:trace,...(shadow.schema_version?{shadow}:{})};response=undefined;
  return Response.json({value,metadata:metas,actual_calls:actualCalls,ocr_readable:ocrReadable},{headers:{'cache-control':'no-store'}});
 }};
}
