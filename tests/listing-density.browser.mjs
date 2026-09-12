import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,access,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer,get} from 'node:http';
import {build} from 'esbuild';

// Real Chromium DOM, React, CSS and touch events; no application data or external services.
const root=resolve('.'),out=resolve(process.env.JEVU_DENSITY_OUTPUT||'artifacts/jevu-listing-density-20260912');
await mkdir(out,{recursive:true});
const candidates=[process.env.JEVU_BROWSER_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean);
let executable;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){executable=path;break;}
assert.ok(executable,'Set JEVU_BROWSER_PATH to an installed Chromium browser; no browser is downloaded by this test.');
const mode=process.env.JEVU_DENSITY_MODE||'after';
const keys=['brand','model','year','mileage','transmission','fuel','drive','engine_volume','steering','color','condition','owners','registration','accidents','restrictions'];
const labels=['Марка','Модель','Год выпуска','Пробег','Коробка передач','Топливо','Привод','Объём двигателя','Руль','Цвет','Состояние автомобиля','Количество владельцев','Регистрация','Участие в ДТП','Ограничения'];
const values=['Toyota','Camry','2020 год','2977 км','Автомат','Бензин','Передний','3 л','Слева','Белый','С пробегом','2','Учёт Казахстана','Не участвовал','Нет'];
const svg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#dae8dc"/><text x="450" y="300" text-anchor="middle" font-size="36">Фото объявления</text></svg>');
const image=await access(join(out,'car.jpg')).then(()=>'/car.jpg',()=>svg);
const fixture={id:'fixture-listing',slug:'camry',title:'Тойота Камри 2020 года',description:'Продам срочно в идеальном состоянии',priceLabel:'10 000 000 ₸',locationLabel:'Петропавловск',publishedLabel:'Сегодня',sellerId:'fixture-seller',sellerName:'Валера',imageUrls:[image],attributes:Object.fromEntries(keys.map((k,i)=>[k,values[i]])),attributeDefinitions:keys.map((key,i)=>({key,label:{ru:labels[i],kk:labels[i]},dataType:'text',unit:null})),categorySlug:'cars-sedan',categoryName:{ru:'Седаны',kk:'Седандар'},categorySearchPlaceholder:{ru:'Поиск транспорта: «Седаны»',kk:'Іздеу'}};
const live=await readFile(join(out,'before/production.json'),'utf8').then(s=>JSON.parse(s.replace(/^\uFEFF/,'')),()=>null);
const header=live?.header||'<header class="site-header"><div class="header-inner"><a class="brand" href="/">JEVU</a><button class="menu-toggle">☰</button></div></header>';
const mocks={
 '@/components/header':`export function Header(){return <div style={{display:'contents'}} dangerouslySetInnerHTML={{__html:${JSON.stringify(header)}}}/>}`,
 '@/components/i18n-provider':"import {translate} from './lib/i18n/messages'; export function useI18n(){return {locale:'ru',t:(k,v)=>translate('ru',k,v)}}",
 '@/components/app-link':`export function AppLink({prefetch,children,...props}){return <a {...props} onClick={e=>{e.preventDefault();window.lastNavigation=props.href;props.onClick?.(e)}}>{children}</a>}`,
 'next/navigation':"export const usePathname=()=>'/listing/fixture-listing-camry'; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push:p=>window.lastNavigation=p,replace:p=>window.lastNavigation=p,back:()=>window.lastNavigation='back'});export const permanentRedirect=()=>{};export const notFound=()=>{throw Error('notFound')}",
 '@/components/publication-refresh':'export const PublicationRefresh=()=>null',
 '@/lib/i18n/server':'export const getServerI18n=()=>{}',
 '@/lib/data/repositories':'export const listingRepository={}',
 '@/lib/data/supabase/moderation':'export const createReport=async()=>{}',
 '@/lib/supabase/browser':`export const getSupabaseBrowserClient=()=>({rpc:()=>({abortSignal:async()=>({data:[{allow_messages:true,allow_phone:true}],error:null})}),auth:{getUser:async()=>({data:{user:null},error:null})}})`,
 '@/components/favorite-store':`let s={ids:new Set(),ready:true};let listeners=new Set();export const readFavoriteStore=()=>s;export const readServerFavoriteStore=readFavoriteStore;export const subscribeFavoriteStore=f=>{listeners.add(f);return ()=>listeners.delete(f)};export const loadFavoriteStore=async()=>{};export const toggleFavoriteListing=async id=>{const ids=new Set(s.ids);ids.has(id)?ids.delete(id):ids.add(id);s={...s,ids};listeners.forEach(f=>f());return ids.has(id)?'added':'removed'}`,
};
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import ListingPage from './app/listing/[slug]/page';import {useI18n} from '@/components/i18n-provider';window.fixtureListing=${JSON.stringify(fixture)};const root=createRoot(document.getElementById('app'));window.showListing=patch=>{window.fixtureListing={...window.fixtureListing,...patch};root.render(<ListingPage params={{slug:'fixture-listing-camry'}}/>)};window.showListing({});window.turnstile={render:(container,options)=>{window.challengeOptions=options;container.textContent='Проверка безопасности';setTimeout(()=>options.callback('fixture-token'),30);return 'fixture'},remove:()=>{document.querySelector('.listing-phone-challenge').textContent=''}};`;
const js=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'density-fixture.tsx',loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'listing-fixtures',setup(b){
 b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'fixture'}:null);
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));
 b.onLoad({filter:/app[\\/]listing[\\/]\[slug\][\\/]page\.tsx$/},async()=>{let text=await readFile(mode==='before'?join(out,'before/page.tsx'):'app/listing/[slug]/page.tsx','utf8');text=text.replace('async function ListingPageContent','function ListingPageContent').replaceAll('const [{ slug }, { locale, t }] = await Promise.all([params, getServerI18n()]);','const {slug}=params; const {locale,t}=useI18n();').replaceAll('const listing = await listingRepository.findBySlug(slug, locale);','const listing = window.fixtureListing;');return {contents:"import {useI18n} from '@/components/i18n-provider';\n"+text,loader:'tsx',resolveDir:resolve('app/listing/[slug]')};});
}}]});
const css=await readFile(mode==='before'?join(out,'before/globals.css'):'app/globals.css');
const requests=[];
const server=createServer(async(req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js.outputFiles[0].contents);}else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}else if(req.url==='/car.jpg'){res.setHeader('Content-Type','image/jpeg');res.end(await readFile(join(out,'car.jpg')));}else if(req.url.startsWith('/icons/')){res.setHeader('Content-Type','image/png');res.end(await readFile(join(root,'public',req.url)));}else if(req.url.startsWith('/api/listings/')){requests.push(req.method);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.method==='POST'?{phone:'+77000000000'}:{siteKey:'fixture-site-key'}));}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="app"></div><script src="/app.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')) {console.log('Local fixture preview: '+url);await new Promise(resolve=>server.on('close',resolve));}
const profile=await mkdtemp(join(out,'browser-profile-'));
const child=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-extensions','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const json=url=>new Promise((r,j)=>get(url,res=>{let data='';res.on('data',x=>data+=x);res.on('end',()=>{try{r(JSON.parse(data));}catch(e){j(e);}});}).on('error',j));
let socket;const report=[];try{
 let port;for(let i=0;i<100&&!port;i++){port=await readFile(join(profile,'DevToolsActivePort'),'utf8').then(x=>Number(x.split('\n')[0]),()=>0);if(!port)await delay(100);}
 assert.ok(port,'headless browser failed to start');
 const pages=await json('http://127.0.0.1:'+port+'/json/list');const page=pages.find(x=>x.type==='page');assert.ok(page);
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map(),errors=[],httpErrors=[];
 socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);if(x.error)p?.reject(new Error(JSON.stringify(x.error)));else p?.resolve(x.result);}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.text);else if(x.method==='Network.responseReceived'&&x.params.response.status>=400)httpErrors.push({url:x.params.response.url,status:x.params.response.status});};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await delay(50);}assert.fail('DOM condition timed out: '+expression);};
 const click=async selector=>{const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing click target');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await delay(80);};
 const key=async(key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,modifiers,windowsVirtualKeyCode:key==='Escape'?27:key==='Tab'?9:key==='ArrowRight'?39:37});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers});await delay(100);};
 const selected=()=>evaluate(`Number(document.querySelector('.gallery-selectors button[aria-pressed="true"]')?.textContent||1)`);
 const swipe=async(selector,direction)=>{const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);const start=p.x+p.w*(direction==='left'?.8:.2),end=p.x+p.w*(direction==='left'?.2:.8),y=p.y+p.h/2;await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y,id:1}]});for(let i=1;i<=12;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/12,y,id:1}]});await delay(20);}await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(700);};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 for(const [width,height] of [[390,844],[393,852],[430,932],[440,956],[768,1024],[1280,900]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});await send('Emulation.setTouchEmulationEnabled',{enabled:width<700});
  await send('Page.navigate',{url});await until(`!!document.querySelector('.contact-message-button')`);await until(`document.querySelector('.gallery-open img').complete`);
  const measurements=await evaluate(`(()=>{const selectors={header:'.site-header',toolbar:'.app-page-header',photo:'.listing-gallery',attributes:'.characteristics-grid',description:'.listing-description, .detail-card:nth-of-type(2)',location:'.listing-location, .detail-card:nth-of-type(3)',seller:'.seller-card',price:'.detail-price',title:'.listing-mobile-title',actions:'.listing-contact-actions'};const blocks=Object.fromEntries(Object.entries(selectors).map(([k,s])=>{const e=document.querySelector(s);const r=e?.getBoundingClientRect();return [k,r?{top:r.top+scrollY,height:r.height,bottom:r.bottom+scrollY}:null]}));return {blocks,documentHeight:document.documentElement.scrollHeight,horizontalScroll:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.characteristics-grid')).gridTemplateColumns,attributes:document.querySelectorAll('.characteristics-grid > div').length};})()`);
  assert.equal(measurements.horizontalScroll,false);
  await evaluate('window.scrollTo({top:0,behavior:"instant"})');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.max(height,Math.min(measurements.documentHeight,2200)),scale:1}});await writeFile(join(out,`${mode}-${width}.png`),Buffer.from(shot.data,'base64'));
  if(mode==='after'&&width<700){
   const layout=await evaluate(`(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect(),grid=getComputedStyle(document.querySelector('.characteristics-grid')),tile=getComputedStyle(document.querySelector('.characteristics-grid > div'));return {priceAfterTitle:rect('.detail-price').top>=rect('.listing-mobile-title').bottom-1,priceBeforeAttributes:rect('.detail-price').bottom<=rect('.listing-characteristics').top+1,gap:grid.gap,background:grid.backgroundColor,border:tile.borderTopWidth,radius:tile.borderRadius,dockPosition:getComputedStyle(document.querySelector('.listing-contact-dock')).position,dockBottom:rect('.listing-contact-dock').bottom,height:innerHeight}})()`);
   assert.equal(layout.priceAfterTitle,true);assert.equal(layout.priceBeforeAttributes,true);assert.equal(layout.gap,'6px');assert.equal(layout.background,'rgb(255, 255, 255)');assert.equal(layout.border,'1px');assert.equal(layout.radius,'12px');assert.equal(layout.dockPosition,'fixed');assert.equal(layout.dockBottom,layout.height);
   for(const y of [500,100000]){await evaluate(`window.scrollTo({top:${y},behavior:'instant'})`);assert.equal(await evaluate(`document.querySelector('.listing-contact-dock').getBoundingClientRect().bottom`),height);}
   assert.ok(await evaluate(`document.querySelector('.listing-publication-note').getBoundingClientRect().bottom<document.querySelector('.listing-contact-dock').getBoundingClientRect().top`),'last content not covered by action dock');
   await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);await delay(50);
   const viewport=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(out,`viewport-${width}.png`),Buffer.from(viewport.data,'base64'));
   measurements.layout=layout;
  }
  report.push({width,height,...measurements});
 }
 const interactions=[],scenarios=[];
 if(mode==='after') {
  for(const [width,height] of [[390,844],[430,932]]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
   await send('Page.navigate',{url});await until(`!!document.querySelector('.contact-message-button')`);
   const visible=()=>evaluate(`[...document.querySelectorAll('.characteristics-grid > div')].filter(e=>e.getBoundingClientRect().height>0).length`);
   assert.equal(await visible(),11);await click('.listing-disclosure-characteristics > button');assert.equal(await visible(),15);await click('.listing-disclosure-characteristics > button');assert.equal(await visible(),11);
   const longDescription='Продам срочно в идеальном состоянии. '+('Подробная история обслуживания и комплектация автомобиля. '.repeat(12));
   await evaluate(`window.showListing({description:${JSON.stringify(longDescription)}})`);await delay(100);
   assert.ok(await evaluate(`document.querySelector('.listing-description').getBoundingClientRect().height<=56`));
   await click('.listing-disclosure-description > button');assert.ok(await evaluate(`document.querySelector('.listing-description').getBoundingClientRect().height>200`));
   assert.equal(await evaluate(`document.querySelector('.listing-description p').textContent`),longDescription);await click('.listing-disclosure-description > button');
   await click('.detail-secondary button:first-child');assert.equal(await evaluate(`document.querySelector('.detail-secondary button').getAttribute('aria-pressed')`),'true');await click('.detail-secondary button:first-child');
   await evaluate(`Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shared=data}})`);await click('.detail-secondary button:nth-child(2)');assert.equal(await evaluate(`window.shared.title`),fixture.title);
   await click('.contact-message-button');assert.equal(await evaluate('window.lastNavigation'),'/messages/new?listing=fixture-listing');
   await click('.seller-card');assert.equal(await evaluate('window.lastNavigation'),'/seller/fixture-seller');
   assert.equal(await evaluate(`document.querySelector('.listing-location p').textContent.trim()`),'Петропавловск');
   const requestStart=requests.length;await click('.listing-phone-control > button');await until(`!!document.querySelector('a[href="tel:+77000000000"]')`);
   assert.deepEqual(requests.slice(requestStart),['GET','POST']);assert.equal(await evaluate(`window.challengeOptions.action`),'listing_phone');
   assert.equal(await evaluate(`window.challengeOptions.cData`),'fixture-listing');
   assert.equal(await evaluate(`document.querySelector('.listing-contact-actions').getBoundingClientRect().width>document.querySelector('.contact-message-button').getBoundingClientRect().width`),true);
   await evaluate(`window.dispatchEvent(new PageTransitionEvent('pagehide'))`);await until(`!document.querySelector('a[href^="tel:"]')`);
   await evaluate(`window.showListing({imageUrls:Array.from({length:12},(_,i)=>${JSON.stringify(image)}+'#'+i),description:${JSON.stringify(fixture.description)}})`);await until(`document.querySelectorAll('.gallery-open').length===12`);
   await click('.listing-gallery > .gallery-controls button:last-child');assert.equal(await selected(),2);
   await swipe('.listing-gallery > .gallery-track','left');assert.equal(await selected(),3);
   await click('.gallery-open[tabindex="0"]');await until(`!!document.querySelector('.gallery-viewer')`);
   assert.ok(await evaluate(`getComputedStyle(document.querySelector('.gallery-viewer img')).objectFit==='contain'`));
   await click('.gallery-viewer .gallery-controls button:last-child');assert.equal(await selected(),4);
   await key('Escape');await until(`!document.querySelector('.gallery-viewer')`);assert.equal(await selected(),4);
   await click('.gallery-selectors button:last-child');await delay(800);assert.equal(await evaluate(`(()=>{const t=document.querySelector('.listing-gallery > .gallery-track');return Math.round(t.scrollLeft/t.clientWidth)+1})()`),12);assert.equal(await selected(),12);
   assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false);
   await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);await delay(100);
   const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.max(height,await evaluate('document.documentElement.scrollHeight')),scale:1}});await writeFile(join(out,`gallery-12-${width}.png`),Buffer.from(shot.data,'base64'));
   await evaluate(`window.showListing({title:'Очень длинное название объявления '.repeat(7),priceLabel:'100 000 000 000 ₸',sellerName:'Продавец с длинным отображаемым именем',description:'Словобезпробелов'.repeat(100),attributeDefinitions:[...window.fixtureListing.attributeDefinitions,{key:'long',label:{ru:'Длинная характеристика',kk:'Сипат'},dataType:'text',unit:null}],attributes:{...window.fixtureListing.attributes,long:'ЗначениеБезПробелов'.repeat(10)}})`);await delay(120);
   await click('.listing-disclosure-characteristics > button');
   const edge=await evaluate(`(()=>{const title=document.querySelector('.listing-mobile-title'),s=getComputedStyle(title);return {horizontalScroll:document.documentElement.scrollWidth>innerWidth,titleHeight:title.clientHeight,padding:parseFloat(s.paddingTop)+parseFloat(s.paddingBottom),lineHeight:parseFloat(s.lineHeight),overflows:[...document.querySelectorAll('.characteristics-grid dt,.characteristics-grid dd,.seller-card strong,.listing-location p,.detail-price')].filter(e=>e.getBoundingClientRect().width&&e.scrollWidth>e.clientWidth+1).map(e=>e.className||e.tagName)}})()`);
   assert.equal(edge.horizontalScroll,false);assert.ok(edge.titleHeight-edge.padding<=edge.lineHeight*2+1);assert.deepEqual(edge.overflows,[]);
   interactions.push({width,attributesExpanded:15,descriptionExpanded:true,favoriteToggle:true,messageLink:true,sellerLink:true,protectedPhone:'fixture GET/challenge/POST + tel + pagehide clear PASS',gallery:'12 photos, arrows, selectors, swipe, fullscreen, Escape PASS',edge});
  }
 }
 if(mode==='after')for(const [width,height]of [[390,844],[393,852],[430,932],[440,956]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url});await until(`!!document.querySelector('.contact-message-button')`);
  const cases=[{name:'tv-three',title:'Телевизор Samsung',keys:['brand','model','condition'],values:['Samsung','55 дюймов','Отличное']},{name:'other-one',title:'Стул',keys:['condition'],values:['Новый']},{name:'missing-values',title:'Объявление с частично заполненными данными',keys:['brand','model','year','condition'],values:['Toyota','',null,'С пробегом']},{name:'no-attributes-long-title',title:'Очень длинное название объявления '.repeat(6),keys:[],values:[]}];
  for(const item of cases){
   const patch={title:item.title,description:'Подробное описание товара. '.repeat(40),attributes:Object.fromEntries(item.keys.map((k,i)=>[k,item.values[i]]).filter(([,value])=>value!==null)),attributeDefinitions:item.keys.map(key=>({key,label:{ru:key,kk:key},dataType:'text',unit:null}))};await evaluate(`window.showListing(${JSON.stringify(patch)})`);await delay(100);
   const result=await evaluate(`(()=>{const grid=document.querySelector('.characteristics-grid'),price=document.querySelector('.detail-price').getBoundingClientRect(),title=document.querySelector('.listing-mobile-title').getBoundingClientRect();return {cells:grid?.children.length||0,background:grid?getComputedStyle(grid).backgroundColor:null,horizontalScroll:document.documentElement.scrollWidth>innerWidth,priceAfterTitle:price.top>=title.bottom-1,descriptionCollapsed:document.querySelector('.listing-description').getBoundingClientRect().height<=56,overflow:[...document.querySelectorAll('.characteristics-grid dt,.characteristics-grid dd,.detail-price')].filter(e=>e.clientWidth&&e.scrollWidth>e.clientWidth+1).length}})()`);
   assert.equal(result.cells,item.values.filter(x=>x!=null&&x!=='').length);assert.equal(result.horizontalScroll,false);assert.equal(result.priceAfterTitle,true);assert.equal(result.descriptionCollapsed,true);assert.equal(result.overflow,0);if(result.cells)assert.equal(result.background,'rgb(255, 255, 255)');scenarios.push({width,case:item.name,...result});
  }
 }
 let safeArea='not run in baseline';
 if(mode==='after'){
  const protocol=await json('http://127.0.0.1:'+port+'/json/protocol');
  if(protocol.domains.find(d=>d.domain==='Emulation')?.commands.some(c=>c.name==='setSafeAreaInsetsOverride')){
   await send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom:34}});
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url});await until(`!!document.querySelector('.contact-message-button')`);
   const inset=await evaluate(`(()=>{const dock=document.querySelector('.listing-contact-dock');return {dockPadding:parseFloat(getComputedStyle(dock).paddingBottom),pagePadding:parseFloat(getComputedStyle(document.querySelector('.listing-page')).paddingBottom),buttonBottom:document.querySelector('.listing-contact-actions').getBoundingClientRect().bottom,height:innerHeight}})()`);
   assert.equal(inset.dockPadding,44);assert.equal(inset.pagePadding,138);assert.ok(inset.buttonBottom<=inset.height-34);safeArea={environment:'Chromium emulated bottom inset 34px',...inset};await send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom:0}});
  }else safeArea='CSS env rules verified; browser inset override unavailable';
 }
 await writeFile(join(out,'interaction-results.json'),JSON.stringify({mode,interactions,scenarios,safeArea,httpErrors,errors,realProductionWrites:false},null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);await writeFile(join(out,`${mode}-measurements.json`),JSON.stringify({environment:'local Chromium; actual listing page, gallery, actions and CSS; fixture data/Auth/navigation/Turnstile',report},null,2));console.log(JSON.stringify({status:'PASS',mode,report}));
 await send('Browser.close').catch(()=>{});
}finally{socket?.close();child.kill();server.close();}
