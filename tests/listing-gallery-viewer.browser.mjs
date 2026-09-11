import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,access,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer,get} from 'node:http';
import {build} from 'esbuild';

// Real Chromium DOM, React, CSS and touch events; no application data or external services.
const root=resolve('.'),out=resolve(process.env.JEVU_GALLERY_CHECK_OUTPUT||'artifacts/gallery-browser');
await mkdir(out,{recursive:true});
const candidates=[process.env.JEVU_BROWSER_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean);
let executable;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){executable=path;break;}
assert.ok(executable,'Set JEVU_BROWSER_PATH to an installed Chromium browser; no browser is downloaded by this test.');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {ListingGallery} from './components/listing-gallery';
const shapes=[[300,600],[600,300],[400,400]];
const images=shapes.map(([w,h],i)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><rect width="100%" height="100%" fill="'+['#e5bb6a','#76b6cf','#90bc86'][i]+'"/><rect x="4" y="4" width="'+(w-8)+'" height="'+(h-8)+'" fill="none" stroke="#24313a" stroke-width="8"/><text x="50%" y="50%" text-anchor="middle" font-size="36">'+w+' x '+h+'</text></svg>'));
const app=createRoot(document.getElementById('app'));
window.showGallery=n=>app.render(<><header className="site-header">JEVU — gallery test</header><div style={{height:150}}/><section id="cards" style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12}}>{images.map((src,i)=><div key={src}><article className="listing-card"><div className="listing-image-wrap"><span className="listing-placeholder">PHOTO</span><img className="listing-image" src={src}/></div></article><div className="owner-listing-media"><img src={src}/></div></div>)}</section><main style={{maxWidth:900,margin:'40px auto'}}><ListingGallery key={n} images={Array.from({length:n},(_,i)=>images[i%3]+'#'+i)} title="Gallery fixture"/></main><div style={{height:600}}/><nav className="mobile-bottom-nav">JEVU navigation</nav></>);
window.showGallery(2);`;
const js=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'gallery-browser.tsx',loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'gallery-fixture-translation',setup(b){b.onResolve({filter:/^@\/components\/i18n-provider$/},()=>({path:'translation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import {translate} from './lib/i18n/messages';export function useI18n(){return {t:(key,values)=>translate('ru',key,values)}}",resolveDir:root,loader:'ts'}));}}]});
const css=await readFile('app/globals.css');
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js.outputFiles[0].contents);}else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="app"></div><script src="/app.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(out,'browser-profile-'));
const child=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-extensions','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const json=url=>new Promise((r,j)=>get(url,res=>{let data='';res.on('data',x=>data+=x);res.on('end',()=>{try{r(JSON.parse(data));}catch(e){j(e);}});}).on('error',j));
let socket;const report=[];try{
 let port;for(let i=0;i<100&&!port;i++){port=await readFile(join(profile,'DevToolsActivePort'),'utf8').then(x=>Number(x.split('\n')[0]),()=>0);if(!port)await delay(100);}
 assert.ok(port,'headless browser failed to start');
 const pages=await json('http://127.0.0.1:'+port+'/json/list');const page=pages.find(x=>x.type==='page');assert.ok(page);
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map(),errors=[];
 socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);if(x.error)p?.reject(new Error(JSON.stringify(x.error)));else p?.resolve(x.result);}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await delay(50);}assert.fail('DOM condition timed out: '+expression);};
 const click=async selector=>{const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing click target');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await delay(80);};
 const key=async(key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,modifiers,windowsVirtualKeyCode:key==='Escape'?27:key==='Tab'?9:key==='ArrowRight'?39:37});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers});await delay(100);};
 const selected=()=>evaluate(`Number(document.querySelector('.gallery-selectors button[aria-pressed="true"]')?.textContent||1)`);
 const swipe=async(selector,direction)=>{const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);const start=p.x+p.w*(direction==='left'?.8:.2),end=p.x+p.w*(direction==='left'?.2:.8),y=p.y+p.h/2;await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y,id:1}]});for(let i=1;i<=12;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/12,y,id:1}]});await delay(20);}await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(700);};
 await send('Page.enable');await send('Runtime.enable');
 for(const mobile of [false,true]){
  await send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:900,deviceScaleFactor:mobile?2:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});
  await send('Page.navigate',{url});await until(`document.querySelectorAll('.gallery-open').length===2`);
  await until(`[...document.querySelectorAll('#cards img')].every(x=>x.complete&&x.naturalWidth>0)`);
  const cards=await evaluate(`([...document.querySelectorAll('#cards img')].map(i=>({fit:getComputedStyle(i).objectFit,background:getComputedStyle(i).backgroundColor,ratio:i.naturalWidth/i.naturalHeight,box:i.parentElement.getBoundingClientRect().toJSON(),image:i.getBoundingClientRect().toJSON()})))`);
  await writeFile(join(out,mobile?'cards-mobile.json':'cards-desktop.json'),JSON.stringify(cards,null,2));
  for(let i=0;i<cards.length;i++){const c=cards[i];assert.equal(c.fit,'contain');if(i%2===0)assert.notEqual(c.background,'rgba(0, 0, 0, 0)');assert.ok(Math.abs(c.box.width/c.box.height-(i%2===0?4/3:16/9))<.03);assert.ok(c.image.width<=c.box.width+1&&c.image.height<=c.box.height+1);}
  for(const count of [1,2,3,7]){
   await evaluate(`window.showGallery(${count})`);await until(`document.querySelectorAll('.gallery-open').length===${count}`);
   if(count>1){await click('.gallery-selectors button:nth-child(2)');assert.equal(await selected(),2);}
   const photo=count>1?2:1;await evaluate(`document.querySelector('.gallery-open[tabindex="0"]').scrollIntoView({block:'center',behavior:'instant'})`);await delay(100);
   const before=await evaluate(`({scrollY,box:document.querySelector('.listing-gallery').getBoundingClientRect().toJSON(),bodyStyle:document.body.getAttribute('style')||''})`);
   await click('.gallery-open[tabindex="0"]');await until(`!!document.querySelector('.gallery-viewer')`);
   const open=await evaluate(`(()=>{const d=document.querySelector('.gallery-viewer'),t=d.querySelector('.gallery-track'),r=d.getBoundingClientRect();return {index:Math.round(t.scrollLeft/t.clientWidth)+1,photoCount:d.querySelectorAll('img').length,fixed:getComputedStyle(d).position,height:r.height,top:r.top,width:r.width,vw:innerWidth,vh:innerHeight,fit:[...d.querySelectorAll('img')].every(i=>getComputedStyle(i).objectFit==='contain'),locked:document.body.style.position==='fixed',inert:document.getElementById('app').inert,focused:d.contains(document.activeElement),modal:d.getAttribute('aria-modal'),z:Number(getComputedStyle(d).zIndex)};})()`);
   assert.equal(open.index,photo);assert.ok(open.photoCount<=3);assert.equal(open.fixed,'fixed');assert.ok(Math.abs(open.height-open.vh)<=1&&open.top===0&&Math.abs(open.width-open.vw)<=1);assert.ok(open.fit&&open.locked&&open.inert&&open.focused&&open.z>1000);assert.equal(open.modal,'true');
   if(count>1){await key('ArrowLeft');await until(`document.querySelector('.gallery-viewer .gallery-controls span').textContent.includes('1 из')`);assert.equal(await selected(),1);if(mobile){await swipe('.gallery-viewer .gallery-track','left');assert.equal(await selected(),2);}else{await click('.gallery-viewer .gallery-controls button:last-child');assert.equal(await selected(),2);}}
   for(let i=0;i<6;i++){await key('Tab');assert.ok(await evaluate(`document.querySelector('.gallery-viewer').contains(document.activeElement)`));}
   await key('Tab',8);assert.ok(await evaluate(`document.querySelector('.gallery-viewer').contains(document.activeElement)`));
   if(count===2){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,mobile?'viewer-mobile.png':'viewer-desktop.png'),Buffer.from(shot.data,'base64'));}
   await key('Escape');await until(`!document.querySelector('.gallery-viewer')`);await delay(100);
   const after=await evaluate(`({scrollY,box:document.querySelector('.listing-gallery').getBoundingClientRect().toJSON(),bodyStyle:document.body.getAttribute('style')||'',inert:document.getElementById('app').inert,focus:document.activeElement.className,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})`);
   assert.ok(Math.abs(after.scrollY-before.scrollY)<=1,'scroll restored');assert.ok(Math.abs(after.box.width-before.box.width)<=1&&Math.abs(after.box.height-before.box.height)<=1,'no gallery layout shift');assert.equal(after.bodyStyle,before.bodyStyle);assert.equal(after.inert,false);assert.equal(after.overflow,false);assert.equal(after.focus,'gallery-open');assert.equal(await selected(),photo);
   await click('.gallery-open[tabindex="0"]');await click('.gallery-viewer-close');await until(`!document.querySelector('.gallery-viewer')`);
   if(mobile&&count===2){await click('.gallery-selectors button:first-child');await swipe('.listing-gallery > .gallery-track','left');assert.equal(await selected(),2);assert.ok(await evaluate(`!document.querySelector('.gallery-viewer')`),'ordinary swipe must not open viewer');await click('.gallery-open[tabindex="0"]');await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true});await delay(250);assert.equal(await evaluate(`(()=>{const t=document.querySelector('.gallery-viewer .gallery-track');return Math.round(t.scrollLeft/t.clientWidth)+1})()`),2);await key('Escape');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await delay(250);assert.equal(await selected(),2);}
   report.push({viewport:mobile?'mobile':'desktop',photos:count,cardRatios:'portrait/landscape/square PASS',openSelected:true,closeAndEscape:true,arrows:true,touchSwipe:mobile&&count>1,focusTrapAndRestore:true,scrollRestore:true,overflow:false,layoutShift:false,viewerImagesMax:open.photoCount});
  }
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,mobile?'gallery-mobile.png':'gallery-desktop.png'),Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'results.json'),JSON.stringify({status:'PASS',environment:'local headless Chromium, real React component/CSS, synthetic images, no production I/O',report},null,2));console.log(JSON.stringify({status:'PASS',cases:report.length,output:out}));
 await send('Browser.close').catch(()=>{});
}finally{socket?.close();child.kill();server.close();}
