import assert from 'node:assert/strict';
import test from 'node:test';
import {register} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createPageReadController,createPageNavigation,isReusablePage,isPrivatePage} from '../lib/navigation/page-read.ts';
import {transformNavigationRead} from '../build/navigation-read-guard.ts';

test('duplicate clicks share pending work; latest route wins, including late unabortable results',async()=>{
  const states=[];let calls=0,oldSignal,release;
  const c=createPageReadController({notify:s=>states.push(s)});
  const first=c.run('/a',async read=>{calls++;oldSignal=read.signal;await new Promise(r=>release=r);});
  assert.equal(c.run('/a',async()=>{calls++;}),first);
  await Promise.resolve();
  await c.run('/c',async()=>{});release();await first;
  assert.equal(calls,1);assert.equal(oldSignal.aborted,true);
  assert.deepEqual(states.filter(s=>s.status==='ready').map(s=>s.href),['/c']);
});

test('body/commit waiting and background time belong to the same deadline; retry is new work',async()=>{
  let now=0,calls=0;const states=[];
  const c=createPageReadController({notify:s=>states.push(s),now:()=>now});
  const first=c.run('/a',async()=>{calls++;await new Promise(()=>{});});
  await Promise.resolve();now=10001;c.resume();await first;
  assert.equal(states.at(-1).status,'error');
  await c.run('/a',async()=>{calls++;});
  assert.equal(calls,2);assert.equal(states.at(-1).status,'ready');
});

test('HTTP 200 error payload is not a reusable page',()=>{
  const encode=s=>new TextEncoder().encode(s).buffer;
  assert.equal(isReusablePage(encode('0:["$","main",null,{}]')),true);
  assert.equal(isReusablePage(encode('0:{}\na:E{"digest":"fixture"}')),false);
  assert.equal(isReusablePage(encode('0:{"data-marketo-error":true}')),false);
  assert.equal(isReusablePage(encode('0:{"data-marketo-error":"$undefined"}')),true);
});

test('pagehide interruption cannot leave a restored page in an endless loading state',async()=>{
  const states=[];
  const c=createPageReadController({notify:s=>states.push(s)});
  const pending=c.run('/profile',async()=>new Promise(()=>{}));
  await Promise.resolve();c.cancel();await pending;
  assert.equal(states.at(-1).status,'error','an interrupted read needs a visible retry on return, not a retained spinner');
  c.resume();
  await c.run('/profile',async()=>{});
  assert.equal(states.at(-1).status,'ready');
});

test('actual vinext prefetch consumer waits for the same unfinished response',async()=>{
  if(!process.env.MARKETO_TEST_UNPATCHED)register(new URL('../scripts/lib/navigation-test-loader.mjs',import.meta.url));
  globalThis.window={location:new URL('https://marketo.test/'),history:{pushState(){},replaceState(){}},addEventListener(){},removeEventListener(){}};
  try{
    const n=await import('../node_modules/vinext/dist/shims/navigation.js');
    let release;
    n.prefetchRscResponse('/listing/fixture.rsc',new Promise(resolve=>release=resolve));
    const consuming=n.consumePrefetchResponse('/listing/fixture.rsc');
    release(new Response('0:{}',{headers:{'content-type':'text/x-component'}}));
    const snapshot=await consuming;
    assert.ok(snapshot,'unfinished prefetch must not fall through to another fetch');
    assert.equal(new TextDecoder().decode(snapshot.buffer),'0:{}');
    const originalFetch=globalThis.fetch;let calls=0;
    globalThis.fetch=async()=>{calls++;return new Response('0:{}',{headers:{'content-type':'text/x-component'}});};
    try{
      n.appRouterInstance.prefetch('/profile');
      for(let i=0;i<30;i++)await Promise.resolve();
      assert.equal(calls,0,'private prefetch must be stopped before network I/O');
    }finally{globalThis.fetch=originalFetch;}
    n.getPrefetchCache().clear();
    let finishExpired;
    n.prefetchRscResponse('/expired.rsc',new Promise(resolve=>finishExpired=resolve));
    const entry=[...n.getPrefetchCache().values()][0];entry.timestamp=Date.now()-31000;
    const expired=await Promise.race([n.consumePrefetchResponse('/expired.rsc'),Promise.resolve('still-pending')]);
    finishExpired(new Response('0:{}',{headers:{'content-type':'text/x-component'}}));
    assert.equal(expired,null,'expired pending work must not add another eight-second wait');
    let rejectStale;
    n.prefetchRscResponse('/same.rsc',new Promise((_resolve,reject)=>rejectStale=reject));
    const stale=[...n.getPrefetchCache().values()][0];
    n.prefetchRscResponse('/same.rsc',Promise.resolve(new Response('0:{"fresh":true}',{headers:{'content-type':'text/x-component'}})));
    rejectStale(new Error('obsolete request failed'));
    await stale.pending;
    const fresh=await n.consumePrefetchResponse('/same.rsc');
    assert.ok(fresh,'late failure must not evict the replacement prefetch');
    assert.match(new TextDecoder().decode(fresh.buffer),/fresh/);
  }finally{delete globalThis.window;}
});

test('pinned adapter transforms the actual library and fails closed on upstream drift',async()=>{
  const id='/vinext/dist/server/app-browser-entry.js';
  const source=await readFile(new URL('../node_modules/vinext/dist/server/app-browser-entry.js',import.meta.url),'utf8');
  const result=transformNavigationRead(source,id);
  assert.match(result,/fetch\(rscUrl, \{ signal: readOperation.signal/);
  assert.match(result,/await readOperation.wait\(consumePrefetchResponse/);
  assert.match(result,/!isPrivatePage\(rscUrl\) && isReusablePage\(cacheBuffer\)/);
  assert.doesNotMatch(result.slice(result.indexOf('window.__VINEXT_RSC_NAVIGATE__ ='),result.indexOf('if ("scrollRestoration" in history)')),/window\.location\.href\s*=/,'failed reads and redirect loops must not reload the document');
  assert.throws(()=>transformNavigationRead(source.replace('function navigateRsc(','function changed('),id));
  const actions=value=>value.slice(value.indexOf('function registerServerActionCallback()'),value.indexOf('async function main()'));
  assert.equal(actions(result),actions(source),'read recovery must not wrap or replay server action POSTs');
});

test('personal pages cannot reuse an old account response; public cache remains available',()=>{
  for(const path of ['/profile.rsc','/messages/x.rsc','/favorites.rsc?page=2','/help.rsc','/settings','/admin/x'])assert.equal(isPrivatePage(path),true,path);
  for(const path of ['/','/categories.rsc','/category/transport.rsc','/listing/fixture.rsc','/search?q=phone'])assert.equal(isPrivatePage(path),false,path);
});

test('same-route error reset runs after fresh payload and before useful readiness',async()=>{
  const original={window:globalThis.window,document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  const order=[];let failed=true;
  globalThis.window={location:new URL('https://test.invalid/search?q=car'),addEventListener(){},dispatchEvent(e){order.push(e.detail.status);}};
  globalThis.document={visibilityState:'visible',addEventListener(){},querySelector(){return {matches(){return failed;},querySelector(){return null;}};},querySelectorAll(){return [];}};
  globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
  globalThis.cancelAnimationFrame=clearTimeout;
  try{
    const navigate=createPageNavigation(async()=>{order.push('fresh-payload');});
    await navigate('/search?q=car',0,'refresh','replace',undefined,false,()=>{order.push('reset');failed=false;});
    assert.deepEqual(order,['loading','fresh-payload','reset','ready']);
  }finally{for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
