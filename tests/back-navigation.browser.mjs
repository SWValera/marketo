import assert from 'node:assert/strict';
import {access,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer,get} from 'node:http';
import {build} from 'esbuild';
const root=resolve('.'),out=resolve(process.env.JEVU_NAV_OUTPUT||'artifacts/jevu-listing-refinement-20260912');await mkdir(out,{recursive:true});
const candidates=[process.env.JEVU_BROWSER_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].filter(Boolean);
let browser;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){browser=path;break;}assert.ok(browser,'An installed Chromium is required');
const mocks={
 'next/navigation':`import {useSyncExternalStore} from 'react';const subscribe=fn=>{addEventListener('popstate',fn);addEventListener('fixture-route',fn);return()=>{removeEventListener('popstate',fn);removeEventListener('fixture-route',fn)}};const useHref=()=>useSyncExternalStore(subscribe,()=>location.href,()=>location.href);export const usePathname=()=>new URL(useHref()).pathname;export const useSearchParams=()=>new URL(useHref()).searchParams;export const useRouter=()=>({push:p=>{history.pushState({__vinext_previousNextUrl:location.pathname+location.search},'',p);dispatchEvent(new Event('fixture-route'))},replace:p=>{history.replaceState(null,'',p);dispatchEvent(new Event('fixture-route'))},back:()=>history.back()});`,
 '@/components/i18n-provider':`export const useI18n=()=>({t:()=> 'Назад'});`
};
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {NavigationHistory} from './components/navigation-history';import {BackButton} from './components/back-button';import {usePathname,useRouter} from 'next/navigation';function App(){const path=usePathname(),router=useRouter();return <><NavigationHistory/><p id="route">{path}</p>{path.startsWith('/listing/')?<><BackButton fallback="/category/cars"/><BackButton fallback="/" label="Custom" onBack={()=>window.customBack=true}/></>:<a id="open" href="/listing/car" onClick={e=>{e.preventDefault();router.push('/listing/car')}}>Открыть объявление</a>}</>}createRoot(document.getElementById('app')).render(<App/>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'router-test-boundary',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));}}]});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':'text/html');res.end(req.url==='/test.js'?bundle.outputFiles[0].contents:'<!doctype html><div id="app"></div><script src="/test.js"></script>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(out,'navigation-browser-')),child=spawn(browser,['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));const json=url=>new Promise((r,j)=>get(url,res=>{let s='';res.on('data',x=>s+=x);res.on('end',()=>r(JSON.parse(s)));}).on('error',j));let socket;
try{
 let port;for(let i=0;i<100&&!port;i++){port=await readFile(join(profile,'DevToolsActivePort'),'utf8').then(x=>+x.split('\n')[0],()=>0);if(!port)await delay(100);}assert.ok(port);
 const page=(await json('http://127.0.0.1:'+port+'/json/list')).find(p=>p.type==='page');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});let id=0;const pending=new Map(),errors=[],results=[];
 socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);x.error?p?.reject(Error(JSON.stringify(x.error))):p?.resolve(x.result);}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(30);}assert.fail(expression);};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(sessionStorage.getItem('test:legacy')==='1')Object.defineProperty(window,'navigation',{value:undefined,configurable:true})`});
 const sources=['/','/category/cars?sort=price','/search?q=camry&page=3#results','/#recommended','/favorites','/seller/example'];
 for(const legacy of [false,true])for(const source of sources){
  await send('Page.navigate',{url:origin+'/test-start'});await until(`!!document.querySelector('#open')`);await evaluate(`sessionStorage.clear();sessionStorage.setItem('test:legacy',${JSON.stringify(legacy?'1':'0')})`);
  await send('Page.navigate',{url:origin+source});await until(`!!document.querySelector('#open')&&sessionStorage.getItem('marketo:current-route')===${JSON.stringify(source)}`);
  await evaluate(`document.querySelector('#open').click()`);await until(`!!document.querySelector('.back-button')&&sessionStorage.getItem('marketo:previous-route')===${JSON.stringify(source)}`);
  await evaluate(`document.querySelector('[aria-label="Custom"]').click()`);assert.equal(await evaluate('window.customBack'),true);assert.equal(await evaluate('location.pathname'),'/listing/car');
  if(source.startsWith('/search')){await send('Page.reload');await until(`!!document.querySelector('.back-button')`);assert.equal(await evaluate(`sessionStorage.getItem('marketo:previous-route')`),source);}
  await evaluate(`document.querySelector('.back-button').click()`);await until(`location.pathname+location.search+location.hash===${JSON.stringify(source)}&&!!document.querySelector('#open')`);
  results.push({source,navigationAPI:!legacy,reload:source.startsWith('/search'),result:'PASS'});
 }
 // No storage and no source must still produce a safe fallback without a crash.
 await send('Page.navigate',{url:origin+'/listing/direct'});await until(`!!document.querySelector('.back-button')`);await evaluate(`Object.defineProperty(window,'sessionStorage',{get(){throw Error('blocked')},configurable:true});Object.defineProperty(window,'navigation',{value:undefined,configurable:true});history.replaceState(null,'',location.href);Object.defineProperty(document,'referrer',{value:''});document.querySelector('.back-button').click()`);await until(`location.pathname==='/category/cars'`);
 assert.deepEqual(errors,[]);await writeFile(join(out,'back-browser-results.json'),JSON.stringify({environment:'local Chromium with real browser history, actual BackButton and NavigationHistory; router boundary shim',results,storageBlocked:'PASS',customOnBack:'PASS',errors},null,2));console.log(JSON.stringify({status:'PASS',scenarios:results.length,reloadWithNativeAndLegacy:true,storageBlocked:true,customOnBack:true}));await send('Browser.close').catch(()=>{});
}finally{socket?.close();child.kill();server.close();}
