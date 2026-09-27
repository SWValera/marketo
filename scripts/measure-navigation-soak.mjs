// Read-only guest navigation in an isolated browser; no account/session reuse.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {testBrowser,delay} from '../tests/helpers/browser.mjs';
const phase=process.argv[2]??'before',base=process.env.JEVU_NAV_BASE??'https://jevu.kz';
assert.match(phase,/^[a-z-]+$/);
const output='artifacts/performance-followup';await mkdir(output,{recursive:true});
const listing=process.env.JEVU_PERF_LISTING_PATH??JSON.parse(await readFile('artifacts/pwa-removal/http-before.json','utf8')).listing;
assert.ok(listing.startsWith('/listing/')&&!/["'<>\\]/.test(listing),'A public listing path is required');
const b=await testBrowser({output}),errors=[],pending=new Set(),sockets=new Set(),steps=[],checkpoints=[];
b.on('Runtime.exceptionThrown',x=>errors.push(x.exceptionDetails.text));
b.on('Runtime.consoleAPICalled',x=>{if(x.type==='error')errors.push('console.error');});
b.on('Network.requestWillBeSent',x=>pending.add(x.requestId));
b.on('Network.loadingFinished',x=>pending.delete(x.requestId));
b.on('Network.loadingFailed',x=>pending.delete(x.requestId));
b.on('Network.webSocketCreated',x=>sockets.add(x.requestId));
b.on('Network.webSocketClosed',x=>sockets.delete(x.requestId));
try{
 await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await b.send('Page.navigate',{url:base+'/search'});await b.until('!!document.querySelector(".listing-card")');await delay(1000);
 const timeOrigin=await b.evaluate('performance.timeOrigin');
 for(let i=0;i<80;i++){
  const route=[listing,'/profile','/messages','/search'][i%4];
  const start=performance.now();
  assert.equal(await b.evaluate(`(()=>{const a=[...document.querySelectorAll('a[href]')].find(a=>new URL(a.href).pathname===${JSON.stringify(route)});if(!a)return false;a.click();return true})()`),true);
  const marker=route===listing?'!!document.querySelector(".listing-gallery")':route==='/search'?'!!document.querySelector(".listing-card")':'document.querySelector("main")?.innerText.includes("Войдите")';
  await b.until(`location.pathname===${JSON.stringify(route)} && (${marker})`);
  const useful_ms=performance.now()-start;let photo_ms=null;
  if(route===listing){await b.until(`[...document.querySelectorAll('.listing-gallery img')].some(img=>img.complete&&img.naturalWidth&&img.getBoundingClientRect().width>0)`);photo_ms=performance.now()-start;}
  steps.push({step:i+1,route:route===listing?'listing':route.slice(1),useful_ms,photo_ms});
  await delay(180);
  if((i+1)%16===0){
   await delay(800);await b.send('HeapProfiler.collectGarbage');await delay(100);
   const heap=await b.send('Runtime.getHeapUsage'),dom=await b.send('Memory.getDOMCounters');
   const cache=await b.evaluate('({history:history.length,resources:performance.getEntriesByType("resource").length,prefetch:window.__VINEXT_RSC_PREFETCH_CACHE__?.size??0,prefetched:window.__VINEXT_RSC_PREFETCHED_URLS__?.size??0})');
   const checkpoint={step:i+1,heap_bytes:heap.usedSize,...dom,...cache,pending_requests:pending.size,websockets:sockets.size};checkpoints.push(checkpoint);console.log(JSON.stringify(checkpoint));
   assert.equal(await b.evaluate('performance.timeOrigin'),timeOrigin,'Unexpected full document navigation');
   if(process.env.JEVU_HEAP_SNAPSHOTS==='1'&&[16,80].includes(i+1)){
    const chunks=[];const off=b.on('HeapProfiler.addHeapSnapshotChunk',x=>chunks.push(x.chunk));
    try{await b.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});}finally{off();}
    await writeFile(`${output}/heap-${phase}-${i+1}.heapsnapshot`,chunks.join(''));
   }
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/navigation-soak-${phase}.json`,JSON.stringify({conditions:'Production Chromium guest, mobile viewport 390x844 DPR1, native network; first 16 clicks warm up. 80 actual anchor clicks. GC only in test browser at checkpoints, same search route. NOT authenticated chat/profile.',steps,checkpoints,errors},null,2));
}finally{await b.close();}
