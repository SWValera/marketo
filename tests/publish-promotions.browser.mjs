import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer,get} from 'node:http';
import {build} from 'esbuild';

// Actual PublishForm, submit route and submitListing RPC adapter. External data/storage are fixtures.
const root=resolve('.'),out=resolve('artifacts/jevu-publish-promotion-20260920');
await mkdir(out,{recursive:true});
const categoryId='10000000-0000-4000-8000-000000000001',cityId='20000000-0000-4000-8000-000000000002',listingId='30000000-0000-4000-8000-000000000003';
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#127347"/></svg>');
const category={id:categoryId,parentId:null,slug:'free-other',name:{ru:'Тестовая категория',kk:'Сынақ санаты'},icon:'gift',tone:'green',searchPlaceholder:null,titlePlaceholder:null,descriptionHint:null,priceMode:'free',sortOrder:1};
const draft={id:listingId,slug:'fixture',status:'draft',categoryId,categorySlug:'free-other',settlementId:cityId,title:'Тестовое объявление',description:'Достаточно подробное тестовое описание',price:null,currencyCode:'KZT',contactName:'Тест',contactPhone:'+77001234567',allowMessages:true,attributes:{},images:[{id:'photo',url:image,sortOrder:0}],rejectionReasonCode:null,rejectedAt:null,updatedAt:'2026-09-20T00:00:00Z'};
const mocks={
 '@/components/i18n-provider':`import {translate} from './lib/i18n/messages';const lang=new URLSearchParams(location.search).get('lang')||'ru';const t=(k,v)=>translate(lang,k,v);export const useI18n=()=>({locale:lang,t});`,
 '@/components/location-picker':`export const useStoredLocation=()=>${JSON.stringify(cityId)};export const LocationPicker=()=> <button type='button'>Город</button>;`,
 '@/components/category-picker':`export const CategoryPicker=({value,onChange})=><button type='button' data-category onClick={()=>onChange('free-other')}>{value||'Категория'}</button>;`,
 '@/components/use-category-attributes':`const result={status:'ready',data:{attributes:[]}};export const useCategoryAttributes=()=>result;`,
 '@/components/page-header':`export const PageHeader=({title,description})=><header><h1>{title}</h1><p>{description}</p></header>;`,
 '@/components/reference-select':`export const ReferenceSelect=()=>null;`,
 '@/components/city-premium-offer':`export const CityPremiumOffer=()=>null;`,
 '@/lib/media/client-image-normalization':`export const normalizeListingPhotoForUpload=async file=>file;export const preparePhotoSelection=async files=>({successes:files,failures:[]});`,
 '@/lib/media/photo-preview':`export const createPhotoPreview=async file=>URL.createObjectURL(file);`,
};
const fixturePlugin=mocks=>({name:'fixture-boundaries',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'fixture'}:null);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));}});
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{PublishForm}from'./components/publish-form';localStorage.clear();const p=new URLSearchParams(location.search);const draft=${JSON.stringify(draft)};if(p.has('rejected'))draft.status='rejected';createRoot(document.getElementById('app')).render(<><main className='page-shell publish-page'><PublishForm userId='fixture-user' catalog={{status:'ready',data:{categories:[${JSON.stringify(category)}]}}} profileDefaults={{displayName:'Тест',contactPhone:'+77001234567',cityId:${JSON.stringify(cityId)}}} initialDraft={p.has('new')?null:draft}/></main><nav className='mobile-bottom-nav'><a>Главная</a><a>Подать</a><a>Профиль</a></nav></>);`;
const app=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[fixturePlugin(mocks)]});
const routePath=join(out,'submit-route.mjs');
await build({entryPoints:['app/api/listings/[id]/submit/route.ts'],outfile:routePath,bundle:true,platform:'node',format:'esm',plugins:[fixturePlugin({
 'next/server':`export const NextResponse={json:(value,options)=>Response.json(value,options)};`,
 '@/lib/supabase/server':`export const createSupabaseServerClient=async()=>globalThis.__publishClient;`,
 '@/lib/publish/server':`export class PublishReferenceError extends Error{};export const validateStoredListingForSubmit=async()=>({status:'ready'});`,
})]});
const {POST}=await import(pathToFileURL(routePath));
let mode='success';const requests=[],rpcCalls=[];const statuses=new Map();
globalThis.__publishClient={auth:{getUser:async()=>({data:{user:{id:'fixture-user'}},error:null})},rpc:async(name,args)=>{rpcCalls.push({name,args});if(mode==='submit-error')return {error:{code:'42501'}};statuses.set(args.target_listing_id,'pending');return {error:null};}};
const css=(await readFile('app/globals.css','utf8')).replace('@import "tailwindcss";','');
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://fixture').pathname;
 if(path.startsWith('/api/')){
  let body='';for await(const chunk of req)body+=chunk;requests.push({path,method:req.method,body:path.endsWith('/images')?'photo':body?JSON.parse(body):null});
  if(path.endsWith('/submit')){await new Promise(r=>setTimeout(r,80));const url='http://'+req.headers.host+path;const response=await POST(new Request(url,{method:'POST',headers:req.headers,body}),{params:Promise.resolve({id:listingId})});res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());return;}
  if(mode==='save-error'){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"save_failed"}');return;}
  res.setHeader('content-type','application/json');
  if(path.endsWith('/images'))res.end(JSON.stringify({images:[{id:'photo-id',storageKey:'listings/fixture/photo.jpg',sortOrder:0}]}));
  else {statuses.set(listingId,'draft');res.end(JSON.stringify({listing:{id:listingId}}));}return;
 }
 if(path==='/app.js'){res.setHeader('content-type','text/javascript');res.end(app.outputFiles[0].contents);return;}
 if(path==='/style.css'){res.setHeader('content-type','text/css');res.end(css);return;}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="app"></div><script src="/app.js"></script></body></html>');
 }catch(e){res.statusCode=500;res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let executable;for(const path of [process.env.JEVU_BROWSER_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].filter(Boolean))if(await access(path).then(()=>true,()=>false)){executable=path;break;}assert.ok(executable);
const profile=await mkdtemp(join(out,'browser-profile-'));const child=spawn(executable,['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));const json=url=>new Promise((r,j)=>get(url,res=>{let data='';res.on('data',x=>data+=x);res.on('end',()=>r(JSON.parse(data)));}).on('error',j));
let socket;const report=[],errors=[];
try{
 let port;for(let i=0;i<100&&!port;i++){port=await readFile(join(profile,'DevToolsActivePort'),'utf8').then(x=>Number(x.split('\n')[0]),()=>0);if(!port)await delay(100);}assert.ok(port);
 const page=(await json('http://127.0.0.1:'+port+'/json/list')).find(x=>x.type==='page');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();
 socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);if(x.error)p?.reject(Error(JSON.stringify(x.error)));else p?.resolve(x.result);}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.exception?.description??x.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async expression=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await delay(50);}assert.fail(expression+' '+JSON.stringify(errors)+' '+await evaluate('document.body.innerText'));};
 const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(60);};
 const fill=async(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}),proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const open=async(query='')=>{requests.length=0;rpcCalls.length=0;statuses.clear();await send('Page.navigate',{url:origin+'/'+query});await until("!!document.querySelector('[data-category]')");await delay(80);};
 const step4=async()=>{for(let i=0;i<3;i++)await click('.publish-controls .primary-control');await until("!!document.querySelector('.publish-promotions')");};
 const selected=()=>evaluate("[...document.querySelectorAll('[name=publish-promotion]:checked')].map(x=>x.value)");
 await send('Page.enable');await send('Runtime.enable');await send('DOM.enable');await send('CSS.enable');
 for(const [width,height] of [[390,844],[430,932],[768,1024],[1366,768]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});await open();await step4();
  assert.deepEqual(await selected(),['accelerated']);assert.equal(await evaluate("document.querySelectorAll('[name=publish-promotion]').length"),4);
  assert.equal(await evaluate("[...document.querySelectorAll('.publish-promotion-option small')].every(x=>x.textContent==='Бесплатно')"),true);
  assert.equal(await evaluate("document.querySelector('input[autocomplete=name]').value==='Тест'&&document.querySelector('input[autocomplete=tel]').value==='+77001234567'"),true);
  assert.equal(await evaluate("document.querySelector('.publish-advertise').disabled"),false);
  for(const value of ['basic','maximum','city_premium','accelerated']){await click(`[value=${value}] + span`);assert.deepEqual(await selected(),[value]);await click(`[value=${value}] + span`);assert.deepEqual(await selected(),[value]);}
  await click('.publish-controls-final > .secondary-control');await click('.publish-controls .primary-control');assert.deepEqual(await selected(),['accelerated']);
  const style=await evaluate("(()=>{const a=document.querySelector('.publish-advertise'),b=document.querySelector('.publish-without-promotion');return {gold:getComputedStyle(a).backgroundImage,color:getComputedStyle(a).color,white:getComputedStyle(b).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,vertical:[...document.querySelectorAll('.publish-promotion-option')].map(x=>x.getBoundingClientRect().top),heights:[a,b].map(x=>x.getBoundingClientRect().height)}})()");
  assert.equal(style.color,'rgb(43, 37, 24)');assert.match(style.gold,/250, 233, 184/);assert.equal(style.white,'rgb(255, 255, 255)');assert.equal(style.overflow,false);assert.ok(style.heights.every(h=>h>=48));if(width<500)assert.equal(new Set(style.vertical).size,4);
  await evaluate('window.scrollTo(0,document.body.scrollHeight)');const bottom=await evaluate("document.querySelector('.publish-without-promotion').getBoundingClientRect().bottom");if(width<500)assert.ok(bottom<await evaluate("document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top"));
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(out,`step4-${width}.png`),Buffer.from(shot.data,'base64'));
  const doc=await send('DOM.getDocument'),node=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.publish-advertise'});
  for(const pseudo of [[],['hover'],['active'],['focus-visible']]){await send('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:pseudo});assert.equal(await evaluate("getComputedStyle(document.querySelector('.publish-advertise')).color"),'rgb(43, 37, 24)');}await send('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:[]});
  report.push({viewport:[width,height],controls:'PASS'});
 }
 // Each choice and the explicit opt-out converge on the real submit route and submit_listing adapter.
 for(const value of ['basic','accelerated','maximum','city_premium'])for(const without of [false,true]){
  await open();await step4();await click(`[value=${value}] + span`);await click(without?'.publish-without-promotion':'.publish-advertise');await until("!!document.querySelector('.publish-success')");
  assert.equal(statuses.get(listingId),'pending');assert.deepEqual(rpcCalls,[{name:'submit_listing',args:{target_listing_id:listingId}}]);
  assert.equal(requests.length,2);assert.equal(requests[0].method,'PATCH');assert.equal(requests[1].path,`/api/listings/${listingId}/submit`);assert.deepEqual(requests[1].body,{promotionChoice:without?null:value});assert.ok(!requests.some(r=>/promotion|premium/.test(r.path)));
  report.push({choice:value,without,moderation:'PASS'});
 }
 // Brand new listing: actual UI fields + photo selection -> create -> upload -> same submit endpoint.
 for(const without of [false,true]){
  await open('?new');await click('[data-category]');await click('.publish-controls .primary-control');await fill('input[maxlength="70"]','Новое тестовое объявление');await fill('textarea','Подробное описание для проверки новой публикации');await click('.publish-controls .primary-control');
  await evaluate("(()=>{const canvas=document.createElement('canvas');canvas.width=80;canvas.height=60;const c=canvas.getContext('2d');c.fillStyle='#14713d';c.fillRect(0,0,80,60);return new Promise(r=>canvas.toBlob(blob=>{const dt=new DataTransfer();dt.items.add(new File([blob],'fixture.png',{type:'image/png'}));const input=document.querySelector('input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));r();}));})()");
  await until("document.querySelectorAll('.photo-preview-grid article').length===1");await click('.publish-controls .primary-control');await until("!!document.querySelector('.publish-promotions')");await click(without?'.publish-without-promotion':'.publish-advertise');await until("!!document.querySelector('.publish-success')");
  assert.deepEqual(requests.map(r=>[r.method,r.path]),[['POST','/api/listings'],['POST',`/api/listings/${listingId}/images`],['POST',`/api/listings/${listingId}/submit`]]);assert.deepEqual(requests[2].body,{promotionChoice:without?null:'accelerated'});assert.equal(statuses.get(listingId),'pending');report.push({newListing:true,without,moderation:'PASS'});
 }
 // Same-event double clicks must not create two saves/submits.
 await open();await step4();await evaluate("document.querySelector('.publish-advertise').click();document.querySelector('.publish-without-promotion').click()");await until("!!document.querySelector('.publish-success')");assert.equal(requests.length,2);assert.equal(rpcCalls.length,1);report.push({doubleClick:'PASS'});
 for(const failure of ['save-error','submit-error']){mode=failure;await open();await step4();await click('.publish-advertise');await until("!!document.querySelector('.form-error')");assert.equal(await evaluate("!!document.querySelector('.publish-success')"),false);assert.equal(await evaluate("document.querySelector('.publish-advertise').disabled"),false);assert.equal(rpcCalls.length,failure==='save-error'?0:1);mode='success';await click('.publish-without-promotion');await until("!!document.querySelector('.publish-success')");assert.equal(statuses.get(listingId),'pending');assert.deepEqual(requests.at(-1).body,{promotionChoice:null});report.push({failure,retry:'PASS'});}
 await open();await step4();await fill('input[autocomplete=tel]','123');await click('.publish-advertise');assert.equal(requests.length,0);await click('.publish-without-promotion');assert.equal(requests.length,0);report.push({validation:'PASS'});
 await open('?rejected');await step4();await click('.publish-without-promotion');await until("!!document.querySelector('.publish-success')");assert.equal(statuses.get(listingId),'pending');report.push({resubmit:'PASS'});
 await open('?lang=kk');await step4();assert.equal(await evaluate("document.querySelector('.publish-promotions legend').textContent"),'Хабарландыруды ілгерілету');assert.deepEqual(await selected(),['accelerated']);report.push({kazakh:'PASS'});
 assert.deepEqual(errors,[]);await writeFile(join(out,'browser-result.json'),JSON.stringify({status:'PASS',scenarios:report.length,report,errors},null,2));console.log(JSON.stringify({status:'PASS',scenarios:report.length,errors}));await send('Browser.close').catch(()=>{});
}finally{socket?.close();child.kill();server.close();delete globalThis.__publishClient;}
