import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer,get} from 'node:http';
import {build} from 'esbuild';

const root=resolve('.'),out=resolve('artifacts/jevu-catalog-freshness');await mkdir(out,{recursive:true});
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#506358"/><circle cx="400" cy="200" r="150" fill="#e7dfcf"/></svg>');
const mocks={
 'next/navigation':`export const useRouter=()=>({push:()=>{},replace:()=>{},refresh:()=>{},prefetch:()=>{}});export const usePathname=()=>'/search';`,
 '@/components/app-link':`export const AppLink=({children,...props})=><a {...props}>{children}</a>;`,
 '@/components/i18n-provider':`export const useI18n=()=>({t:k=>k,locale:'ru'});`,
 '@/components/favorite-store':`const store={ids:new Set(),ready:true};export const readFavoriteStore=()=>store;export const readServerFavoriteStore=()=>store;export const subscribeFavoriteStore=()=>()=>{};export const loadFavoriteStore=async()=>{};export const toggleFavoriteListing=async()=>'added';`,
 '@/components/page-header':`export const PageHeader=()=>null;`,
 '@/components/navigation-feedback':`export const announceNavigation=()=>{};`,
 '@/components/category-cascade':`export const CategoryCascade=()=>null;`,
 '@/components/location-picker':`export const LocationPicker=()=>null;export const useStoredLocation=()=>'all';`,
 '@/components/reference-geography-provider':`const state={data:{countries:[],regions:[],settlements:[]},ensureLoaded:()=>{}};export const useReferenceGeography=()=>state;`,
 '@/components/use-category-attributes':`export const useCategoryAttributes=()=>({data:{attributes:[]},status:'ready'});`,
 '@/lib/reference-data/browser':`export const loadBrowserCategoryReferences=async()=>({status:'unconfigured',data:{categories:[]}});`,
};
const base={slug:'fixture',priceLabel:'100 ₸',priceAmount:100,locationLabel:'Петропавловск',publishedLabel:'Сегодня',imageUrl:image,categorySlug:'transport',cityId:'fixture',promoted:false};
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{CatalogClient}from'./components/catalog-client';const base=${JSON.stringify(base)};const root=createRoot(document.getElementById('app'));let sequence=0;window.renderCatalog=(ids,sort='new')=>root.render(<CatalogClient key={++sequence} initialCityId='all' initialSort={sort} initialListings={ids.map(id=>({...base,id,slug:id,title:id,promoted:id==='A',priceAmount:{A:300,B:100,C:200,D:null}[id],vipUntil:id==='A'?'2099-01-01':null,x2Until:id==='A'?'2099-01-01':null}))}/>);window.renderCatalog(['A']);`;
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
 for(const [width,height] of [[390,844],[1366,768]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});await send('Page.navigate',{url:origin});
  await until("document.querySelectorAll('.catalog-grid .listing-card').length===1");
  const order="[...document.querySelectorAll('.catalog-grid .listing-title')].map(x=>x.textContent)";
  for(const [ids,sort,expected] of [
   [['A'],'new',['A']],
   [['B','A'],'new',['B','A']],
   [['C','B','A'],'new',['C','B','A']],
   [['A','C','B'],'new',['A','C','B']],
   [['D','A','C','B'],'new',['D','A','C','B']],
   [['D','A','C','B'],'cheap',['B','C','A','D']],
   [['D','A','C','B'],'expensive',['A','C','B','D']],
  ]){
   await evaluate('window.renderCatalog('+JSON.stringify(ids)+','+JSON.stringify(sort)+')');
   await until('JSON.stringify('+order+')==='+JSON.stringify(JSON.stringify(expected)));
   assert.deepEqual(await evaluate(order),expected);report.push({width,sort,expected});
  }
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'result.json'),JSON.stringify({status:'PASS',report,errors},null,2));console.log(JSON.stringify({status:'PASS',scenarios:report.length,errors}));await send('Browser.close').catch(()=>{});
}finally{socket?.close();child.kill();server.close();}
