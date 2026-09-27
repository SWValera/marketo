import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {fetchWithDeadline} from '../lib/http/fetch-deadline.ts';
import {createSingleFlightTtlCache} from '../lib/reference-data/cache.ts';
const source=await readFile('components/city-premium-showcase.tsx','utf8');
const body=source.slice(source.indexOf('async function requestPaidPlacements'),source.indexOf('type BrandDefinition'));
const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const read=new Function('fetchWithDeadline',js+';return requestPaidPlacements;')((input,init)=>fetchWithDeadline(input,init,40));
const originalFetch=globalThis.fetch;
for(const phase of ['headers','body'])test('showcase '+phase+' stall releases single-flight so explicit retry can recover',async()=>{
 const cache=createSingleFlightTtlCache({maxEntries:20,ttlMilliseconds:()=>60000});let requests=0,aborted=0;
 globalThis.fetch=async(_input,init)=>{
  requests++;
  const stopped=new Promise((_,reject)=>init.signal.addEventListener('abort',()=>{aborted++;reject(init.signal.reason);},{once:true}));
  return phase==='headers'?stopped:{ok:true,json:()=>stopped};
 };
 try{
  const a=cache.getOrLoad('city',()=>read('city')),b=cache.getOrLoad('city',()=>read('city'));
  // AbortSignal timeout is unref'ed in Node; keep the test harness alive.
  const keepAlive=setTimeout(()=>{},200);
  await Promise.all([assert.rejects(a),assert.rejects(b)]);clearTimeout(keepAlive);assert.equal(requests,1);assert.equal(aborted,1,'transport/body receives actual cancellation');
  await new Promise(resolve=>setTimeout(resolve,60));assert.equal(requests,1,'timeout does not start an automatic retry loop');
  globalThis.fetch=async()=>{requests++;return Response.json({placements:[],capacity:15});};
  assert.deepEqual(await cache.getOrLoad('city',()=>read('city')),{placements:[],capacity:15});assert.equal(requests,2);
 }finally{globalThis.fetch=originalFetch;}
});
test('successful showcase response completes before its deadline, without an artificial wait',async()=>{
 let signal;
 try{
  globalThis.fetch=async(_input,init)=>{signal=init.signal;return Response.json({placements:[],capacity:15});};
  assert.deepEqual(await read('city'),{placements:[],capacity:15});
  assert.equal(signal.aborted,false,'success is not delayed until timeout');
 }finally{globalThis.fetch=originalFetch;}
});
test('showcase failures remain errors, never manufactured empty/demo data',async()=>{
 try{
  for(const response of [new Response('',{status:503}),Response.json({capacity:15}),Response.json({placements:[],capacity:0})]){
   globalThis.fetch=async()=>response;await assert.rejects(read('city'));
  }
 }finally{globalThis.fetch=originalFetch;}
});
