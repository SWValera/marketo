import assert from "node:assert/strict";
import {access,mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {spawn} from "node:child_process";
import {createServer,get} from "node:http";
import {build} from "esbuild";
import WebSocket from "ws";
const root=resolve("."),out=resolve("artifacts/jevu-premium-phone-landscape-20260914");
await mkdir(out,{recursive:true});
const candidates=[process.env.JEVU_BROWSER_PATH,"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/chromium"].filter(Boolean);
let browser;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){browser=path;break;}assert.ok(browser,"An installed Chromium is required");
const mocks={
 "@/lib/showcase-clock":"import {createShowcaseClock as actual} from './lib/showcase-clock.ts';export const createShowcaseClock=(options,env)=>actual(options,{...env,setTimeout:(fn,delay)=>window.__setBoundary(fn,delay),clearTimeout:id=>window.__clearBoundary(id)});",
 "@/components/app-link":"export const AppLink=({children,...props})=><a {...props}>{children}</a>;",
 "@/components/category-link":"export const CategoryLink=({children,cityId,...props})=><a {...props}>{children}</a>;",
 "@/components/i18n-provider":"import {translate} from './lib/i18n/messages';export const useI18n=()=>({locale:window.lang,t:(key,values)=>translate(window.lang,key,values)});",
 "@/components/location-picker":"import {useSyncExternalStore} from 'react';let city='fixture-city';const listeners=new Set();window.changeLocation=(value,count,delay=0)=>{window.fixtureCounts[value]=count;window.scopeDelay=delay;city=value;listeners.forEach(f=>f())};export const useStoredLocation=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>city,()=>city);export const LocationPicker=({className})=><button className={className}>Петропавловск</button>;",
 "@/components/pwa-install":"export const PwaInstall=()=> <button className='install-header-button'><span className='install-header-label'>Установить</span><span className='install-header-icon'>↓</span></button>;",
 "@/components/language-switcher":"export const LanguageSwitcher=()=> <div className='language-switcher compact'><button>RU</button><button>КАЗ</button></div>;",
 "@/components/reference-geography-provider":"const value={data:{regions:[],settlements:[{id:'fixture-city',name:{ru:'Петропавловск',kk:'Петропавл'}}]},ensureLoaded:()=>{}};export const useReferenceGeography=()=>value;",
};
const entry=`
import React from 'react';import{createRoot,hydrateRoot}from'react-dom/client';import{renderToString}from'react-dom/server';import{CityPremiumShowcase}from'./components/city-premium-showcase';import{Header}from'./components/header';
const params=new URLSearchParams(location.search),count=Number(params.get('count')||0);window.lang=params.get('lang')||'ru';window.ready=false;window.fixtureCounts={'fixture-city':count};window.scopeDelay=0;window.requestScopes=[];
const shapes=params.has('healthy')?['landscape','portrait','square']:['landscape','portrait','square','missing','broken'];
const placementsFor=count=>Array.from({length:count},(_,i)=>({id:'placement-'+i,listingId:'listing-'+i,slug:'fixture',title:i===0?'Длинное название объявления для проверки переноса текста':'Объявление '+(i+1),priceMinor:i===0?100000000:1000000,currencyCode:'KZT',locationRu:'Петропавловск',locationKk:'Петропавл',imageUrl:shapes[i%shapes.length]==='missing'?null:'/api/media/listings/fixture/'+i+'/'+shapes[i%shapes.length]+'.svg?delay='+Number(params.get('delay')||180),expiresAt:new Date(Date.now()+86400000).toISOString()}));
window.fetch=async url=>{if(url==='/api/lifecycle/time')return new Response(JSON.stringify({now:Math.max(1,window.__fakeNow)}),{headers:{'content-type':'application/json'}});const city=new URL(url,location.origin).searchParams.get('city');window.requestScopes.push(city);const count=window.fixtureCounts[city]??0;const ms=window.scopeDelay;await new Promise(r=>setTimeout(r,ms));window.ready=true;return new Response(JSON.stringify({capacity:city==='all'?null:15,placements:placementsFor(count)}),{headers:{'content-type':'application/json'}})};
const initial=params.has("ssr")?{city:"fixture-city",items:placementsFor(count),capacity:15,status:"ready"}:undefined;const tree=<><Header/><main className="page-shell home-showcase-shell"><CityPremiumShowcase initial={initial}/></main><section className="page-shell home-marketplace"><div className="home-marketplace-tabs"><button>Каталог</button><button>Объявления</button></div><div className="section-heading"><div><span className="section-kicker">Полный каталог</span><h2>Популярные категории</h2></div></div><div style={{height:180}}/></section><nav className="mobile-bottom-nav"><a href="#app">JEVU</a></nav></>;
if(initial){window.ready=true;document.getElementById('app').innerHTML=renderToString(tree);window.ssrHtml=document.getElementById('app').innerHTML;hydrateRoot(document.getElementById('app'),tree)}else createRoot(document.getElementById('app')).render(tree);
`;
const bundle=await build({stdin:{contents:entry,loader:"tsx",resolveDir:root},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"showcase-fixture",setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:"fixture"}:null);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:mocks[a.path],loader:"tsx",resolveDir:root}));}}]});
const css=(await readFile("app/globals.css","utf8")).replace('@import "tailwindcss";',"")+'\n.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }';
const baselineCss=css.slice(0,css.indexOf("/* Short landscape phones only:"))+css.slice(css.lastIndexOf("\n.sr-only"));
const server=createServer((req,res)=>{
 if(req.url.startsWith("/api/media/listings/")){
  if(req.url.includes("broken")){res.writeHead(404);res.end();return;}
  const [w,h]=req.url.includes("portrait")?[300,900]:req.url.includes("square")?[600,600]:[1200,600];
  res.setHeader("Content-Type","image/svg+xml");
  setTimeout(()=>res.end('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#72abc7"/><rect width="'+w/2+'" height="'+h/2+'" fill="#edb660"/><circle cx="'+w/2+'" cy="'+h/2+'" r="'+Math.min(w,h)/4+'" fill="#154e66"/></svg>'),Number(new URL(req.url,'http://fixture').searchParams.get('delay')||160));return;
 }
 res.setHeader("Content-Type",req.url==="/test.js"?"text/javascript":["/test.css","/baseline.css"].includes(req.url)?"text/css":"text/html");
 res.end(req.url==="/test.js"?bundle.outputFiles[0].contents:req.url==="/baseline.css"?baselineCss:req.url==="/test.css"?css:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/test.css"><div id="app"></div><script src="/test.js"></script>');
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
 socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);clearTimeout(p?.timer);if(x.error)p?.reject(Error(JSON.stringify(x.error)));else p?.resolve(x.result);}else if(x.method==="Network.requestWillBeSent"&&x.params.type==="Image")imageRequests.push(x.params.request.url);else if(x.method==="Runtime.exceptionThrown")errors.push(x.params.exceptionDetails.exception?.description||x.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id,timer=setTimeout(()=>{pending.delete(next);reject(Error("CDP timeout: "+method));},30000);pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(30);}assert.fail(expression+" browserErrors="+JSON.stringify(errors)+" state="+JSON.stringify(await evaluate("({now:Date.now(),scope:document.querySelector('.city-premium-showcase')?.dataset.scope,expanded:document.querySelector('.showcase-view-all')?.getAttribute('aria-expanded'),current:[...document.querySelectorAll('.showcase-dots button')].findIndex(b=>b.getAttribute('aria-current')==='true'),timers:window.__clockTimers.size,errors:window.__partialFrames})")));};
 let visit=0;
 const navigate=async url=>{const target=url+"&visit="+(++visit);await send("Page.navigate",{url:target});await until("location.href==="+JSON.stringify(target)+" && window.ready && !!document.querySelector('.showcase-status')");};
 await send("Page.enable");await send("Runtime.enable");
 await send("Page.addScriptToEvaluateOnNewDocument",{source:"window.__decoded=new WeakSet();window.__partialFrames=0;const originalDecode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){return originalDecode.call(this).then(()=>{window.__decoded.add(this)})};const inspect=()=>{for(const c of document.querySelectorAll('.showcase-paid-card:not([hidden])')){const img=c.querySelector('img'),text=c.querySelector('.showcase-card-copy strong');if(img&&text&&getComputedStyle(text).visibility==='visible'&&getComputedStyle(img).display!=='none'&&(!img.complete||!img.naturalWidth||!window.__decoded.has(img)))window.__partialFrames++}requestAnimationFrame(inspect)};requestAnimationFrame(inspect);"});
 await send("Page.addScriptToEvaluateOnNewDocument",{source:"window.__fakeNow=Number(new URLSearchParams(location.search).get('now')||0);\nDate.now=()=>window.__fakeNow;\nwindow.__hidden=false;\nObject.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden});\nwindow.__clockTimers=new Map();window.__clockID=0;window.__clockMax=0;\nwindow.__setBoundary=(fn,delay)=>{const id=++window.__clockID;window.__clockTimers.set(id,{fn,at:Date.now()+delay});window.__clockMax=Math.max(window.__clockMax,window.__clockTimers.size);return id;};\nwindow.__clearBoundary=id=>window.__clockTimers.delete(id);\nwindow.__advance=to=>{while(true){const entry=[...window.__clockTimers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>to)break;window.__fakeNow=entry[1].at;window.__clockTimers.delete(entry[0]);entry[1].fn();}window.__fakeNow=to;};\n"});
 await send("Page.addScriptToEvaluateOnNewDocument",{source:`window.imageFrames=[];const loop=()=>{if(window.ready && document.querySelector('.showcase-status')){const cards=[...document.querySelectorAll('.showcase-card:not([hidden])')];if(cards.length)window.imageFrames.push(cards.map(c=>[c.getBoundingClientRect().width,c.getBoundingClientRect().height]));}requestAnimationFrame(loop)};requestAnimationFrame(loop);`});
 const geometry=`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}};const cards=[...document.querySelectorAll('.showcase-card:not([hidden])')];return {viewportHeight:innerHeight,scrollWidth:document.documentElement.scrollWidth,columns:getComputedStyle(document.querySelector('.showcase-grid')).gridTemplateColumns.split(' ').length,real:cards.filter(c=>c.classList.contains('showcase-paid-card')).length,demo:cards.filter(c=>c.classList.contains('showcase-brand-card')).length,links:cards.filter(c=>c.classList.contains('showcase-paid-card')).map(c=>c.getAttribute('href')),counter:document.querySelector('.showcase-status')?.textContent,cards:cards.map(c=>({box:rect(c),media:c.querySelector('.showcase-media')?rect(c.querySelector('.showcase-media')):null,image:c.querySelector('img')&&getComputedStyle(c.querySelector('img')).display!=='none'?{...rect(c.querySelector('img')),fit:getComputedStyle(c.querySelector('img')).objectFit}:null,copy:rect(c.querySelector('.showcase-card-copy')),overflow:c.scrollWidth>c.clientWidth}))}})()`;
 const assertGeometry=(g,width,columns)=>{assert.ok(g.scrollWidth<=width, "No horizontal overflow");assert.equal(g.columns,columns);for(const c of g.cards){assert.ok(!c.overflow);assert.ok(c.copy.bottom<=c.box.bottom+1);if(c.media){assert.ok(Math.abs(c.media.h-(columns===3?Math.max(64,Math.min(g.viewportHeight-311,112)):Math.min(c.media.w*.75,columns===4?180:240)))<1);if(c.image){assert.equal(c.image.fit,"cover");assert.ok(Math.abs(c.image.w-c.media.w)<1);assert.ok(Math.abs(c.image.h-c.media.h)<1);assert.ok(Math.abs(c.image.y-c.media.y)<1);}}}};


 const counts=[0,1,2,3,4,5,6,7,8,9,14,15];
 const currentPage="(()=>{const b=[...document.querySelectorAll('.showcase-dots button')];return b.length?b.findIndex(x=>x.getAttribute('aria-current')==='true'):0})()";
 const imageReady="!document.querySelector('.showcase-grid-pending')";
 const sizeAt=(w,h)=>w>=568&&w<=1000&&h<=500&&w>h?3:w>=1440||(w>=1024&&w>h)?4:2;
 const checkPage=async page=>until(currentPage+"==="+page);
 const settle=async()=>{await until("window.ready && !!document.querySelector('.showcase-status')");await until(imageReady);await until("document.readyState==='complete'");await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");};
 await send("DOM.enable");await send("CSS.enable");
 for(const [width,height] of [[375,812],[390,844],[430,932],[667,375],[812,375],[844,390],[932,430],[768,1024],[1024,1366],[1024,768],[1180,820],[1280,800],[1366,768],[1536,864]]){
  if(process.env.JEVU_BROWSER_CASE && width!==Number(process.env.JEVU_BROWSER_CASE.split(":")[0]))continue;
  const size=sizeAt(width,height);
  await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<500});
  await send("Emulation.setTouchEmulationEnabled",{enabled:true});
  for(const count of process.env.JEVU_BROWSER_CASE?[Number(process.env.JEVU_BROWSER_CASE.split(":")[1])]:[390,844,1366].includes(width)?counts:size===3?[3,5,15]:[3,5]){
   console.log(JSON.stringify({width,height,count,phase:"start"}));
   const demo=count===0?size:(size-count%size)%size,pages=Math.max(1,Math.ceil(count/size));
   await navigate(origin+"/?count="+count+"&healthy=1&now=8400");await settle();
   assert.equal(await evaluate("Number(document.querySelector('.city-premium-showcase').dataset.cardsPerPage)"),size);
   await checkPage(Math.floor(8400/3000)%pages);
   assert.equal(await evaluate("window.__clockTimers.size"),pages>1?1:0);
   if(pages>1){assert.equal(await evaluate("[...window.__clockTimers.values()][0].at"),9000);await evaluate("document.querySelector('.showcase-dots button').click()");await checkPage(0);}
   const seen=[],heights=[];
   for(let page=0;page<pages;page++){
    await until(imageReady);const g=await evaluate(geometry);assertGeometry(g,width,size);
    assert.equal(g.cards.length,size);assert.equal(g.real,Math.min(size,Math.max(0,count-page*size)));
    assert.equal(g.demo,page===pages-1?demo:0);seen.push(...g.links);heights.push(g.cards.map(c=>c.box.h));
    if(pages>1){await evaluate("document.querySelector('.showcase-arrow-next').click()");await checkPage((page+1)%pages);}
   }
   assert.equal(new Set(seen).size,count);assert.equal(seen.length,count);
   for(const h of heights)for(const value of h)assert.ok(Math.abs(value-heights[0][0])<1,"Full slides keep their height");
   assert.ok((await evaluate(geometry)).counter.includes(count+""));
   if(pages>1){
    for(let step=0;step<4;step++){const at=9000+step*3000;await evaluate("window.__advance("+at+")");await checkPage(Math.floor(at/3000)%pages);}
    const deadline=await evaluate("[...window.__clockTimers.values()][0].at");
    await evaluate("document.querySelector('.showcase-arrow-prev').click()");await delay(30);
    assert.equal(await evaluate("[...window.__clockTimers.values()][0].at"),deadline);
    await evaluate("document.querySelector('.showcase-grid').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
    await evaluate("window.__advance("+deadline+")");await checkPage(Math.floor(deadline/3000)%pages);
   }
   if(size===4){
    const layout=await evaluate("(()=>{const a=document.querySelector('.header-search-row>.publish-button').getBoundingClientRect(),b=document.querySelector('.header-search').getBoundingClientRect(),n=document.querySelector('.home-marketplace').getBoundingClientRect(),h=document.querySelector('.home-marketplace h2').getBoundingClientRect();return{same:Math.abs(a.y-b.y)<1,left:a.right<=b.left,search:b.width,next:n.y,heading:h.y}})()");
    assert.ok(layout.same&&layout.left&&layout.search>300,JSON.stringify(layout));
    assert.ok(layout.next+52<height,"Existing desktop catalog tabs remain visible: "+JSON.stringify(layout));
   }
   if(size!==3&&count===5){
    const before=await evaluate(geometry);
    await evaluate("new Promise(r=>{const link=document.querySelector('link[rel=stylesheet]');link.onload=()=>requestAnimationFrame(()=>requestAnimationFrame(r));link.href='/baseline.css'})");
    assert.deepEqual(await evaluate(geometry),before,"Non-phone geometry must match the pre-fix stylesheet");
    await evaluate("new Promise(r=>{const link=document.querySelector('link[rel=stylesheet]');link.onload=()=>requestAnimationFrame(()=>requestAnimationFrame(r));link.href='/test.css'})");
   }
   if(size===3){
    const fit=await evaluate("(()=>{const h=document.querySelector('.home-marketplace h2').getBoundingClientRect(),s=document.querySelector('.city-premium-showcase').getBoundingClientRect(),b=document.querySelector('.brand').getBoundingClientRect(),f=document.querySelector('.header-search').getBoundingClientRect(),dots=document.querySelector('.showcase-dots')?.getBoundingClientRect(),title=document.querySelector('.showcase-heading h1').getBoundingClientRect();return{bottom:h.bottom,showcase:s.height,headerRow:Math.abs(b.y-f.y)<4,dotsOverlap:!!dots&&dots.left<title.right&&dots.right>title.left&&dots.top<title.bottom&&dots.bottom>title.top}})()");
    assert.ok(fit.bottom<=height+1&&fit.headerRow&&!fit.dotsOverlap,"Phone landscape first viewport: "+JSON.stringify(fit));
   }
   if(count===5&&[390,667,812,844,932,1024,1366].includes(width)){await evaluate("document.querySelector('.showcase-dots button')?.click()");await delay(50);const shot=await send("Page.captureScreenshot",{format:"png"});await writeFile(join(out,"final-"+width+"-"+height+".png"),Buffer.from(shot.data,"base64"));}
   await evaluate("window.firstImage=document.querySelector('.showcase-paid-card img');document.querySelector('.showcase-view-all').click()");await until("document.querySelector('.showcase-view-all').getAttribute('aria-expanded')==='true'");await delay(200);
   const expanded=await evaluate(geometry);assertGeometry(expanded,width,size);assert.equal(expanded.cards.length,15);assert.equal(expanded.real,count);assert.equal(expanded.demo,15-count);
   assert.equal(await evaluate("window.__clockTimers.size"),0);
   if(count)assert.equal(await evaluate("window.firstImage===document.querySelector('.showcase-paid-card img')"),true);
   if(count===5){
    const doc=await send("DOM.getDocument");const {nodeId}=await send("DOM.querySelector",{nodeId:doc.root.nodeId,selector:".showcase-view-all"});
    for(const pseudo of [[],["hover"],["active"],["focus"],["focus-visible"],["hover","focus"]]){
     await send("CSS.forcePseudoState",{nodeId,forcedPseudoClasses:pseudo});
     const style=await evaluate("(()=>{const b=document.querySelector('.showcase-view-all'),s=getComputedStyle(b);return {text:b.textContent,color:s.color,bg:s.backgroundImage,icon:getComputedStyle(b.querySelector('svg')).color}})()");
     assert.equal(style.color,"rgb(43, 37, 24)");assert.ok(style.bg.includes("gradient"));assert.equal(style.icon,style.color);assert.ok(style.text.includes("Свернуть"));
    }await send("CSS.forcePseudoState",{nodeId,forcedPseudoClasses:[]});
   }
   await evaluate("window.__fakeNow=43400;document.querySelector('.showcase-view-all').click()");await until("document.querySelector('.showcase-view-all').getAttribute('aria-expanded')==='false'");
   await checkPage(Math.floor(43400/3000)%pages);assert.equal((await evaluate(geometry)).cards.length,size);
   assert.ok(await evaluate("window.__clockMax<=1"));
   results.push({width,height,count,size,pages,composition:"PASS",expanded15:"PASS",timeSync:"PASS",header:size===4?"PASS":"preserved",button:"PASS"});
  }console.log(JSON.stringify({width,height,status:"PASS"}));
 }

 // Live location transitions, retained decoded images, late query replacement, and expanded reset.
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await navigate(origin+"/?count=5&healthy=1&now=8400");await settle();
 for(const [scope,count] of [["fixture-other",9],["all",20],["fixture-city",5],["empty",0],["all",20],["fixture-city",5]]){
  await evaluate("document.querySelector('.showcase-view-all').click()");await until("window.__clockTimers.size===0");
  await evaluate("window.changeLocation("+JSON.stringify(scope)+","+count+")");
  await until("document.querySelector('.city-premium-showcase').dataset.scope==="+JSON.stringify(scope));
  await until("document.querySelectorAll('.showcase-paid-card').length==="+count);await until(imageReady);
  assert.equal(await evaluate("document.querySelector('.showcase-view-all').getAttribute('aria-expanded')"),"false");
  const pages=Math.max(1,Math.ceil(count/2)),now=await evaluate("Date.now()");
  await checkPage(Math.floor(now/3000)%pages);
  if(pages>1)for(let i=0;i<4;i++){const next=await evaluate("[...window.__clockTimers.values()][0].at");await evaluate("window.__advance("+next+")");await checkPage(Math.floor(next/3000)%pages);}
  else assert.equal(await evaluate("window.__clockTimers.size"),0);
  assert.ok(await evaluate("window.__clockMax<=1"));
  if(scope==="all"){const g=await evaluate(geometry);assert.ok(!g.counter.includes("из 15"));await evaluate("document.querySelector('.showcase-view-all').click()");await until("window.__clockTimers.size===0");assert.equal((await evaluate(geometry)).real,count);assert.equal((await evaluate(geometry)).demo,0);await evaluate("document.querySelector('.showcase-view-all').click()");await delay(30);}
 }
 await evaluate("window.changeLocation('slow',14,600)");await delay(60);await evaluate("window.changeLocation('latest',8,0)");await until("document.querySelectorAll('.showcase-paid-card').length===8");await delay(750);assert.equal(await evaluate("document.querySelectorAll('.showcase-paid-card').length"),8);
 results.push({scopeChanges:"PASS",national20:"PASS",expandedReset:"PASS",staleResponse:"PASS"});

 // Same instance orientation change, no page-zero reset, background recovery.
 for(const [width,height,size] of [[390,844,2],[844,390,3],[390,844,2],[844,510,2],[844,490,3],[768,1024,2],[1024,768,4],[1024,1366,2],[1180,820,4],[390,844,2]]){
  await evaluate("window.__fakeNow=43400");
  await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<500});
  await until("document.querySelector('.city-premium-showcase').dataset.cardsPerPage==="+JSON.stringify(String(size)));
  const pages=Math.ceil(8/size);await checkPage(Math.floor(43400/3000)%pages);assert.equal((await evaluate(geometry)).cards.length,size);
  await evaluate("window.__hidden=true;document.dispatchEvent(new Event('visibilitychange'))");await until("window.__clockTimers.size===0");
  await evaluate("window.__fakeNow=76400;window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'))");await checkPage(Math.floor(76400/3000)%pages);assert.equal(await evaluate("window.__clockTimers.size"),1);
 }
 results.push({orientation:"PASS",background:"PASS"});

 // Cold decode/network: phone landscape pages preload adjacent thumbnails, then reuse retained nodes.
 await send("Network.enable");await send("Network.setCacheDisabled",{cacheDisabled:true});
 await send("Emulation.setDeviceMetricsOverride",{width:844,height:390,deviceScaleFactor:1,mobile:false});
 const requestStart=imageRequests.length;
 await navigate(origin+"/?count=15&healthy=1&delay=600");await settle();
 const readyImages="([...document.querySelectorAll('.showcase-card:not([hidden]) img')].every(i=>i.complete&&i.naturalWidth>0&&window.__decoded.has(i)&&getComputedStyle(i).visibility==='visible'))";
 for(let step=1;step<=12;step++){
  await delay(2800);await evaluate("window.__advance("+step*3000+")");await checkPage(step%5);
  assert.equal(await evaluate(readyImages),true,"decoded at boundary step="+step+" "+JSON.stringify(await evaluate("[...document.querySelectorAll('.showcase-card:not([hidden]) img')].map(i=>({src:i.getAttribute('src'),complete:i.complete,width:i.naturalWidth,decoded:window.__decoded.has(i),visibility:getComputedStyle(i).visibility}))")));
  if(step===4||step===8){await evaluate("document.querySelector('.showcase-arrow-prev').click()");await delay(40);assert.equal(await evaluate(readyImages),true);await evaluate("document.querySelector('.showcase-arrow-next').click()");await delay(40);}
 }
 const requests=imageRequests.slice(requestStart).filter(u=>u.includes("/api/media/"));
 assert.equal(requests.length,15);assert.equal(new Set(requests).size,15);assert.ok(requests.every(u=>u.includes("variant=card")));
 assert.equal(await evaluate("window.__partialFrames"),0);
 await send("Network.setCacheDisabled",{cacheDisabled:false});
 for(let step=13;step<=16;step++){await evaluate("window.__advance("+step*3000+")");await checkPage(step%5);assert.equal(await evaluate(readyImages),true);}
 assert.equal(imageRequests.slice(requestStart).filter(u=>u.includes("/api/media/")).length,15);
 results.push({coldAndWarm:"PASS",transitions:20,decode:"PASS",uniqueRequests:15,partialFrames:0});

 // Actual touch swipe still advances and keeps its original global deadline.
 await send("Emulation.setDeviceMetricsOverride",{width:844,height:390,deviceScaleFactor:1,mobile:true});await send("Emulation.setTouchEmulationEnabled",{enabled:true});
 await navigate(origin+"/?count=4&healthy=1");await settle();
 const point=await evaluate("(()=>{const r=document.querySelector('.showcase-media').getBoundingClientRect();return{x:r.x+r.width*.8,y:r.y+r.height*.5}})()");
 await send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});
 for(let step=1;step<=4;step++)await send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:point.x-step*16,y:point.y}]});
 await send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await checkPage(1);assert.equal(await evaluate("[...window.__clockTimers.values()][0].at"),3000);
 await evaluate("window.__advance(6000)");await checkPage(0);assert.ok((await evaluate("location.href")).startsWith(origin));
 results.push({swipe:"PASS"});

 // SSR has URLs before hydration and no duplicate API. Slow scopes never manufacture demos.
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await navigate(origin+"/?count=3&healthy=1&ssr=1&delay=900&now=0");await settle();
 assert.equal(await evaluate("window.requestScopes.length"),0);
 assert.equal(await evaluate("window.ssrHtml.includes('showcase-initial-loading') && window.ssrHtml.includes('variant=card')"),true);
 assert.equal(await evaluate("window.__partialFrames"),0);
 const loadedHeight=await evaluate("document.querySelector('.city-premium-showcase').getBoundingClientRect().height");
 await evaluate("window.changeLocation('loading-city',3,900)");await delay(80);
 assert.equal(await evaluate("document.querySelectorAll('.showcase-brand-card').length"),0);
 assert.equal(await evaluate("document.querySelectorAll('.showcase-paid-card').length"),0);
 assert.equal(await evaluate("!!document.querySelector('.showcase-initial-loading')"),true);
 await until("document.querySelectorAll('.showcase-paid-card').length===3");await until(imageReady);
 assert.equal(await evaluate("document.querySelector('.city-premium-showcase').getBoundingClientRect().height"),loadedHeight);
 await evaluate("window.changeLocation('empty-city',0,600)");await delay(60);
 assert.equal(await evaluate("document.querySelectorAll('.showcase-brand-card').length"),0);
 await until("document.querySelectorAll('.showcase-brand-card').length===15");await until(imageReady);
 assert.equal((await evaluate(geometry)).demo,2);
 await evaluate("window.changeLocation('fixture-city',3)");await until("document.querySelectorAll('.showcase-paid-card').length===3");await until(imageReady);
 assert.equal(await evaluate("window.requestScopes.includes('fixture-city')"),false);
 results.push({serverSnapshot:"PASS",noDuplicateHydrationRead:"PASS",noTemporaryDemos:"PASS",emptyCity:"PASS",returnToServerScope:"PASS"});
 assert.deepEqual(errors,[]);
 await writeFile(join(out,"browser-result.json"),JSON.stringify({status:"PASS",scenarios:results.length,results,errors,environment:"Chromium, actual components/CSS, fixture data; no physical Safari/PWA"},null,2));
 console.log(JSON.stringify({status:"PASS",scenarios:results.length,errors}));
 await send("Browser.close").catch(()=>{});
}finally{socket?.close();child.kill();server.close();}
