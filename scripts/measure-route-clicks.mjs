// Actual public UI actions, separate from document load timing. No user writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {testBrowser,delay} from '../tests/helpers/browser.mjs';
const phase=process.argv[2]??'before',base=process.env.JEVU_NAV_BASE??'https://jevu.kz';
assert.match(phase,/^[a-z-]+$/);
const output='artifacts/performance-followup';await mkdir(output,{recursive:true});
const listing=process.env.JEVU_PERF_LISTING_PATH??JSON.parse(await readFile('artifacts/pwa-removal/http-before.json','utf8')).listing;
assert.ok(listing.startsWith('/listing/')&&!/["'<>\\]/.test(listing),'A public listing path is required');
const results=[];
for(let repeat=0;repeat<3;repeat++){
 const b=await testBrowser({output});const errors=[];
 b.on('Runtime.exceptionThrown',x=>errors.push(x.exceptionDetails.text));
 try{
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const navigate=async(path,marker)=>{await b.send('Page.navigate',{url:base+path});await b.until(marker);await delay(400);};
  const measure=async(scenario,action,marker,photo=false)=>{
   const timeOrigin=await b.evaluate('performance.timeOrigin');
   const start=performance.now();assert.notEqual(await b.evaluate(action),false,'Action must exist: '+scenario);
   await b.until(marker);const useful_ms=performance.now()-start;let photo_ms=null;
   if(photo){await b.until(`[...document.querySelectorAll('.listing-gallery img')].some(img=>img.complete&&img.naturalWidth&&img.getBoundingClientRect().width>0)`);photo_ms=performance.now()-start;}
   assert.equal(await b.evaluate('performance.timeOrigin'),timeOrigin,'Internal navigation must not reload');
   const row={scenario,repeat,useful_ms,photo_ms};results.push(row);console.log(JSON.stringify(row));await delay(300);
  };
  await navigate('/',`!!document.querySelector('a[href="/category/transport"]') && !!window.__VINEXT_RSC_NAVIGATE__`);
  await measure('home_to_catalog',`document.querySelector('a[href="/category/transport"]').click()`,`location.pathname==='/category/transport' && !!document.querySelector('.listing-card')`);
  await navigate('/search?sort=new',`!!document.querySelector('a[href="${listing}"]')`);
  await b.evaluate('window.scrollTo(0,180)');await delay(100);const previousScroll=await b.evaluate('scrollY');
  await measure('catalog_to_listing',`document.querySelector('a[href="${listing}"]').click()`,`location.pathname===${JSON.stringify(listing)} && !!document.querySelector('.listing-gallery')`,true);
  await measure('listing_back_catalog',`document.querySelector('button.back-button').click()`,`location.pathname==='/search' && location.search==='?sort=new' && !!document.querySelector('.listing-card')`);
  await delay(350);assert.ok(Math.abs(await b.evaluate('scrollY')-previousScroll)<3,'Catalog scroll restored');
  await navigate('/category/transport',`!!document.querySelector('.price-fields input') && !!document.querySelector('.listing-card')`);
  await b.evaluate(`document.querySelector('.price-fields input').focus()`);await b.send('Input.insertText',{text:'11000000'});
  const apply=`(()=>{const button=[...document.querySelectorAll('.filters-panel button')].find(x=>x.textContent.trim().startsWith('Показать'));if(!button)return false;button.click();})()`;
  await measure('price_filter_apply',apply,`new URL(location.href).searchParams.get('price_min')==='11000000' && document.querySelector('main')?.innerText.includes('Объявлений пока нет')`);
  await measure('price_filter_reset',`(()=>{const button=[...document.querySelectorAll('.filters-panel button')].find(x=>x.textContent.includes('Сбросить фильтры'));if(!button)return false;button.click();})()`,`!new URL(location.href).searchParams.has('price_min') && !!document.querySelector('.listing-card')`);
  await measure('city_picker_open',`document.querySelector('.filters-panel .location-trigger').click()`,`!!document.querySelector('.location-sheet') && [...document.querySelectorAll('.location-sheet button')].some(x=>x.textContent.includes('Петропавловск'))`);
  await b.evaluate(`[...document.querySelectorAll('.location-sheet button')].find(x=>x.textContent.includes('Петропавловск')).click()`);
  await measure('city_filter_apply',apply,`new URL(location.href).searchParams.has('city') && !!document.querySelector('.listing-card') && document.querySelector('.filters-panel .location-trigger')?.textContent.includes('Петропавловск')`);
  assert.deepEqual(errors,[]);
 }finally{await b.close();}
}
await writeFile(`${output}/route-clicks-${phase}.json`,JSON.stringify({conditions:'Chromium desktop 1440x1000 DPR1, guest, native network, no throttling. Fresh profile for each of 3 repetitions; same ordered scenarios. Measures clicks after source page hydration, not document TTFB. Real public rows, no edits.',results},null,2));
