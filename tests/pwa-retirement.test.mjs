import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
import {LEGACY_PWA_CACHES,isLegacyPwaRegistration,retireLegacyPwa} from '../lib/browser/retire-pwa.ts';

const source=await readFile('public/sw.js','utf8');
function workerHarness({blocked=false}={}){
 const handlers={},deleted=[],actions=[];
 const caches={keys:async()=>blocked?new Promise(()=>{}):[...LEGACY_PWA_CACHES,'user-drafts','other-app-v1','jevu-static-v2'],delete:async key=>{deleted.push(key);return true;}};
 const self={addEventListener:(name,callback)=>{handlers[name]=callback;},skipWaiting:async()=>actions.push('skipWaiting'),clients:{claim:async()=>actions.push('claim')},registration:{unregister:async()=>actions.push('unregister')}};
 vm.runInNewContext(source,{self,caches,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,20)),clearTimeout});
 return{handlers,deleted,actions,async run(name){let promise;handlers[name]({waitUntil:p=>{promise=p;}});await promise;}};
}
test('retirement replaces waiting worker, claims open tabs and unregisters without interception',async()=>{
 const h=workerHarness();assert.deepEqual(Object.keys(h.handlers).sort(),['activate','install']);
 await h.run('install');await h.run('activate');
 assert.deepEqual(h.actions,['skipWaiting','claim','unregister']);
 assert.deepEqual(h.deleted,LEGACY_PWA_CACHES);
 await h.run('activate');assert.equal(h.actions.at(-1),'unregister');
 assert.doesNotMatch(source,/respondWith|clients\.matchAll|\.navigate\(|\.openWindow\(/);
});
test('blocked CacheStorage cannot prevent retirement',async()=>{
 const h=workerHarness({blocked:true});await h.run('activate');assert.deepEqual(h.actions,['claim','unregister']);
});
const registration=(script='/sw.js',scope='https://jevu.kz/')=>({scope,active:{scriptURL:new URL(script,'https://jevu.kz').href,state:'activated'},waiting:null,installing:null});
test('cleanup identifies exact old script and root scope, not other workers or origins',()=>{
 assert.equal(isLegacyPwaRegistration(registration(),'https://jevu.kz'),true);
 for(const r of [registration('/ordinary-worker.js'),registration('/sw.js','https://jevu.kz/other/'),registration('https://other.test/sw.js'),{scope:'https://jevu.kz/',active:null,waiting:null,installing:null}])assert.equal(isLegacyPwaRegistration(r,'https://jevu.kz'),false);
});
test('client cleanup is idempotent and preserves sessions, drafts, settings and unrelated caches',async()=>{
 const actions=[],deleted=[];const old={...registration(),update:async()=>actions.push('update'),unregister:async()=>actions.push('unregister')};
 const other={...registration('/chat-worker.js'),update:async()=>assert.fail('unrelated update'),unregister:async()=>assert.fail('unrelated unregister')};
 const storage={keys:async()=>[...LEGACY_PWA_CACHES,'auth','drafts'],delete:async name=>deleted.push(name)};
 const container={getRegistrations:async()=>[old,other]};
 const one=retireLegacyPwa(container,storage,'https://jevu.kz');assert.strictEqual(one,retireLegacyPwa(container,storage,'https://jevu.kz'));await one;
 assert.deepEqual(actions,['update','unregister']);assert.deepEqual(deleted,LEGACY_PWA_CACHES);
 await retireLegacyPwa(undefined,undefined,'https://jevu.kz');
 const code=await readFile('lib/browser/retire-pwa.ts','utf8');assert.doesNotMatch(code,/localStorage|sessionStorage|indexedDB|Clear-Site-Data|\.register\(|\.ready|location\.reload/);
});
test('offline update failure still unregisters only the old worker; optional API failure is contained',async()=>{
 let removed=0;const old={...registration(),update:async()=>{throw Error('offline');},unregister:async()=>removed++};
 await retireLegacyPwa({getRegistrations:async()=>[old]},{keys:async()=>{throw Error('blocked');}},'https://jevu.kz');assert.equal(removed,1);
 await retireLegacyPwa({getRegistrations:async()=>{throw Error('unsupported');}},undefined,'https://jevu.kz');
});
test('new web app and packaged resources have no install/registration entry points',async()=>{
 for(const root of ['app','components','lib'])for(const name of await readdir(root,{recursive:true})){
  if(!/\.(tsx?|js)$/.test(name))continue;
  const text=await readFile(root+'/'+name,'utf8');
  assert.doesNotMatch(text,/serviceWorker\s*\.\s*register\s*\(|beforeinstallprompt|appinstalled|appleWebApp\s*:|manifest\s*:/,root+'/'+name);
 }
 const headers=await readFile('public/_headers','utf8');assert.match(headers,/\/sw\.js[\s\S]*Cache-Control: no-store, no-cache, must-revalidate/);
 for(const path of ['public/manifest.webmanifest','public/offline.html','app/offline/page.tsx'])await assert.rejects(readFile(path),{code:'ENOENT'});
});
