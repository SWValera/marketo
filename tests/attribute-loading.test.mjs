import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {readLruEntry,writeLruEntry} from '../lib/reference-data/bounded-map.ts';
import {fetchWithDeadline} from '../lib/http/fetch-deadline.ts';

test('actual shared attribute loader exits a stalled response body and can retry',async()=>{
  const file=new URL('../components/use-category-attributes.ts',import.meta.url);
  const source=await readFile(file,'utf8');
  const compiled=ts.transpileModule(source+'\nexport {requestCategoryAttributes};',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const exports={};
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_input,init)=>{
    calls++;
    if(calls>1)return Response.json({categoryId:'fixture',attributes:[]});
    return new Response(new ReadableStream({start(controller){init?.signal?.addEventListener('abort',()=>controller.error(init.signal.reason),{once:true});}}));
  };
  const context=vm.createContext({exports,fetch:globalThis.fetch,Map,Promise,require(id){
    if(id.includes('bounded-map'))return {readLruEntry,writeLruEntry};
    if(id.includes('fetch-deadline'))return {fetchWithDeadline:(input,init)=>fetchWithDeadline(input,init,20)};
    if(id.includes('/release'))return {CATEGORY_REFERENCE_VERSION:'fixture'};
    return {};
  }});
  vm.runInContext(compiled,context);
  let watchdog;
  try{
    const pending=exports.requestCategoryAttributes('fixture');
    assert.equal(exports.requestCategoryAttributes('fixture'),pending);
    const result=await Promise.race([pending.then(()=> 'unexpected success',()=> 'aborted'),new Promise(resolve=>watchdog=setTimeout(()=>resolve('still stuck'),100))]);
    assert.equal(result,'aborted');
    assert.equal((await exports.requestCategoryAttributes('fixture')).categoryId,'fixture');
    assert.equal(calls,2);
  }finally{clearTimeout(watchdog);globalThis.fetch=original;}
});
