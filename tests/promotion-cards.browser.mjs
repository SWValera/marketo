import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer,get} from 'node:http';
import {build} from 'esbuild';

const root=resolve('.'),out=resolve('artifacts/jevu-promotion-cards');await mkdir(out,{recursive:true});
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#506358"/><circle cx="400" cy="200" r="150" fill="#e7dfcf"/></svg>');
const mocks={
 'next/navigation':`export const useRouter=()=>({push:()=>{},refresh:()=>{},prefetch:()=>{}});export const usePathname=()=>'/';`,
 '@/components/app-link':`export const AppLink=({children,...props})=><a {...props}>{children}</a>;`,
 '@/components/i18n-provider':`export const useI18n=()=>({t:k=>k,locale:'ru'});`,
 '@/components/favorite-store':`const store={ids:new Set(),ready:true};export const readFavoriteStore=()=>store;export const readServerFavoriteStore=()=>store;export const subscribeFavoriteStore=()=>()=>{};export const loadFavoriteStore=async()=>{};export const toggleFavoriteListing=async()=>'added';`
};
const base={slug:'fixture',title:'Тойота Камри 2020 года',priceLabel:'10 000 000 ₸',priceAmount:10000000,locationLabel:'Петропавловск',publishedLabel:'20 сентября 2026',imageUrl:image,categorySlug:'transport',cityId:'fixture',promoted:false};
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{ListingCard}from'./components/listing-card';const base=${JSON.stringify(base)};const end=new Date(Date.now()+(location.search.includes('expire')?1800:86400000)).toISOString();const items=[{...base,id:'normal',title:'Планшет m5'},{...base,id:'vip',vipUntil:end},{...base,id:'x2',x2Until:end},{...base,id:'vip-x2',vipUntil:end,x2Until:end}];createRoot(document.getElementById('app')).render(<main className='page-shell'><div className='listing-grid'>{items.map(x=><ListingCard key={x.id} listing={x}/>)}</div></main>);`;
const app=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'fixture'}:null);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));}}]});
const css=(await readFile('app/globals.css','utf8')).replace('@import "tailwindcss";','');
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(app.outputFiles[0].contents);}else if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="app"></div><script src="/app.js"></script></body></html>');}});
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
 await send('Page.enable');await send('Runtime.enable');
 for(const [width,height] of [[390,844],[430,932],[844,390],[768,1024],[1180,820],[1366,768]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});await send('Page.navigate',{url:origin});await until("document.querySelectorAll('.listing-card').length===4");
  const geometry=await evaluate(`(()=>{const grid=document.querySelector('.listing-grid'),g=getComputedStyle(grid),columns=g.gridTemplateColumns.split(' ').map(parseFloat),gap=parseFloat(g.columnGap),cards=[...grid.children].map(c=>{const b=c.getBoundingClientRect(),media=c.querySelector('.listing-image-wrap').getBoundingClientRect(),s=getComputedStyle(c);return {width:b.width,height:b.height,span:s.gridColumnStart,border:parseFloat(s.borderTopWidth),borderColor:s.borderTopColor,body:getComputedStyle(c.querySelector('.listing-body')).backgroundColor,badge:!!c.querySelector('.listing-vip-badge'),imageFit:getComputedStyle(c.querySelector('img')).objectFit,ratio:media.width/media.height};});return {columns,gap,cards,overflow:document.documentElement.scrollWidth>innerWidth};})()`);
  const [normal,vip,x2,both]=geometry.cards;assert.equal(geometry.overflow,false);assert.ok(Math.abs(normal.width-vip.width)<1);assert.ok(Math.abs(normal.height-vip.height)<=2);
  assert.equal(vip.body,'rgb(255, 255, 255)');assert.equal(vip.border,normal.border*2);assert.equal(both.border,normal.border*2);assert.equal(vip.borderColor,'rgb(216, 183, 88)');assert.equal(both.body,vip.body);assert.equal(normal.body,'rgb(255, 255, 255)');assert.equal(x2.body,normal.body);assert.equal(vip.badge,true);assert.equal(both.badge,true);assert.equal(normal.badge,false);
  for(const card of [x2,both]){assert.equal(card.span,'span 2');assert.ok(Math.abs(card.width-(geometry.columns[0]+geometry.columns[1]+geometry.gap))<1);assert.ok(Math.abs(card.ratio-2)<.02);assert.equal(card.imageFit,'cover');}
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(out,width+'.png'),Buffer.from(shot.data,'base64'));report.push({width,height,geometry});
 }
 await send('Page.navigate',{url:origin+'/?expire'});await until("document.querySelectorAll('.listing-card-vip').length===2");await until("document.querySelectorAll('.listing-card-vip,.listing-card-x2').length===0");assert.equal(await evaluate("document.querySelectorAll('.listing-card').length"),4);assert.equal(await evaluate("[...document.querySelectorAll('.listing-card')].every(c=>getComputedStyle(c).borderTopWidth==='1px'&&getComputedStyle(c).borderTopColor!=='rgb(216, 183, 88)'&&getComputedStyle(c.querySelector('.listing-body')).backgroundColor==='rgb(255, 255, 255)'&&!c.querySelector('.listing-vip-badge'))"),true);
 assert.deepEqual(errors,[]);await writeFile(join(out,'result.json'),JSON.stringify({status:'PASS',report,expiry:'PASS',errors},null,2));console.log(JSON.stringify({status:'PASS',viewports:report.length,expiry:'PASS',errors}));await send('Browser.close').catch(()=>{});
}finally{socket?.close();child.kill();server.close();}
