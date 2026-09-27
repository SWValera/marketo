import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {testBrowser} from './helpers/browser.mjs';
let phase='old';
const legacy=await readFile('tests/pwa/legacy-sw.js','utf8');
const retirement=await readFile('public/sw.js','utf8');
const bundle=await build({stdin:{contents:"import {retireLegacyPwa} from './lib/browser/retire-pwa.ts';window.cleanup=()=>retireLegacyPwa(navigator.serviceWorker,caches,location.origin);",resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife'});
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/sw.js'){res.setHeader('Content-Type','application/javascript');res.end(phase==='new'?retirement:legacy+(phase==='waiting'?'\n// waiting fixture revision':''));}
 else if(req.url==='/ordinary/sw.js'){res.setHeader('Content-Type','application/javascript');res.end("self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()))");}
 else if(req.url==='/cleanup.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].contents);}
 else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Retirement fixture</title><input id="draft"><script src="/cleanup.js"></script>');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,b=await testBrowser({output:'artifacts/pwa-removal'});
const results=[];
try{
 await b.send('Page.navigate',{url:origin});await b.until('!!window.cleanup');
 await b.evaluate("navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(()=>true)");
 await b.send('Page.navigate',{url:origin+'/returning'});await b.until('!!navigator.serviceWorker.controller && !!window.cleanup');
 await b.send('Runtime.evaluate',{expression:"window.other=window.open('/form','fixture-form')",userGesture:true});
 await b.until("window.other?.document?.querySelector('#draft')");
 await b.evaluate(`(async()=>{
 localStorage.setItem('sb-synthetic-auth-token','retained fixture session');sessionStorage.setItem('auth-recovery','retained');
 localStorage.setItem('marketo-listing-draft:fixture','retained draft');other.document.querySelector('#draft').value='unsaved form';other.sessionStorage.setItem('chat-draft','unsent');
 window.start=performance.timeOrigin;window.otherStart=other.performance.timeOrigin;
 const db=await new Promise((r,j)=>{const q=indexedDB.open('web-fixture',1);q.onupgradeneeded=()=>q.result.createObjectStore('drafts');q.onsuccess=()=>r(q.result);q.onerror=j});
 await new Promise((r,j)=>{const t=db.transaction('drafts','readwrite');t.objectStore('drafts').put('keep','draft');t.oncomplete=r;t.onerror=j});db.close();
 for(const name of ['jevu-static-v1','marketo-shell-v2','marketo-static-v3','unrelated-web-cache'])await (await caches.open(name)).put('/fixture',new Response('preserve unrelated'));
 await navigator.serviceWorker.register('/ordinary/sw.js');return true;
 })()`);
 phase='waiting';await b.evaluate('navigator.serviceWorker.getRegistration("/").then(r=>r.update()).then(()=>true)');
 await b.until('navigator.serviceWorker.getRegistration("/").then(r=>!!r.waiting)');
 results.push({oldRegistration:'actual published worker',scope:origin+'/',waitingWorker:true,tabs:2});
 phase='new';await b.evaluate('cleanup().then(()=>true)');
 await b.until("navigator.serviceWorker.getRegistrations().then(rs=>rs.every(r=>r.scope!==location.origin+'/'))");
 const saved=await b.evaluate(`(async()=>({
 caches:await caches.keys(),registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.scope).pathname),
 auth:localStorage.getItem('sb-synthetic-auth-token'),recovery:sessionStorage.getItem('auth-recovery'),draft:localStorage.getItem('marketo-listing-draft:fixture'),
 form:other.document.querySelector('#draft').value,chat:other.sessionStorage.getItem('chat-draft'),noReload:performance.timeOrigin===start&&other.performance.timeOrigin===otherStart,
 indexedDB:await new Promise((r,j)=>{const q=indexedDB.open('web-fixture');q.onsuccess=()=>{const db=q.result,x=db.transaction('drafts').objectStore('drafts').get('draft');x.onsuccess=()=>{r(x.result);db.close()};x.onerror=j};q.onerror=j})
 }))()`);
 assert.deepEqual(saved.caches,['unrelated-web-cache']);assert.deepEqual(saved.registrations,['/ordinary/']);
 assert.equal(saved.auth,'retained fixture session');assert.equal(saved.recovery,'retained');assert.equal(saved.draft,'retained draft');assert.equal(saved.form,'unsaved form');assert.equal(saved.chat,'unsent');assert.equal(saved.indexedDB,'keep');assert.equal(saved.noReload,true);
 await b.evaluate('cleanup().then(()=>true)');await b.send('Page.navigate',{url:origin+'/new-opening'});await b.until('!!window.cleanup && location.pathname==="/new-opening"');
 assert.equal(await b.evaluate('navigator.serviceWorker.controller===null'),true);
 results.push({migration:'PASS',afterNewOpening:'controller=null',preservation:saved});
 // Offline update cannot get the retirement script; no reload and unregister is still safe.
 phase='old';await b.evaluate("navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(()=>true)");
 await b.send('Page.navigate',{url:origin+'/offline-case'});await b.until('!!navigator.serviceWorker.controller && !!window.cleanup');
 phase='new';await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await b.evaluate('cleanup().then(()=>true)');
 await b.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await b.send('Page.navigate',{url:origin+'/reconnected'});await b.until('location.pathname==="/reconnected" && !!window.cleanup');
 assert.equal(await b.evaluate('navigator.serviceWorker.controller===null'),true);
 assert.equal(await b.evaluate("localStorage.getItem('marketo-listing-draft:fixture')"),'retained draft');
 results.push({offlineToOnline:'PASS'});
 await writeFile('artifacts/pwa-removal/retirement-browser.json',JSON.stringify({status:'PASS',results},null,2));console.log(JSON.stringify({status:'PASS',scenarios:results.length}));
}finally{await b.close();server.closeAllConnections();server.close();}
