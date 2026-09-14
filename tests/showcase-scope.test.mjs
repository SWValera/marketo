import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const moduleUrl=code=>"data:text/javascript;base64,"+Buffer.from(code).toString("base64");
const fixture=moduleUrl('export const createSupabasePublicServerClient=()=>globalThis.__showcaseTest.client; export const publicMediaUrl=k=>k?"/api/media/"+k:null; export const NextResponse={json:(body,init)=>Response.json(body,init)};');
const source=await readFile(new URL("../app/api/showcase/route.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from ["'][^"']+["']/g,()=>"from "+JSON.stringify(fixture));
const {GET}=await import(moduleUrl(code));
const city="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function setup({rows=[],groups={},fail=false}={}){
 const calls=[],ranges=[],filters=[];let concurrent=0,maxConcurrent=0;
 const state={calls,ranges,filters,get maxConcurrent(){return maxConcurrent},client:{
  from(table){return{select(){return this},eq(k,v){filters.push([table,k,v]);return this},lte(k,v){filters.push([table,k,"lte",v]);return this},gt(k,v){filters.push([table,k,"gt",v]);return this},order(){return this},
   range(a,b){ranges.push([a,b]);return Promise.resolve({data:rows.slice(a,b+1),error:fail?{}:null})},
   maybeSingle:async()=>({data:{id:city},error:null})}},
  async rpc(name,args){calls.push({name,args});if(name==="get_city_premium_availability")return{data:[{capacity:15}],error:null};
   concurrent++;maxConcurrent=Math.max(concurrent,maxConcurrent);await new Promise(r=>setTimeout(r,1));concurrent--;
   return{data:groups[args.p_settlement_id]??[],error:fail?{}:null}}
 }};
 globalThis.__showcaseTest=state;return state;
}
const placement=(id)=>({placement_id:"p"+id,listing_id:"l"+id,slug:"fixture",title:"fixture",price_minor:1,currency_code:"KZT",location_name_ru:"City",location_name_kk:"City",primary_image_storage_key:null,ends_at:"2099-01-01"});
test("national collects cities through public active read and reuses city RPC without national 15 cap",async()=>{
 const rows=Array.from({length:1001},(_,i)=>({settlement_id:"city"+i%6}));
 const groups=Object.fromEntries(Array.from({length:6},(_,c)=>["city"+c,Array.from({length:5},(_,i)=>placement(c*5+i))]));
 const state=setup({rows,groups});
 const response=await GET(new Request("https://jevu.test/api/showcase?city=all")),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.capacity,null);assert.equal(body.placements.length,30);
 assert.deepEqual(state.ranges,[[0,999],[1000,1999]]);assert.equal(state.calls.length,6);assert.ok(state.maxConcurrent<=4);
 assert.deepEqual(state.calls.map(c=>c.args.p_settlement_id),Object.keys(groups));
 assert.ok(state.filters.some(f=>f[1]==="promotion_type"&&f[2]==="CITY_PREMIUM"));
 assert.ok(state.filters.some(f=>f[1]==="status"&&f[2]==="active"));
 assert.ok(state.filters.some(f=>f[1]==="starts_at"&&f[2]==="lte"));
 assert.ok(state.filters.some(f=>f[1]==="ends_at"&&f[2]==="gt"));
 assert.equal(response.headers.get("cache-control"),"no-store");
});
test("national returns real city result, removes duplicates, and empty scope is empty data",async()=>{
 setup({rows:[{settlement_id:city},{settlement_id:"b"}],groups:{[city]:[placement(1),placement(2)],b:[placement(1),placement(3)]}});
 const body=await (await GET(new Request("https://jevu.test/api/showcase?city=all"))).json();
 assert.deepEqual(body.placements.map(x=>x.listingId),["l1","l2","l3"]);
 setup();assert.deepEqual((await (await GET(new Request("https://jevu.test/api/showcase?city=all"))).json()).placements,[]);
});
test("city keeps existing capacity and RPC; errors are never disguised as zero real",async()=>{
 const state=setup({groups:{[city]:[placement(1)]}});
 const response=await GET(new Request("https://jevu.test/api/showcase?city="+city)),body=await response.json();
 assert.equal(body.capacity,15);assert.equal(body.placements.length,1);
 assert.deepEqual(state.calls.map(x=>x.name),["get_city_premium_availability","get_city_premium_placements"]);
 assert.equal(state.calls[1].args.p_limit,15);
 setup({fail:true});assert.equal((await GET(new Request("https://jevu.test/api/showcase?city=all"))).status,503);
 assert.equal((await GET(new Request("https://jevu.test/api/showcase?city=invalid"))).status,400);
});