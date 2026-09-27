// Additional BEFORE/AFTER measurements absent from the preceding release report.
import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {testBrowser,delay} from './helpers/browser.mjs';
const phase=process.env.PHASE??'after',base='http://127.0.0.1:4188',b=await testBrowser({output:'artifacts/moderation-correctness'}),timings={},errors=[];let docs=0;
b.on('Network.requestWillBeSent',e=>{if(e.type==='Document')docs++;});b.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.text));
async function click(selector,ready){const start=performance.now();await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await b.until(ready);return Math.round(performance.now()-start);}
try{
 await b.send('Fetch.enable',{patterns:[{urlPattern:'https://*.supabase.co/*'}]});b.on('Fetch.requestPaused',async x=>{const r=await fetch(base+'/__fixture/upstream?url='+encodeURIComponent(x.request.url));await b.send('Fetch.fulfillRequest',{requestId:x.requestId,responseCode:r.status,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(await r.arrayBuffer()).toString('base64')});});
 await b.send('Page.navigate',{url:base+'/admin'});await b.until('!!document.querySelector(".moderation-row")');await delay(150);
 await click('.moderation-actions a','!!document.querySelector(".moderation-case")');
 timings.return_ms=await click('.moderation-workspace > a[href^="/admin"]','!!document.querySelector(".moderation-row")');
 await click('.moderation-actions a','!!document.querySelector(".moderation-case")');
 await click('.moderator-action-approve','!!document.querySelector(".moderation-action-form")');
 timings.action_ms=await click('.moderation-action-form button[type=submit]','document.querySelector(".moderation-current-status")?.textContent==="Опубликовано"');
 const origin=await b.evaluate('performance.timeOrigin');await fetch(base+'/__fixture/reset');
 timings.profile_ms=await click('a[href="/profile"]','!!document.querySelector(".owner-listing-card")');
 const calls=(await(await fetch(base+'/__fixture/info')).json()).calls;
 assert.equal(await b.evaluate('performance.timeOrigin'),origin,'profile navigation preserves document');
 await delay(200);assert.deepEqual(errors,[]);assert.equal(docs,1);
 const report={phase,timings,calls,documents:docs,errors,environment:'Compiled Worker, synthetic authenticated owner, 120ms per upstream request; Chromium'};
 await writeFile(`artifacts/moderation-correctness/navigation-${phase}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){console.log(JSON.stringify({phase,timings,url:await b.evaluate('location.pathname'),text:await b.evaluate('document.querySelector("main")?.innerText'),error:e.message}));throw e;}finally{await b.close();}
