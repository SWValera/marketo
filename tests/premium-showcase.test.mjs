import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {premiumDemoCount,premiumExpandedDemoCount,premiumCarouselPage,premiumCardsPerPage,premiumPreparedIndexes} from "../lib/premium-showcase-presentation.ts";

for(const size of [2,3,4])test("full carousel pages and separate city slots: size="+size,()=>{
 for(const real of [0,1,2,3,4,5,6,7,8,9,14,15,31]){
  const demos=premiumDemoCount(real,size),items=Array.from({length:real+demos},(_,i)=>i),pages=Math.ceil(items.length/size);
  assert.equal(pages,Math.max(1,Math.ceil(real/size)));
  assert.equal(demos,real===0?size:(size-real%size)%size);
  const seen=[];
  for(let page=0;page<pages;page++){
   const current=premiumCarouselPage(items,page,size);assert.equal(current.items.length,size);
   if(real>0)assert.ok(current.items.some(i=>i<real),"No extra demo-only page");
   if(page<pages-1)assert.ok(current.items.every(i=>i<real));
   seen.push(...current.items);
   const warm=premiumPreparedIndexes(items.length,page,size);
   assert.ok(warm.size<=3*size);
   for(const offset of [-1,0,1])for(const item of premiumCarouselPage(items,page+offset,size).items)assert.ok(warm.has(item));
  }
  assert.deepEqual(seen,items);assert.equal(new Set(seen).size,items.length);
  assert.equal(premiumCarouselPage(items,-1,size).pageIndex,pages-1);
  if(real<=15)assert.equal(real+premiumExpandedDemoCount(real,15,size),15);
  assert.equal(premiumExpandedDemoCount(real,null,size),real===0?size:0);
 }
});

test("short landscape adds three columns without changing existing breakpoints",()=>{
 for(const [width,landscape,size] of [[340,true,2],[670,false,2],[911,false,2],[859,true,2],[860,true,4],[911,true,4],[1067,true,4],[1253,true,4],[1390,true,4]])assert.equal(premiumCardsPerPage(width,landscape),size);
 for(const width of [500,602,670,818])assert.equal(premiumCardsPerPage(width,true,true),3);
 assert.equal(premiumCardsPerPage(479,true,true),2);
 assert.equal(premiumCardsPerPage(670,false,true),2);
 for(const invalid of [-1,NaN,Infinity,1.5])assert.equal(premiumDemoCount(invalid,4),0);
});

test("national scope is loaded; stale scope and expanded state cannot pause the next scope",async()=>{
 const source=await readFile(new URL("../components/city-premium-showcase.tsx",import.meta.url),"utf8");
 assert.match(source,/getOrLoad\(selectedLocation/);
 assert.match(source,/if \(expandedState.scope !== cityKey\) setExpandedState/);
 assert.match(source,/if \(imageState.scope !== cityKey\) setImageState/);
 assert.match(source,/if \(active\) setPaidState/);
 assert.match(source,/premiumCarouselPage\(carouselItems/);
 assert.match(source,/premiumExpandedDemoCount/);
 assert.match(source,/nationalTotal/);
 assert.doesNotMatch(source,/setInterval|Math.random|className="secondary-button showcase-view-all"/);
});

test("retained image nodes and media delivery remain unchanged",async()=>{
 const source=await readFile(new URL("../components/city-premium-showcase.tsx",import.meta.url),"utf8");
 assert.match(source,/items.map/);assert.match(source,/hidden=\{!visible\}/);assert.match(source,/<ShowcaseImage/);
 assert.match(source,/premiumPreparedIndexes\(carouselItems.length/);
 assert.match(source,/Date.parse\(item.expiresAt\) > deadlineNow/);
});

test("header retains the existing search route and fields",async()=>{
 const source=await readFile(new URL("../components/header.tsx",import.meta.url),"utf8");
 assert.match(source,/className="header-search-row"[\s\S]*className="publish-button"[\s\S]*className="header-search"/);
 assert.match(source,/action="\/search"/);assert.match(source,/name="city"/);assert.match(source,/name="category"/);
});
