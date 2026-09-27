import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

test('HTTP only persists/responds; only scheduled dispatch imports and runs the durable moderation queue',async()=>{
 const source=await readFile(new URL('../worker/index.ts',import.meta.url),'utf8');
 const exports={};let queueLoads=0,queueRuns=0,httpRuns=0;const waits=[];
 const handler={async fetch(request){httpRuns++;return new Response(request.method==='GET'?'read':'persisted',{headers:{'x-jevu-moderation-queued':'1'}});}};
 const modules={
  'vinext/server/app-router-entry':{default:handler},
  '../lib/http/read-scope':{withPageReadScope:(_request,run)=>run()},
  '../lib/site-origin':{canonicalRedirect:()=>null},
 };
 new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{
  if(name==='../lib/moderation/runtime'){queueLoads++;return {safelyProcessModerationQueue:async()=>{queueRuns++;}};}
  assert.ok(name in modules,name);return modules[name];
 },exports);
 const worker=exports.default,ctx={waitUntil:promise=>waits.push(promise)};
 for(const method of ['GET','POST'])for(const path of ['/','/profile','/admin','/api/listings/fixture/submit','/api/moderation','/api/admin/listings/fixture/owner','/api/listings/fixture/promotion-choice']){
  const response=await worker.fetch(new Request('https://jevu.test'+path,{method,headers:{'x-jevu-moderation-queued':'1'}}),{},ctx);
  assert.equal(response.status,200);await response.text();
 }
 assert.equal(httpRuns,14);assert.equal(queueLoads,0);assert.equal(queueRuns,0);assert.equal(waits.length,0);
 await worker.scheduled({}, {},ctx);await Promise.all(waits);
 assert.equal(queueLoads,1);assert.equal(queueRuns,1);assert.equal(waits.length,1);
});
