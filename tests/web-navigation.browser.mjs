// Production-build navigation/resource lab; read-only guest paths only.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {testBrowser,delay} from './helpers/browser.mjs';
const base=process.env.JEVU_NAV_BASE??'http://127.0.0.1:4180';
const local=base.startsWith('http://127.0.0.1:');
const listing=local?(await(await fetch(base+'/__fixture/info')).json()).listing:JSON.parse(await readFile('artifacts/pwa-removal/http-before.json','utf8')).listing;
const b=await testBrowser({output:'artifacts/pwa-removal'}),errors=[],requests=[],results=[];
b.on('Runtime.consoleAPICalled',x=>{if(x.type==='error')errors.push(x.args.map(a=>a.value??a.description??'').join(' '));});
b.on('Runtime.exceptionThrown',x=>errors.push(x.exceptionDetails.exception?.description??x.exceptionDetails.text));
b.on('Network.requestWillBeSent',x=>requests.push({path:new URL(x.request.url).pathname,type:x.type,frame:x.frameId}));
try{
 if(local){
  await b.send('Fetch.enable',{patterns:[{urlPattern:'https://*.supabase.co/*'}]});
  b.on('Fetch.requestPaused',async x=>{const r=await fetch(base+'/__fixture/upstream?url='+encodeURIComponent(x.request.url));await b.send('Fetch.fulfillRequest',{requestId:x.requestId,responseCode:r.status,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(await r.arrayBuffer()).toString('base64')});});
 }
 await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await b.send('Page.navigate',{url:base+'/search'});await b.until('!!document.querySelector(".listing-card")');await delay(500);
 const routes=[listing,'/profile','/messages','/search'];
 for(let i=0;i<20;i++){
  const route=routes[i%4];const before=requests.length;const timeOrigin=await b.evaluate('performance.timeOrigin');
  const clicked=await b.evaluate(`(()=>{const a=[...document.querySelectorAll('a[href]')].find(a=>new URL(a.href).pathname===${JSON.stringify(route)});if(!a)return false;a.click();return true})()`);
  assert.equal(clicked,true,'Existing navigation link: '+route);const start=performance.now();
  const marker=route===listing?'document.querySelector(".listing-gallery")':route==='/search'?'document.querySelector(".listing-card")':'document.querySelector("main")?.innerText.includes("Войдите")';
  await b.until(`location.pathname===${JSON.stringify(route)} && (${marker})`);const useful=Math.round(performance.now()-start);
  await delay(150);await b.send('HeapProfiler.collectGarbage');
  const heap=await b.send('Runtime.getHeapUsage'),dom=await b.send('Memory.getDOMCounters');
  results.push({step:i+1,route,useful_ms:useful,requests:requests.length-before,documents:requests.slice(before).filter(r=>r.type==='Document').length,heap_bytes:heap.usedSize,fullReload:timeOrigin!==await b.evaluate('performance.timeOrigin'),...dom});
 }
 // Slow network + CPU, then real offline and reconnect on the same page.
 await b.send('Emulation.setCPUThrottlingRate',{rate:4});
 await b.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:100000});
 await b.send('Page.navigate',{url:base+'/search'});await b.until('!!document.querySelector(".listing-card")',30000);
 await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 const offline=await b.evaluate("fetch('/api/showcase?city=all').then(()=>false,()=>true)");assert.equal(offline,true);
 await b.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await b.send('Emulation.setCPUThrottlingRate',{rate:1});
 assert.equal(await b.evaluate("fetch('/api/showcase?city=all').then(r=>r.ok)"),true);
 // Freeze/resume is a real renderer lifecycle transition, not a clock reset.
 await b.send('Page.setWebLifecycleState',{state:'frozen'});await delay(150);await b.send('Page.setWebLifecycleState',{state:'active'});
 assert.equal(await b.evaluate('!!document.querySelector(".listing-card")'),true);
 assert.deepEqual(errors,[]);
 assert.equal(await b.evaluate("navigator.serviceWorker.controller===null && !document.querySelector('link[rel=manifest]')"),true);
 await writeFile('artifacts/pwa-removal/navigation-'+(local?'local':'production')+'.json',JSON.stringify({environment:{base,auth:'guest',browser:'Chromium desktop/mobile emulation, not physical phone',normal:local?'loopback fixture, no network throttling':'native Mac network',slow:'150ms latency, 200kB/s down, CPU x4'},status:'PASS',results,errors,offlineReconnect:true,freezeResume:true},null,2));
 console.log(JSON.stringify({status:'PASS',clicks:20,errors:errors.length}));
}finally{await b.close();}
