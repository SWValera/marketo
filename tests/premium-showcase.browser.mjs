import assert from "node:assert/strict";
import {access,mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {spawn} from "node:child_process";
import {createServer,get} from "node:http";
import {build} from "esbuild";
import WebSocket from "ws";
const root=resolve("."),out=resolve("artifacts/jevu-premium-responsive-images-20260914");
await mkdir(out,{recursive:true});
const candidates=[process.env.JEVU_BROWSER_PATH,"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/chromium"].filter(Boolean);
let browser;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){browser=path;break;}assert.ok(browser,"An installed Chromium is required");
const mocks={
 "@/lib/showcase-clock":"import {createShowcaseClock as actual} from './lib/showcase-clock.ts';export const createShowcaseClock=(options,env)=>actual(options,{...env,setTimeout:(fn,delay)=>window.__setBoundary(fn,delay),clearTimeout:id=>window.__clearBoundary(id)});",
 "@/components/app-link":"export const AppLink=({children,...props})=><a {...props}>{children}</a>;",
 "@/components/category-link":"export const CategoryLink=({children,cityId,...props})=><a {...props}>{children}</a>;",
 "@/components/i18n-provider":"import {translate} from './lib/i18n/messages';export const useI18n=()=>({locale:window.lang,t:(key,values)=>translate(window.lang,key,values)});",
 "@/components/location-picker":"export const useStoredLocation=()=> 'fixture-city';export const LocationPicker=()=>null;",
 "@/components/reference-geography-provider":"const value={data:{regions:[],settlements:[{id:'fixture-city',name:{ru:'Петропавловск',kk:'Петропавл'}}]},ensureLoaded:()=>{}};export const useReferenceGeography=()=>value;",
};
const entry=`
import React from 'react';import{createRoot}from'react-dom/client';import{CityPremiumShowcase}from'./components/city-premium-showcase';
const params=new URLSearchParams(location.search),count=Number(params.get('count')||0);window.lang=params.get('lang')||'ru';window.ready=false;
const shapes=params.has('healthy')?['landscape','portrait','square']:['landscape','portrait','square','missing','broken'];
const placements=Array.from({length:count},(_,i)=>({id:'placement-'+i,listingId:'listing-'+i,slug:'fixture',title:i===0?'Длинное название объявления для проверки переноса текста':'Объявление '+(i+1),priceMinor:1000000,currencyCode:'KZT',locationRu:'Петропавловск',locationKk:'Петропавл',imageUrl:shapes[i%shapes.length]==='missing'?null:'/api/media/listings/fixture/'+i+'/'+shapes[i%shapes.length]+'.svg?delay='+Number(params.get('delay')||180),expiresAt:new Date(Date.now()+86400000).toISOString()}));
window.fetch=async()=>{window.ready=true;return new Response(JSON.stringify({capacity:15,placements}),{headers:{'content-type':'application/json'}})};
createRoot(document.getElementById('app')).render(<><main className="page-shell home-showcase-shell"><CityPremiumShowcase/></main><div style={{height:150}}/><nav className="mobile-bottom-nav"><a href="#app">JEVU</a></nav></>);
`;
const bundle=await build({stdin:{contents:entry,loader:"tsx",resolveDir:root},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"showcase-fixture",setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:"fixture"}:null);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:mocks[a.path],loader:"tsx",resolveDir:root}));}}]});
const css=(await readFile("app/globals.css","utf8")).replace('@import "tailwindcss";',"")+'\n.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }';
const server=createServer((req,res)=>{
 if(req.url.startsWith("/api/media/listings/")){
  if(req.url.includes("broken")){res.writeHead(404);res.end();return;}
  const [w,h]=req.url.includes("portrait")?[300,900]:req.url.includes("square")?[600,600]:[1200,600];
  res.setHeader("Content-Type","image/svg+xml");
  setTimeout(()=>res.end('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#72abc7"/><rect width="'+w/2+'" height="'+h/2+'" fill="#edb660"/><circle cx="'+w/2+'" cy="'+h/2+'" r="'+Math.min(w,h)/4+'" fill="#154e66"/></svg>'),Number(new URL(req.url,'http://fixture').searchParams.get('delay')||160));return;
 }
 res.setHeader("Content-Type",req.url==="/test.js"?"text/javascript":req.url==="/test.css"?"text/css":"text/html");
 res.end(req.url==="/test.js"?bundle.outputFiles[0].contents:req.url==="/test.css"?css:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/test.css"><div id="app"></div><script src="/test.js"></script>');
});await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin="http://127.0.0.1:"+server.address().port,profile=await mkdtemp(join(out,"showcase-browser-"));
const child=spawn(browser,["--headless=new","--no-first-run","--disable-background-networking","--disable-extensions","--disable-sync","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:"ignore",windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),json=url=>new Promise((r,j)=>get(url,res=>{let s="";res.on("data",x=>s+=x);res.on("end",()=>r(JSON.parse(s)));}).on("error",j));
let socket;
try{
 let port;for(let i=0;i<100&&!port;i++){port=await readFile(join(profile,"DevToolsActivePort"),"utf8").then(s=>+s.split("\n")[0],()=>0);if(!port)await delay(100);}assert.ok(port);
 const page=(await json("http://127.0.0.1:"+port+"/json/list")).find(p=>p.type==="page");
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=e=>j(Error(e.error?.stack||e.message||"WebSocket connection failed"));});
 let id=0;const pending=new Map(),errors=[],results=[],imageRequests=[];
 socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);clearTimeout(p?.timer);if(x.error)p?.reject(Error(JSON.stringify(x.error)));else p?.resolve(x.result);}else if(x.method==="Network.requestWillBeSent"&&x.params.type==="Image")imageRequests.push(x.params.request.url);else if(x.method==="Runtime.exceptionThrown")errors.push(x.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id,timer=setTimeout(()=>{pending.delete(next);reject(Error("CDP timeout: "+method));},30000);pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(30);}assert.fail(expression);};
 await send("Page.enable");await send("Runtime.enable");
 await send("Page.addScriptToEvaluateOnNewDocument",{source:"window.__decoded=new WeakSet();window.__partialFrames=0;const originalDecode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){return originalDecode.call(this).then(()=>{window.__decoded.add(this)})};const inspect=()=>{for(const c of document.querySelectorAll('.showcase-paid-card:not([hidden])')){const img=c.querySelector('img'),text=c.querySelector('.showcase-card-copy strong');if(img&&text&&getComputedStyle(text).visibility==='visible'&&getComputedStyle(img).display!=='none'&&(!img.complete||!img.naturalWidth||!window.__decoded.has(img)))window.__partialFrames++}requestAnimationFrame(inspect)};requestAnimationFrame(inspect);"});
 await send("Page.addScriptToEvaluateOnNewDocument",{source:"window.__fakeNow=Number(new URLSearchParams(location.search).get('now')||0);\nDate.now=()=>window.__fakeNow;\nwindow.__hidden=false;\nObject.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden});\nwindow.__clockTimers=new Map();window.__clockID=0;window.__clockMax=0;\nwindow.__setBoundary=(fn,delay)=>{const id=++window.__clockID;window.__clockTimers.set(id,{fn,at:Date.now()+delay});window.__clockMax=Math.max(window.__clockMax,window.__clockTimers.size);return id;};\nwindow.__clearBoundary=id=>window.__clockTimers.delete(id);\nwindow.__advance=to=>{while(true){const entry=[...window.__clockTimers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>to)break;window.__fakeNow=entry[1].at;window.__clockTimers.delete(entry[0]);entry[1].fn();}window.__fakeNow=to;};\n"});
 await send("Page.addScriptToEvaluateOnNewDocument",{source:`window.imageFrames=[];const loop=()=>{if(window.ready && document.querySelector('.showcase-status')){const cards=[...document.querySelectorAll('.showcase-card:not([hidden])')];if(cards.length)window.imageFrames.push(cards.map(c=>[c.getBoundingClientRect().width,c.getBoundingClientRect().height]));}requestAnimationFrame(loop)};requestAnimationFrame(loop);`});
 const geometry=`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}};const cards=[...document.querySelectorAll('.showcase-card:not([hidden])')];return {scrollWidth:document.documentElement.scrollWidth,columns:getComputedStyle(document.querySelector('.showcase-grid')).gridTemplateColumns.split(' ').length,real:cards.filter(c=>c.classList.contains('showcase-paid-card')).length,demo:cards.filter(c=>c.classList.contains('showcase-brand-card')).length,links:cards.filter(c=>c.classList.contains('showcase-paid-card')).map(c=>c.getAttribute('href')),counter:document.querySelector('.showcase-status')?.textContent,cards:cards.map(c=>({box:rect(c),media:c.querySelector('.showcase-media')?rect(c.querySelector('.showcase-media')):null,image:c.querySelector('img')&&getComputedStyle(c.querySelector('img')).display!=='none'?{...rect(c.querySelector('img')),fit:getComputedStyle(c.querySelector('img')).objectFit}:null,copy:rect(c.querySelector('.showcase-card-copy')),overflow:c.scrollWidth>c.clientWidth}))}})()`;
 const assertGeometry=(g,width,columns)=>{assert.ok(g.scrollWidth<=width, "No horizontal overflow");assert.equal(g.columns,columns);for(const c of g.cards){assert.ok(!c.overflow);assert.ok(c.copy.bottom<=c.box.bottom+1);if(c.media){assert.ok(Math.abs(c.media.h-Math.min(c.media.w*.75,width>=1180?180:240))<1);if(c.image){assert.equal(c.image.fit,"cover");assert.ok(Math.abs(c.image.w-c.media.w)<1);assert.ok(Math.abs(c.image.h-c.media.h)<1);assert.ok(Math.abs(c.image.y-c.media.y)<1);}}}};

 const counts=[0,1,2,3,4,5,15],demo=[2,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1];
 for(const [width,height,mobile] of [[375,812,true],[390,844,true],[430,932,true],[768,1024,false],[1024,1366,false],[1180,820,false],[1366,768,false],[1536,864,false],[1920,1080,false]]){
  await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile});
  await send("Emulation.setTouchEmulationEnabled",{enabled:mobile});
  for(const count of counts){
   await send("Page.navigate",{url:origin+"/?count="+count});await until("window.ready && !!document.querySelector('.showcase-status')");await delay(300);
   const collapsed=await evaluate(geometry),size=width>=1536?4:width>=1180?3:2,pageCount=Math.ceil((count+demo[count])/size);
   assertGeometry(collapsed,width,size);assert.equal(collapsed.cards.length,Math.min(count+demo[count],size));assert.equal(collapsed.real,Math.min(count,size));assert.equal(collapsed.demo,Math.min(demo[count],Math.max(0,size-count)));
   assert.ok(collapsed.counter.includes(String(count))&&collapsed.counter.includes("15"));
   const frames=await evaluate("window.imageFrames");
   for(const frame of frames)assert.deepEqual(frame,frames.at(-1),"Image loading cannot change card geometry");
   assert.equal(await evaluate("document.querySelectorAll('.showcase-dots button').length"),pageCount>1?pageCount:0);
   const seen=[];
   for(let pageIndex=0;pageIndex<pageCount;pageIndex++){
     await delay(180);const current=await evaluate(geometry);
     assertGeometry(current,width,size);assert.equal(current.cards.length,Math.min(size,count+demo[count]-pageIndex*size));
     assert.equal(current.demo,pageIndex===pageCount-1?demo[count]:0);
     assert.ok(current.cards.every(c=>Math.abs(c.box.h-collapsed.cards[0].box.h)<1),"No height jump between pages");
     seen.push(...current.links);
     if(pageCount>1){
       assert.equal(await evaluate("[...document.querySelectorAll('.showcase-dots button')].findIndex(b=>b.getAttribute('aria-current')==='true')"),pageIndex);
       await evaluate("document.querySelector('.showcase-arrow-next').click()");
       await until("[...document.querySelectorAll('.showcase-dots button')].findIndex(b=>b.getAttribute('aria-current')==='true')==="+((pageIndex+1)%pageCount));
     }
   }
   assert.deepEqual(seen,Array.from({length:count},(_,i)=>"/listing/listing-"+i+"-fixture"));
   if(pageCount>1){
     await evaluate("document.querySelector('.showcase-arrow-prev').click()");
     await until("document.querySelector('.showcase-dots button:last-child').getAttribute('aria-current')==='true'");
     await evaluate("document.querySelector('.showcase-dots button').click()");
     await until("document.querySelector('.showcase-dots button').getAttribute('aria-current')==='true'");
     await evaluate("document.querySelector('.showcase-grid').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
     await until("document.querySelectorAll('.showcase-dots button')[1].getAttribute('aria-current')==='true'");
     await evaluate("document.querySelector('.showcase-dots button').click()");
     await until("document.querySelector('.showcase-dots button').getAttribute('aria-current')==='true'");
   }
   if(count===3&&mobile){
     await evaluate("window.scrollTo({top:0,behavior:'instant'})");
     const point=await evaluate("(()=>{const r=document.querySelector('.showcase-media').getBoundingClientRect();return {x:r.x+r.width*.8,y:r.y+r.height*.5}})()");
     await send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});
     for(let step=1;step<=4;step++)await send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:point.x-step*16,y:point.y}]});
     await send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
     await until("document.querySelectorAll('.showcase-dots button')[1].getAttribute('aria-current')==='true'");
     assert.ok((await evaluate("location.href")).startsWith(origin),"Swiping must not open a listing");
     assert.equal(await evaluate("window.__clockTimers.size"),1);
     assert.equal(await evaluate("[...window.__clockTimers.values()][0].at"),3000,"Swipe keeps the global deadline");
     await evaluate("window.__advance(6000)");
     await until("document.querySelector('.showcase-dots button').getAttribute('aria-current')==='true'");
     await evaluate("document.querySelector('.showcase-dots button').click()");
     await until("document.querySelector('.showcase-dots button').getAttribute('aria-current')==='true'");
   }
   if(count===3&&[390,430,1180,1366,1536].includes(width)){
     const shot=await send("Page.captureScreenshot",{format:"png"});await writeFile(join(out,"carousel-"+width+".png"),Buffer.from(shot.data,"base64"));
   }
   await evaluate("window.firstCard=document.querySelector('.showcase-paid-card:not([hidden])');document.querySelector('.showcase-view-all').click()");
   await until("document.querySelector('.showcase-view-all').getAttribute('aria-expanded')==='true'");await delay(220);
   const expanded=await evaluate(geometry);assertGeometry(expanded,width,width<=640?2:width>=1024?4:3);assert.equal(expanded.real,count);assert.equal(expanded.demo,demo[count]);
   assert.deepEqual(expanded.links,Array.from({length:count},(_,i)=>"/listing/listing-"+i+"-fixture"));
   assert.equal(await evaluate("document.querySelectorAll('.showcase-arrow,.showcase-dots').length"),0);
   if(count>0)assert.equal(await evaluate("window.firstCard===document.querySelector('.showcase-paid-card:not([hidden])')"),true);
   await evaluate("window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})");await delay(230);
   if(mobile)assert.equal(await evaluate("document.querySelector('.showcase-card:not([hidden]):last-child').getBoundingClientRect().bottom<=document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top"),true);
   if(count>=5)assert.equal(await evaluate("[...document.querySelectorAll('.showcase-media img')].filter(i=>i.src.includes('/broken')).every(i=>getComputedStyle(i).display==='none')"),true);
   await evaluate("document.querySelector('.showcase-view-all').click()");await until("document.querySelector('.showcase-view-all').getAttribute('aria-expanded')==='false'");
   const restored=await evaluate(geometry);assert.equal(restored.cards.length,Math.min(size,count+demo[count]));assert.deepEqual(restored.links,collapsed.links);
   results.push({width,count,pages:pageCount,collapsed:"PASS",arrowsDotsKeyboard:"PASS",swipe:count===3&&mobile?"PASS":"not run",expanded:"PASS",restored:"PASS",images:"PASS"});
  }
  console.log(JSON.stringify({width,status:"PASS"}));
 }
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send("Page.navigate",{url:origin+"/?count=3&lang=kk"});await until("window.ready && !!document.querySelector('.showcase-status')");
 assert.equal(await evaluate("document.querySelectorAll('.showcase-card:not([hidden])').length"),2);
 await evaluate("document.querySelector('.showcase-arrow-next').click()");
 await until("document.querySelectorAll('.showcase-brand-card:not([hidden])').length===1");

 // Deterministic wall clock with the actual hook, controller and browser lifecycle listeners.
 // Only boundary scheduling is controlled; React, DOM, image loading and touch events are real.
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 for(const count of counts){
   const pages=(count+demo[count])/2,start=8400;
   await send("Page.navigate",{url:origin+"/?count="+count+"&now="+start});
   await until("window.ready && !!document.querySelector('.showcase-status')");await delay(250);
   const currentPage=()=>evaluate("(()=>{const buttons=[...document.querySelectorAll('.showcase-dots button')];return buttons.length?buttons.findIndex(b=>b.getAttribute('aria-current')==='true'):0})()");
   const expectedAt=time=>Math.floor(time/3000)%pages;
   const check=async expected=>{await until("(()=>{const b=[...document.querySelectorAll('.showcase-dots button')];return (b.length?b.findIndex(x=>x.getAttribute('aria-current')==='true'):0)})()==="+expected);assert.equal(await evaluate("document.querySelectorAll('.showcase-card:not([hidden])').length"),2);};
   await check(expectedAt(start));
   assert.equal(await evaluate("window.__clockTimers.size"),pages>1?1:0);
   if(pages>1){
     assert.equal(await evaluate("[...window.__clockTimers.values()][0].at"),9000);
     await evaluate("window.__advance(8999)");await check(expectedAt(start));
     const heights=(await evaluate(geometry)).cards.map(c=>c.box.h);
     for(let step=0;step<pages+2;step++){
       const time=9000+step*3000;
       await evaluate("window.__advance("+time+")");await check(expectedAt(time));
       const g=await evaluate(geometry);assertGeometry(g,390,2);assert.deepEqual(g.cards.map(c=>c.box.h),heights);
     }
     const now=await evaluate("Date.now()"),deadline=await evaluate("[...window.__clockTimers.values()][0].at");
     const before=await currentPage();
     await evaluate("document.querySelector('.showcase-arrow-next').click()");await check((before+1)%pages);
     assert.equal(await evaluate("[...window.__clockTimers.values()][0].at"),deadline);
     await evaluate("document.querySelector('.showcase-arrow-prev').click()");await check(before);
     await evaluate("document.querySelectorAll('.showcase-dots button')[0].click()");await check(0);
     assert.equal(await evaluate("window.__clockTimers.size"),1);
     await evaluate("window.__advance("+deadline+")");await check(expectedAt(deadline));
     // Expanded has no boundary timer. Collapse uses time now, not page one.
     await evaluate("document.querySelector('.showcase-view-all').click()");
     await until("document.querySelector('.showcase-view-all').getAttribute('aria-expanded')==='true' && window.__clockTimers.size===0");
     const collapseAt=(Math.floor((now+30000)/3000)+1)*3000+1200;
     await evaluate("window.__fakeNow="+collapseAt+";document.querySelector('.showcase-view-all').click()");
     await check(expectedAt(collapseAt));assert.equal(await evaluate("window.__clockTimers.size"),1);
     // Hidden removes the timer, resume jumps directly after 30 seconds.
     await evaluate("window.__hidden=true;document.dispatchEvent(new Event('visibilitychange'))");
     await until("window.__clockTimers.size===0");
     const resumeAt=collapseAt+31000;
     await evaluate("window.__fakeNow="+resumeAt+";window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'))");
     await check(expectedAt(resumeAt));assert.equal(await evaluate("window.__clockTimers.size"),1);
     // Focus and BFCache restore clear even same-bucket manual overrides.
     await evaluate("document.querySelector('.showcase-arrow-next').click()");await check((expectedAt(resumeAt)+1)%pages);
     await evaluate("window.dispatchEvent(new Event('focus'))");await check(expectedAt(resumeAt));
     await evaluate("window.dispatchEvent(new Event('pagehide'))");await until("window.__clockTimers.size===0");
     await evaluate("window.__fakeNow="+(resumeAt+35000)+";window.dispatchEvent(new Event('pageshow'))");await check(expectedAt(resumeAt+35000));
     assert.equal(await evaluate("window.__clockMax"),1,"No second boundary timer after manual/mode/lifecycle events");
   }
   const remountAt=37400;
   await send("Page.navigate",{url:origin+"/?count="+count+"&now="+remountAt});
   await until("window.ready && !!document.querySelector('.showcase-status')");await check(expectedAt(remountAt));
   results.push({count,timeSync:"PASS",midBucketMount:"PASS",remainder:pages>1?600:null,background:"PASS",expanded:"PASS",remount:"PASS"});
 }


 // Cold cache: actual HTTP, actual decode, actual retained img nodes, controlled clock only.
 await send("Network.enable");await send("Network.setCacheDisabled",{cacheDisabled:true});
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const requestStart=imageRequests.length;
 await send("Page.navigate",{url:origin+"/?count=15&healthy=1&delay=650"});
 await until("window.ready && !!document.querySelector('.showcase-status')");
 await until("!document.querySelector('.showcase-grid-pending')");
 assert.ok(imageRequests.length-requestStart<=6,"Prepare only current/next/previous, not all 15");
 const imageReady="([...document.querySelectorAll('.showcase-card:not([hidden]) img')].every(i=>i.complete&&i.naturalWidth>0&&window.__decoded.has(i)&&getComputedStyle(i).visibility==='visible'))";
 await until(imageReady);
 const imageSteps=[];
 for(let step=1;step<=8;step++){
  await delay(750);await evaluate("window.__advance("+step*3000+")");
  await until("document.querySelectorAll('.showcase-dots button')["+step%8+"].getAttribute('aria-current')==='true'");
  assert.equal(await evaluate(imageReady),true,"Next page decoded BEFORE its reveal");
  imageSteps.push({bucket:step,ready:true});
 }
 for(const direction of ["prev","next"]){
  await evaluate("document.querySelector('.showcase-arrow-"+direction+"').click()");
  await delay(40);assert.equal(await evaluate(imageReady),true);
 }
 const requests=imageRequests.slice(requestStart).filter(u=>u.includes("/api/media/"));
 assert.ok(requests.every(u=>u.includes("variant=card")),"Every carousel source uses the thumbnail variant");
 assert.equal(new Set(requests).size,requests.length,"Retained nodes request each URL once even with HTTP cache disabled");
 const warmed=requests.length;
 await send("Network.setCacheDisabled",{cacheDisabled:false});
 for(let step=9;step<=12;step++){await evaluate("window.__advance("+step*3000+")");await delay(40);assert.equal(await evaluate(imageReady),true);}
 assert.equal(imageRequests.slice(requestStart).filter(u=>u.includes("/api/media/")).length,warmed);
 assert.equal(await evaluate("window.__partialFrames"),0,"Never reveal text with an undecoded/missing photo");
 results.push({imageCold:"PASS",decodeBeforeReveal:"PASS",imageSteps,requests:warmed,repeatedRequests:0,warmCycles:"PASS"});

 // Resize the same mounted instance. Scope must reset manual selection even when pageCount stays equal.
 for(const count of [3,15]){
  await send("Page.navigate",{url:origin+"/?count="+count+"&healthy=1&now=43400"});
  await until("window.ready && !!document.querySelector('.showcase-status')");
  for(const [width,height,size] of [[768,1024,2],[1180,820,3],[1024,1366,2],[1366,768,3],[1536,864,4],[390,844,2]]){
   const previousSize=await evaluate("Number(document.querySelector('.city-premium-showcase').dataset.cardsPerPage)");
   await evaluate("document.querySelector('.showcase-arrow-next')?.click()");
   await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<500});
   await until("document.querySelector('.city-premium-showcase').dataset.cardsPerPage==="+JSON.stringify(String(size)));
   const pages=Math.ceil((count+demo[count])/size),expected=Math.floor(43400/3000)%pages;
   // A same-size transition preserves manual state; dispatch focus simulates returning to the viewport.
   if(previousSize===size)await evaluate("window.dispatchEvent(new Event('focus'))");
   await until("(()=>{const b=[...document.querySelectorAll('.showcase-dots button')];return b.length?b.findIndex(x=>x.getAttribute('aria-current')==='true'):0})()==="+expected);
   const g=await evaluate(geometry);assertGeometry(g,width,size);
   assert.equal(g.cards.length,Math.min(size,count+demo[count]-expected*size));
   assert.equal(await evaluate("window.__clockTimers.size"),pages>1?1:0);
   assert.equal(await evaluate("window.__clockMax"),1);
   await until("!document.querySelector('.showcase-grid-pending')");
  }
 }
 results.push({liveResize:"PASS",widths:[768,1180,1024,1366,1536,390],timeSyncAfterResize:"PASS",oneTimer:"PASS"});

 assert.deepEqual(errors,[]);
 await writeFile(join(out,"browser-result.json"),JSON.stringify({status:"PASS",environment:"Installed Chromium; actual showcase/CSS with fixture data/images; not physical Safari/PWA",scenarios:results.length+1,results,errors},null,2));
 console.log(JSON.stringify({status:"PASS",scenarios:results.length+1,errors}));
 await send("Browser.close").catch(()=>{});
}finally{socket?.close();child.kill();server.close();}
