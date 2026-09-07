import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createSingleFlightTtlCache } from '../lib/reference-data/cache.ts';
import { fetchWithDeadline } from '../lib/http/fetch-deadline.ts';

test('an abandoned server reference request cannot hold later visitors hostage', async () => {
  const cache = createSingleFlightTtlCache({maxEntries:1,shareInFlight:false,ttlMilliseconds:v=>v.ok?10000:0});
  let failOld;
  const abandoned=cache.getOrLoad('home',()=>new Promise(resolve=>{failOld=resolve;}));
  await Promise.resolve();
  const fresh={ok:true,categories:['transport','electronics']};
  assert.equal(await cache.getOrLoad('home',async()=>fresh),fresh);
  failOld({ok:false}); await abandoned;
  assert.equal(await cache.getOrLoad('home',async()=>assert.fail('completed data should be cached')),fresh);
});

test('all server reference caches avoid cross-request I/O promises', async () => {
  const source=await readFile(new URL('../lib/reference-data/server.ts',import.meta.url),'utf8');
  assert.equal((source.match(/shareInFlight: false/g)||[]).length,5);
  assert.equal((source.match(/= cache\(async/g)||[]).length,5);
});

test('fetch deadline covers slow bodies and preserves caller cancellation', async () => {
  const original=globalThis.fetch;
  let observed;
  globalThis.fetch=async (_input,init)=>{
    observed=init.signal;
    return new Response(new ReadableStream({start(controller){
      if(init.signal.aborted) controller.error(init.signal.reason);
      else init.signal.addEventListener('abort',()=>controller.error(init.signal.reason),{once:true});
    }}));
  };
  const keepAlive=setTimeout(()=>{},1000);
  try {
    const response=await fetchWithDeadline('https://test.invalid',undefined,25);
    await assert.rejects(response.text(),{name:'TimeoutError'});
    assert.equal(observed.aborted,true);
    const caller=new AbortController();
    const canceled=await fetchWithDeadline('https://test.invalid',{signal:caller.signal},500);
    caller.abort(); await assert.rejects(canceled.text(),{name:'AbortError'});
  } finally {clearTimeout(keepAlive);globalThis.fetch=original;}
});
