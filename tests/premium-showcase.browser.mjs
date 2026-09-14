import assert from "node:assert/strict";
import {access,mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {spawn} from "node:child_process";
import {createServer,get} from "node:http";
import {build} from "esbuild";
const root=resolve("."),out=resolve("artifacts/jevu-premium-carousel-20260914");
await mkdir(out,{recursive:true});
const candidates=[process.env.JEVU_BROWSER_PATH,"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/chromium"].filter(Boolean);
let browser;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){browser=path;break;}assert.ok(browser,"An installed Chromium is required");
const mocks={
 "@/components/app-link":"export const AppLink=({children,...props})=><a {...props}>{children}</a>;",
 "@/components/category-link":"export const CategoryLink=({children,cityId,...props})=><a {...props}>{children}</a>;",
 "@/components/i18n-provider":"import {translate} from './lib/i18n/messages';export const useI18n=()=>({locale:window.lang,t:(key,values)=>translate(window.lang,key,values)});",
 "@/components/location-picker":"export const useStoredLocation=()=> 'fixture-city';export const LocationPicker=()=>null;",
 "@/components/reference-geography-provider":"const value={data:{regions:[],settlements:[{id:'fixture-city',name:{ru:'Петропавловск',kk:'Петропавл'}}]},ensureLoaded:()=>{}};export const useReferenceGeography=()=>value;",
};
const entry=`
import React from 'react';import{createRoot}from'react-dom/client';import{CityPremiumShowcase}from'./components/city-premium-showcase';
const params=new URLSearchParams(location.search),count=Number(params.get('count')||0);window.lang=params.get('lang')||'ru';window.ready=false;
const shapes=['landscape','portrait','square','missing','broken'];
const placements=Array.from({length:count},(_,i)=>({id:'placement-'+i,listingId:'listing-'+i,slug:'fixture',title:i===0?'Длинное название объявления для проверки переноса текста':'Объявление '+(i+1),priceMinor:1000000,currencyCode:'KZT',locationRu:'Петропавловск',locationKk:'Петропавл',imageUrl:shapes[i%5]==='missing'?null:'/image/'+shapes[i%5]+'.svg',expiresAt:new Date(Date.now()+86400000).toISOString()}));
window.fetch=async()=>{window.ready=true;return new Response(JSON.stringify({capacity:15,placements}),{headers:{'content-type':'application/json'}})};
createRoot(document.getElementById('app')).render(<><main className="page-shell home-showcase-shell"><CityPremiumShowcase/></main><div style={{height:150}}/><nav className="mobile-bottom-nav"><a href="#app">JEVU</a></nav></>);
`;
const bundle=await build({stdin:{contents:entry,loader:"tsx",resolveDir:root},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"showcase-fixture",setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:"fixture"}:null);b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:mocks[a.path],loader:"tsx",resolveDir:root}));}}]});
const css=(await readFile("app/globals.css","utf8")).replace('@import "tailwindcss";',"")+'\n.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }';
const server=createServer((req,res)=>{
 if(req.url.startsWith("/image/")){
  if(req.url.includes("broken")){res.writeHead(404);res.end();return;}
  const [w,h]=req.url.includes("portrait")?[300,900]:req.url.includes("square")?[600,600]:[1200,600];
  res.setHeader("Content-Type","image/svg+xml");
  setTimeout(()=>res.end('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#72abc7"/><rect width="'+w/2+'" height="'+h/2+'" fill="#edb660"/><circle cx="'+w/2+'" cy="'+h/2+'" r="'+Math.min(w,h)/4+'" fill="#154e66"/></svg>'),160);return;
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
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map(),errors=[],results=[];
 socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);clearTimeout(p?.timer);if(x.error)p?.reject(Error(JSON.stringify(x.error)));else p?.resolve(x.result);}else if(x.method==="Runtime.exceptionThrown")errors.push(x.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id,timer=setTimeout(()=>{pending.delete(next);reject(Error("CDP timeout: "+method));},30000);pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(30);}assert.fail(expression);};
 await send("Page.enable");await send("Runtime.enable");
 await send("Page.addScriptToEvaluateOnNewDocument",{source:`window.imageFrames=[];const loop=()=>{if(window.ready && document.querySelector('.showcase-status')){const cards=[...document.querySelectorAll('.showcase-card')];if(cards.length)window.imageFrames.push(cards.map(c=>[c.getBoundingClientRect().width,c.getBoundingClientRect().height]));}requestAnimationFrame(loop)};requestAnimationFrame(loop);`});
 const geometry=`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}};const cards=[...document.querySelectorAll('.showcase-card')];return {scrollWidth:document.documentElement.scrollWidth,columns:getComputedStyle(document.querySelector('.showcase-grid')).gridTemplateColumns.split(' ').length,real:cards.filter(c=>c.classList.contains('showcase-paid-card')).length,demo:cards.filter(c=>c.classList.contains('showcase-brand-card')).length,links:cards.filter(c=>c.classList.contains('showcase-paid-card')).map(c=>c.getAttribute('href')),counter:document.querySelector('.showcase-status')?.textContent,cards:cards.map(c=>({box:rect(c),media:c.querySelector('.showcase-media')?rect(c.querySelector('.showcase-media')):null,image:c.querySelector('img')&&getComputedStyle(c.querySelector('img')).display!=='none'?{...rect(c.querySelector('img')),fit:getComputedStyle(c.querySelector('img')).objectFit}:null,copy:rect(c.querySelector('.showcase-card-copy')),overflow:c.scrollWidth>c.clientWidth}))}})()`;
 const assertGeometry=(g,width,columns)=>{assert.ok(g.scrollWidth<=width, "No horizontal overflow");assert.equal(g.columns,columns);for(const c of g.cards){assert.ok(!c.overflow);assert.ok(c.copy.bottom<=c.box.bottom+1);if(c.media){assert.ok(Math.abs(c.media.w/c.media.h-4/3)<.02);if(c.image){assert.equal(c.image.fit,"cover");assert.ok(Math.abs(c.image.w-c.media.w)<1);assert.ok(Math.abs(c.image.h-c.media.h)<1);assert.ok(Math.abs(c.image.y-c.media.y)<1);}}}};

 const counts=[0,1,2,3,4,5,15],demo=[2,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1];
 for(const [width,height,mobile] of [[375,812,true],[390,844,true],[430,932,true],[768,1024,false],[1280,900,false]]){
  await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile});
  await send("Emulation.setTouchEmulationEnabled",{enabled:mobile});
  for(const count of counts){
   await send("Page.navigate",{url:origin+"/?count="+count});await until("window.ready && !!document.querySelector('.showcase-status')");await delay(300);
   const collapsed=await evaluate(geometry),pageCount=(count+demo[count])/2;
   assertGeometry(collapsed,width,2);assert.equal(collapsed.cards.length,2);assert.equal(collapsed.real,Math.min(count,2));assert.equal(collapsed.demo,Math.max(0,2-count));
   assert.ok(collapsed.counter.includes(String(count))&&collapsed.counter.includes("15"));
   const frames=await evaluate("window.imageFrames");
   for(const frame of frames)assert.deepEqual(frame,frames.at(-1),"Image loading cannot change card geometry");
   assert.equal(await evaluate("document.querySelectorAll('.showcase-dots button').length"),pageCount>1?pageCount:0);
   const seen=[];
   for(let pageIndex=0;pageIndex<pageCount;pageIndex++){
     await delay(180);const current=await evaluate(geometry);
     assertGeometry(current,width,2);assert.equal(current.cards.length,2);
     assert.equal(current.demo,pageIndex===pageCount-1?demo[count]:0);
     assert.deepEqual(current.cards.map(c=>c.box.h),collapsed.cards.map(c=>c.box.h),"No height jump between pairs");
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
     await evaluate("document.querySelector('.showcase-dots button').click()");
     await until("document.querySelector('.showcase-dots button').getAttribute('aria-current')==='true'");
   }
   if(count===3&&[390,430,1280].includes(width)){
     const shot=await send("Page.captureScreenshot",{format:"png"});await writeFile(join(out,"carousel-"+width+".png"),Buffer.from(shot.data,"base64"));
   }
   await evaluate("window.firstCard=document.querySelector('.showcase-paid-card');document.querySelector('.showcase-view-all').click()");
   await until("document.querySelector('.showcase-view-all').getAttribute('aria-expanded')==='true'");await delay(220);
   const expanded=await evaluate(geometry);assertGeometry(expanded,width,width<=640?2:width>=1024?4:3);assert.equal(expanded.real,count);assert.equal(expanded.demo,demo[count]);
   assert.deepEqual(expanded.links,Array.from({length:count},(_,i)=>"/listing/listing-"+i+"-fixture"));
   assert.equal(await evaluate("document.querySelectorAll('.showcase-arrow,.showcase-dots').length"),0);
   if(count>0)assert.equal(await evaluate("window.firstCard===document.querySelector('.showcase-paid-card')"),true);
   await evaluate("window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})");await delay(230);
   if(mobile)assert.equal(await evaluate("document.querySelector('.showcase-card:last-child').getBoundingClientRect().bottom<=document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top"),true);
   if(count>=5)assert.equal(await evaluate("[...document.querySelectorAll('.showcase-media img')].filter(i=>i.src.includes('/broken')).every(i=>getComputedStyle(i).display==='none')"),true);
   await evaluate("document.querySelector('.showcase-view-all').click()");await until("document.querySelector('.showcase-view-all').getAttribute('aria-expanded')==='false'");
   const restored=await evaluate(geometry);assert.equal(restored.cards.length,2);assert.deepEqual(restored.links,collapsed.links);
   results.push({width,count,pages:pageCount,collapsed:"PASS",arrowsDotsKeyboard:"PASS",swipe:count===3&&mobile?"PASS":"not run",expanded:"PASS",restored:"PASS",images:"PASS"});
  }
  console.log(JSON.stringify({width,status:"PASS"}));
 }
 await send("Page.navigate",{url:origin+"/?count=3&lang=kk"});await until("window.ready && !!document.querySelector('.showcase-status')");
 assert.equal(await evaluate("document.querySelectorAll('.showcase-card').length"),2);
 await evaluate("document.querySelector('.showcase-arrow-next').click()");
 await until("document.querySelectorAll('.showcase-brand-card').length===1");
 assert.deepEqual(errors,[]);
 await writeFile(join(out,"browser-result.json"),JSON.stringify({status:"PASS",environment:"Installed Chromium; actual showcase/CSS with fixture data/images; not physical Safari/PWA",scenarios:results.length+1,results,errors},null,2));
 console.log(JSON.stringify({status:"PASS",scenarios:results.length+1,errors}));
 await send("Browser.close").catch(()=>{});
}finally{socket?.close();child.kill();server.close();}
