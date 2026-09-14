import assert from 'node:assert/strict';
import {access,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer,get} from 'node:http';
import {build} from 'esbuild';
const root=resolve('.'),out=resolve(process.env.JEVU_PROMOTION_OUTPUT||'artifacts/jevu-city-premium-20260913');await mkdir(out,{recursive:true});
const candidates=[process.env.JEVU_BROWSER_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].filter(Boolean);
let browser;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){browser=path;break;}assert.ok(browser,'An installed Chromium is required');

const mocks={
 'lucide-react':`export {default as Star} from './node_modules/lucide-react/dist/esm/icons/star.mjs';`,
 '@/components/i18n-provider':`import {translate} from './lib/i18n/messages';export const useI18n=()=>({t:(key,values)=>translate(window.lang,key,values),locale:window.lang});`,
 '@/lib/supabase/browser':`export const getSupabaseBrowserClient=()=>window.client;`
};
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{CityPremiumOffer}from'./components/city-premium-offer';
const params=new URLSearchParams(location.search);window.lang=params.get('lang')||'ru';const mode=params.get('mode');window.calls=[];
window.offer={listing_active:!['pending','pending_full'].includes(mode),listing_pending:['pending','pending_full'].includes(mode),placement:mode==='legacy_pending'?{id:'legacy',status:'pending_approval',ends_at:null,price_amount:0,currency:'KZT'}:mode==='approval_full'?{id:'declined',status:'cancelled',failure_reason:'capacity_full',ends_at:null,price_amount:0,currency:'KZT'}:mode==='expired'?{id:'previous',status:'expired',ends_at:new Date(Date.now()-1).toISOString(),price_amount:0,currency:'KZT'}:null,product:{enabled:true,duration_seconds:604800,capacity:15,available:['full','pending_full','approval_full'].includes(mode)?0:15,price_amount:mode==='paid'?1000:0,currency:'KZT',city_ru:'City',city_kk:'City'}};
window.client={rpc:(name,args)=>({abortSignal:async()=>{window.calls.push({name,args});
 if(name==='connect_city_premium'){
  if(['error','no_slots'].includes(mode))return {data:{status:'NO_SLOTS'},error:null,status:200};
  if(mode==='ineligible')return {data:{status:'LISTING_NOT_ELIGIBLE',reason:'listing_expired'},error:null,status:200};
  if(mode==='technical')return {data:null,error:{code:'XX000',message:'fixture technical failure'},status:500};
  window.offer={...window.offer,placement:{id:'active',status:mode==='pending'?'pending_approval':'active',ends_at:mode==='pending'?null:new Date(Date.now()+604800000).toISOString(),price_amount:0,currency:'KZT'}};
  return {data:{status:mode==='pending'?'PENDING_APPROVAL':mode==='already_active'?'ALREADY_ACTIVE':'ACTIVE',placement_id:'active'},error:null,status:200};
 }
 return {data:structuredClone(window.offer),error:null,status:200};
}})};

createRoot(document.getElementById('app')).render(<main style={{padding:16,maxWidth:640,margin:'auto'}}><p id="ordinary-listing">Ordinary listing preserved</p><CityPremiumOffer listingId="10000000-0000-4000-8000-000000000001"/></main>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'promotion-transport-fixture',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));}}]});
const css=(await readFile('app/globals.css','utf8')).replace('@import "tailwindcss";','');
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':req.url==='/test.css'?'text/css':'text/html');res.end(req.url==='/test.js'?bundle.outputFiles[0].contents:req.url==='/test.css'?css:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/test.css"><div id="app"></div><script src="/test.js"></script>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(out,'promotion-browser-')),child=spawn(browser,['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));const json=url=>new Promise((r,j)=>get(url,res=>{let s='';res.on('data',x=>s+=x);res.on('end',()=>r(JSON.parse(s)));}).on('error',j));let socket;
try{
 let port;for(let i=0;i<100&&!port;i++){port=await readFile(join(profile,'DevToolsActivePort'),'utf8').then(x=>+x.split('\n')[0],()=>0);if(!port)await delay(100);}assert.ok(port);
 const page=(await json('http://127.0.0.1:'+port+'/json/list')).find(p=>p.type==='page');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});let id=0;const pending=new Map(),errors=[],results=[];
 socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);clearTimeout(p?.timer);if(x.error)p?.reject(Error(JSON.stringify(x.error)));else p?.resolve(x.result);}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;const timer=setTimeout(()=>{pending.delete(next);reject(Error('CDP timeout: '+method))},30000);pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(30);}assert.fail(expression);};
 await send('Page.enable');await send('Runtime.enable');
 


 for(const [width,height,mobile] of [[390,844,true],[430,932,true],[1280,900,false]]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
   for(const lang of ['ru','kk']) for(const mode of (process.env.JEVU_PROMOTION_MODES?.split(',')||['available','full','pending','pending_full','approval_full','expired','paid','no_slots','already_active','ineligible','legacy_pending','technical'])) {
     await send('Page.navigate',{url:origin+'/?lang='+lang+'&mode='+mode});
     await until(`!!document.querySelector('.city-premium-offer dl')`);
     const geometry=await evaluate(`({width:document.documentElement.scrollWidth,button:document.querySelector('.city-premium-offer .primary-control').getBoundingClientRect().height,disabled:document.querySelector('.primary-control').disabled})`);
     assert.equal(geometry.width,width);assert.ok(geometry.button>=44);
     assert.equal(geometry.disabled,['full','pending_full','approval_full','paid'].includes(mode));
     if(!geometry.disabled) {
       await evaluate(`document.querySelector('.primary-control').click()`);
       const expected = mode==='technical' ? '[role=alert]' : ['error','no_slots'].includes(mode) ? '[data-promotion-result=NO_SLOTS]'
         : mode==='ineligible' ? '[data-promotion-result=LISTING_NOT_ELIGIBLE]' : mode==='pending' ? '.promotion-pending' : '.promotion-active';
       await until("!!document.querySelector("+JSON.stringify(expected)+")");
       if(mode!=='technical') {
         assert.equal(await evaluate("!!document.querySelector('[role=alert]') || !!document.querySelector('.city-premium-offer .secondary-button')"),false);
       }
       if(mode==='already_active') await until("!!document.querySelector('[data-promotion-result=ALREADY_ACTIVE]')");

       assert.equal(await evaluate(`document.querySelector('#ordinary-listing').textContent`),'Ordinary listing preserved');
       assert.equal(await evaluate(`window.calls.filter(c=>c.name==='connect_city_premium').length`),1);
     }
     if(mode==='pending') {
       assert.equal(await evaluate("!!document.querySelector('[role=alert]') || !!document.querySelector('.city-premium-offer .secondary-button')"),false,'Selection has no error or Retry');
       assert.equal(await evaluate("window.offer.placement.ends_at"),null);
       assert.equal(await evaluate("!!document.querySelector('.primary-control')"),false,'Pending state cannot submit twice');
       await evaluate("window.offer={...window.offer,listing_active:true,listing_pending:false,placement:{...window.offer.placement,status:'active',ends_at:new Date(Date.now()+604800000).toISOString()}};window.dispatchEvent(new Event('focus'))");
       await until("!!document.querySelector('.promotion-active')");
     }
     if(mode==='approval_full') {
       assert.equal(await evaluate("!!document.querySelector('[role=alert]')"),false,'Full at approval is a stored outcome, not a request error');
       assert.equal(await evaluate("!!document.querySelector('.city-premium-offer p[role=status]')"),true);
     }
     if(lang==='ru'&&mode==='available'){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'premium-'+width+'.png'),Buffer.from(shot.data,'base64'));}
     results.push({width,lang,mode,status:'PASS'});
   }
 }
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'browser-result.json'),JSON.stringify({status:'PASS',environment:'Chromium; actual offer component and RPC adapter with transport fixtures; no production records',scenarios:results.length,results,errors},null,2));
 console.log(JSON.stringify({status:'PASS',scenarios:results.length,errors}));
 await send('Browser.close').catch(()=>{});
}finally{socket?.close();child.kill();server.close();}
