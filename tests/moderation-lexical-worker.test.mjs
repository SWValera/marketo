import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,createFetchMock} from 'miniflare';
import {loadRules} from '../scripts/moderation-benchmark.mjs';
import {withLexicalRules} from '../lib/moderation/rulesets/lexical-v1.ts';
import {ruleSchema} from '../lib/moderation/contracts.ts';
import {cleanObservation,responseBody} from './helpers/moderation-ai-fixtures.mjs';

test('workerd queue: local hard gate spends no call, clean text retains Vision/OCR; all traffic mocked',async()=>{
 const jpeg=await readFile('tests/moderation/benchmark/v1/images/phone.jpg');
 const rules=withLexicalRules(await loadRules()).map(r=>ruleSchema.parse({...r,jurisdiction:'KZ',description_ru:r.title_ru,description_kk:r.title_kk,rule_type:'semantic_and_offer',scope:['text','image','ocr'],priority:100,legal_basis:'fixture',legal_source_title:'fixture',legal_source_reference:'fixture',effective_from:'2026-09-26',effective_to:null}));
 const entry=`import {env} from 'cloudflare:workers';
 import {processModerationQueue} from './lib/moderation/runtime.ts';
 export default {async fetch(request){
  const id='71000000-0000-4000-8000-000000000001';
  const c=globalThis.fixture={reservations:0,records:[],finished:null,failures:0,derivatives:0};
  c.job={id,listing_id:id,claim_token:id,created_at:'2026-09-26T12:00:00Z',auto_approve:false,
   rules:JSON.parse(env.RULES),fraud:{recent_submissions:0,prior_rejections:0,confirmed_reports:0,duplicate_content:0,reused_images:0},
   snapshot:{title:new URL(request.url).pathname==='/hard'?'Продам в.е.й.п':'Обычный телефон',description:'Синтетическая проверка / сынақ',category_id:id,settlement_id:id,price_minor:null,currency_code:'KZT',attributes:[],category_path:[{id,slug:'phones',ru:'Телефоны',kk:'Телефондар'}],images:[{id,storage_key:'phone.jpg',sort_order:0,width:600,height:380,byte_size:env.SIZE,mime_type:'image/jpeg'}]}};
  await processModerationQueue();return Response.json(c);
 }};`;
 const admin=`export function createSupabaseAdminClient(){return {async rpc(name,args){
  const c=globalThis.fixture;let data=null;
  if(name==='claim_moderation_job')data=c.job;
  else if(name==='count_moderation_image_reuse')data=0;
  else if(name==='finish_moderation_job'){c.finished=args.result;data=args.result.decision;}
  else if(name==='fail_moderation_job')c.failures++;
  else if(name==='moderation_shadow_job'){
   if(args.operation==='similar')data={exact:0,perceptual:0};
   else if(args.operation==='reserve')data=++c.reservations;
   else if(args.operation==='record')c.records.push(args.payload);
  }else throw Error('unexpected RPC');
  return {data,error:null};
 }};}`;
 const bucket=`import {env} from 'cloudflare:workers';export function getListingMediaBucket(){return env.MEDIA;}`;
 const processor=`import {env} from 'cloudflare:workers';export function getListingImageProcessor(){return {input(){globalThis.fixture.derivatives++;return {transform(){return this;},async output(){return {response:()=>new Response(Uint8Array.from(atob(env.JPEG),c=>c.charCodeAt(0)),{headers:{'content-type':'image/jpeg'}})};}};}};}`;
 const bundle=await build({stdin:{contents:entry,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers'],plugins:[{name:'isolated-runtime-services',setup(b){
  b.onResolve({filter:/^\.\.\/(supabase\/admin|media\/bucket|media\/photo-service)$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('/admin')?admin:args.path.endsWith('/bucket')?bucket:processor,loader:'js'}));
 }}]});
 const network=createFetchMock();network.disableNetConnect();let mockCalls=0;
 network.get('https://api.openai.com').intercept({path:'/v1/responses',method:'POST'}).reply(()=>{mockCalls++;return {statusCode:200,data:JSON.stringify(responseBody(cleanObservation())),responseOptions:{headers:{'content-type':'application/json'}}};});
 const mf=new Miniflare({host:'127.0.0.1',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],fetchMock:network,r2Buckets:['MEDIA'],bindings:{
  RULES:JSON.stringify(rules),JPEG:jpeg.toString('base64'),SIZE:jpeg.length,
  MODERATION_FRAMEWORK_ENABLED:'true',MODERATION_EXTERNAL_AI_ENABLED:'true',MODERATION_AI_SHADOW_MODE:'true',MODERATION_AI_PROVIDER:'openai',MODERATION_OCR_PROVIDER:'openai_vision_ocr',MODERATION_AI_MODEL:'gpt-5.6-luna',MODERATION_EXTERNAL_PROCESSING_BASIS:'isolated mocked test',MODERATION_AI_ENABLED_SINCE:'2026-09-26T00:00:00Z',OPENAI_API_KEY:'synthetic-mock-only',MODERATION_PERCEPTUAL_HASH_ENABLED:'false',
 }});
 try{
  await (await mf.getR2Bucket('MEDIA')).put('phone.jpg',jpeg);
  const hard=await (await mf.dispatchFetch('https://fixture.test/hard')).json();
  assert.equal(hard.failures,0);assert.equal(hard.finished.decision,'REJECTED');assert.equal(hard.finished.lexical.routing_decision,'DETERMINISTIC_REJECT');assert.equal(hard.reservations,0);assert.equal(hard.derivatives,0);assert.equal(mockCalls,0);
  const clean=await (await mf.dispatchFetch('https://fixture.test/clean')).json();
  assert.equal(clean.failures,0);assert.equal(clean.finished.lexical.routing_decision,'NO_TEXT_RISK');assert.equal(clean.finished.decision,'HUMAN_REVIEW');assert.equal(clean.finished.shadow.status,'success');assert.equal(clean.finished.shadow.ocr_images,1);assert.equal(clean.derivatives,1);assert.equal(clean.reservations,1);assert.equal(mockCalls,1);assert.equal(clean.records[0].status,'success');
  const types=clean.finished.stages.map(s=>s.code);assert.ok(types.includes('image_technical_0'));assert.ok(types.includes('ocr_0'));
 }finally{await mf.dispose();await network.close();}
});
