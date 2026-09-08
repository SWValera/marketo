import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {resolve} from 'node:path';

const source=await readFile(resolve(process.env.MARKETO_AUDIT_WORKER_ROOT??'.','public/sw.js'),'utf8');
function harness(fetch){
  const timers=new Map();let id=0;const handlers=new Map();
  const offline=new Response('offline');
  vm.runInNewContext(source,{
    URL,AbortController,AbortSignal,DOMException,Response,ReadableStream,fetch,
    setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
    caches:{async open(){return {async match(){return offline;}};}},
    self:{location:{origin:'https://test.invalid'},addEventListener(type,fn){handlers.set(type,fn);}},
  });
  return {timers,offline,request(){let response;handlers.get('fetch')({
    request:{url:'https://test.invalid/profile',method:'GET',mode:'navigate',destination:'document'},
    respondWith(value){response=value;},waitUntil(){},
  });return response;}};
}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};

test('PWA document header wait has a total deadline below ten seconds and a fallback',async()=>{
  let signal;const h=harness(async(_request,init)=>{signal=init.signal;return new Promise(()=>{});});
  const pending=h.request();await flush();
  const deadline=[...h.timers.values()].find(t=>t.ms>=1000);
  assert.ok(deadline && deadline.ms<=9500,'leave time for bounded offline-cache lookup');
  deadline.fn();await flush();
  assert.equal(signal.aborted,true);
  assert.equal(await pending,h.offline);
});

test('PWA streams its first chunk immediately but does not forget the body deadline',async()=>{
  let cancelled=false;const h=harness(async()=>new Response(new ReadableStream({
    start(c){c.enqueue(new TextEncoder().encode('first'));},cancel(){cancelled=true;},
  })));
  const response=await h.request();const reader=response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value),'first');
  const deadline=[...h.timers.values()].find(t=>t.ms>=1000);
  assert.ok(deadline,'headers must not clear the body deadline');
  const stopped=reader.read();deadline.fn();
  await assert.rejects(stopped,{name:'AbortError'});await flush();
  assert.equal(cancelled,true);assert.equal(h.timers.size,0);
});

test('PWA successful document consumption disposes its timer without caching HTML',async()=>{
  const h=harness(async()=>new Response('complete'));
  assert.equal(await(await h.request()).text(),'complete');
  assert.equal(h.timers.size,0);
});
