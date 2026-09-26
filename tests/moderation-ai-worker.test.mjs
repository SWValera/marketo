import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {Miniflare,createFetchMock} from 'miniflare';import sharp from 'sharp';
import {syntheticImage,cleanObservation,responseBody} from './helpers/moderation-ai-fixtures.mjs';

test('real workerd: R2 bytes -> bounded derivatives -> PNG dHash -> Responses/OCR -> redacted shadow',async()=>{
 const jpeg=await syntheticImage('card'),png=await sharp(jpeg).resize(9,8,{fit:'fill'}).png().toBuffer();
 const entry=`import {OpenAIModerationProvider} from './lib/moderation/openai-provider.ts';
 import {moderationDerivatives} from './lib/moderation/image-derivatives.ts';
 import {executeShadow} from './lib/moderation/ai-execution.ts';
 import {enforceShadowDecision} from './lib/moderation/shadow.ts';
 export default {async fetch(request,env){
  const bytes=new Uint8Array(await (await env.MEDIA.get('synthetic-card.jpg')).arrayBuffer());
  const signal=new AbortController().signal;
  const processor={input(){return {transform(){return this;},async output(options){const data=Uint8Array.from(atob(options.format==='image/png'?env.PNG:env.JPEG),c=>c.charCodeAt(0));return {response:()=>new Response(data,{headers:{'content-type':options.format}})};}};}};
  const derivative=await moderationDerivatives(bytes,processor,signal,{hash:true,vision:true});
  const base={decision:'APPROVED',images:[{image_index:0,status:'PASS',perceptual_hash:derivative.perceptual_hash}],findings:[]};
  let reservations=0;const metadata=[];
  const p=new OpenAIModerationProvider({key:'synthetic-test-key',model:'gpt-5.6-luna',timeoutMs:1000});
  const shadow=await executeShadow({provider:p,data:{title:'Synthetic card',description:'Тест суреті / test only',category:'Fixtures',attributes:'{}',images:[{image_index:0,mimeType:'image/jpeg',bytes:derivative.vision}]},rules:[],base,signal,reserve:async()=>++reservations<=2?reservations:null,record:async(a,m)=>metadata.push(m),sleep:async()=>{}});
  return Response.json({shadow,metadata,hash:derivative.perceptual_hash,final:enforceShadowDecision(base).decision});
 }};`;
 const bundled=await build({stdin:{contents:entry,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const network=createFetchMock();network.disableNetConnect();const observed=cleanObservation();observed.visible_text[0].text='TEST CARD 4242 4242 4242 4242';
 let calls=0,captured;network.get('https://api.openai.com').intercept({path:'/v1/responses',method:'POST'}).reply(options=>{calls++;captured=new Response(options.body).json();return {statusCode:200,data:JSON.stringify(responseBody(observed)),responseOptions:{headers:{'content-type':'application/json','x-request-id':'req_workerd_fixture'}}};});
 network.get('https://api.openai.com').intercept({path:'/v1/responses',method:'POST'}).reply(429,'{}').times(2);
 network.get('https://api.openai.com').intercept({path:'/v1/responses',method:'POST'}).reply(200,JSON.stringify({...responseBody(observed),status:'incomplete'}));
 const mf=new Miniflare({host:'127.0.0.1',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],fetchMock:network,r2Buckets:['MEDIA'],bindings:{JPEG:jpeg.toString('base64'),PNG:png.toString('base64')}});
 try{
  await (await mf.getR2Bucket('MEDIA')).put('synthetic-card.jpg',jpeg);
  const r=await (await mf.dispatchFetch('https://fixture.test/')).json();assert.equal(r.final,'HUMAN_REVIEW');assert.equal(r.shadow.recommendation,'SHADOW_NEEDS_FIX',JSON.stringify(r));assert.ok(r.shadow.findings.some(f=>f.code==='payment_card'));assert.equal(r.hash.length,16);assert.equal(r.metadata[0].input_tokens,123);assert.ok(!JSON.stringify(r).includes('4242'));assert.equal(calls,1);const body=await captured;assert.equal(body.store,false);assert.equal(body.model,'gpt-5.6-luna');assert.match(body.input[0].content[2].image_url,/^data:image\/jpeg;base64,/);
  const failed=await (await mf.dispatchFetch('https://fixture.test/')).json();assert.equal(failed.final,'HUMAN_REVIEW');assert.equal(failed.shadow.status,'provider_rate_limit');assert.equal(failed.metadata.length,2);
  const invalid=await (await mf.dispatchFetch('https://fixture.test/')).json();assert.equal(invalid.final,'HUMAN_REVIEW');assert.equal(invalid.shadow.status,'invalid_schema');
 }finally{await mf.dispose();await network.close();}
});
