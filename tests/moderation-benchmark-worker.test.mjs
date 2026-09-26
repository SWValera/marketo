import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {Miniflare,createFetchMock} from 'miniflare';import {readFile} from 'node:fs/promises';import sharp from 'sharp';
import {loadBenchmark} from './moderation/benchmark/validate.mjs';import {loadRules} from '../scripts/moderation-benchmark.mjs';import {cleanObservation,responseBody} from './helpers/moderation-ai-fixtures.mjs';
test('workerd preview: only pinned fixtures, auth, no forged results, one paid call, sanitized actual adapter/OCR',async()=>{
 const b=await loadBenchmark(),c=b.cases.find(c=>c.id==='BENCH-0131'),jpeg=await readFile(b.root+'/'+c.image_fixture_refs[0]),png=await sharp(jpeg).resize(9,8,{fit:'fill'}).png().toBuffer();
 const settings={cases:[c],images:b.images,rules:await loadRules(),nonce:'synthetic-local-test',expiresAt:Date.now()+120000,model:'gpt-5.6-luna'};
 const entry=`import {createBenchmarkWorker} from './scripts/lib/moderation-benchmark-worker.mjs';
 const worker=createBenchmarkWorker(${JSON.stringify(settings)});
 export default {fetch(req,env){env.MARKETO_IMAGES={input(){return {transform(){return this;},async output(options){return {response:()=>new Response(Uint8Array.from(atob(options.format==='image/png'?env.PNG:env.JPEG),c=>c.charCodeAt(0)),{headers:{'content-type':options.format}})};}};}};return worker.fetch(req,env);}};`;
 const bundle=await build({stdin:{contents:entry,loader:'js',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const network=createFetchMock();network.disableNetConnect();let calls=0;
 const observations=cleanObservation([0,1]);observations.visible_text[1].text='TEST CARD 4242 4242 4242 4242';
 network.get('https://api.openai.com').intercept({path:'/v1/responses',method:'POST'}).reply(()=>{calls++;return {statusCode:200,data:JSON.stringify(responseBody(observations)),responseOptions:{headers:{'content-type':'application/json'}}};});
 const mf=new Miniflare({host:'127.0.0.1',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],fetchMock:network,bindings:{OPENAI_API_KEY:'synthetic-test-key',MODERATION_EXTERNAL_AI_ENABLED:'false',JPEG:jpeg.toString('base64'),PNG:png.toString('base64')}});
 const fixtures={};for(const ref of c.image_fixture_refs)fixtures[ref]=(await readFile(b.root+'/'+ref)).toString('base64');
 const payload={id:c.id,fixtures};
 const post=(data,authorized=true)=>mf.dispatchFetch('https://fixture.test/evaluate',{method:'POST',headers:{...(authorized?{authorization:'Bearer synthetic-local-test'}:{}),'content-type':'application/json'},body:JSON.stringify(data)});
 try{
  assert.equal((await post(payload,false)).status,403);assert.equal((await post({...payload,ai_safe:true})).status,400);assert.equal((await post({...payload,fixtures:{[c.image_fixture_refs[0]]:'AA=='}})).status,400);assert.equal(calls,0);
  const response=await post(payload),result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.actual_calls,1);assert.equal(calls,1);assert.equal(result.provider_status,'success');assert.equal(result.schema_valid,true);assert.ok(result.actual_findings.includes('payment_card'));assert.equal(result.final_decision,'HUMAN_REVIEW');assert.equal(result.production_records_created,0);assert.ok(!/4242|synthetic-test-key|base64|instructions/.test(JSON.stringify(result)));
  assert.equal((await post(payload)).status,409);assert.equal(calls,1);
 }finally{await mf.dispose();await network.close();}
});
