import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const id="30000000-0000-4000-8000-000000000003";
const calls=[],filters=[];
let authenticated=true,exists=true,status="active",choice="maximum",failure=null;
const client={
  auth:{getUser:async()=>({data:{user:authenticated?{id:"owner"}:null},error:null})},
  from:(table)=>{
    const query={
      select:()=>query,
      eq:(...args)=>{filters.push(args);return query;},
      is:(...args)=>{filters.push(args);return query;},
      maybeSingle:async()=>({data:table==="listings"?(exists?{id,status}:null):{promotion_type:choice},error:null})
    };return query;
  },
  rpc:async(name,args)=>{calls.push({name,args});return {error:failure};}
};
const mocks={
  "next/server":"export const NextResponse={json:(value,options)=>Response.json(value,options)};",
  "@/lib/supabase/server":"export const createSupabaseServerClient=async()=>globalThis.__promotionRouteClient;",
  "@/lib/publish/server":"export class PublishReferenceError extends Error{};export const validateStoredListingForSubmit=async()=>({status:'ready'});"
};
async function route(path){
  const result=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm",plugins:[{name:"boundaries",setup(b){
    b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:"fixture"}:null);
    b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:mocks[a.path],loader:"ts"}));
  }}]});
  return import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].contents).toString("base64"));
}
test("promotion routes validate input, owner scope and shared submission",async()=>{
  globalThis.__promotionRouteClient=client;
  const profile=await route("app/api/listings/[id]/promotion-choice/route.ts"),submit=await route("app/api/listings/[id]/submit/route.ts");
  const request=(method,body,origin="https://jevu.kz")=>new Request("https://jevu.kz/api/listings/"+id+"/promotion-choice",{method,headers:{origin,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const context={params:Promise.resolve({id})};
  try{
    const read=await profile.GET(request("GET"),context);assert.equal(read.status,200);assert.equal(read.headers.get("cache-control"),"no-store");assert.deepEqual(await read.json(),{promotionChoice:"maximum"});
    assert.ok(filters.some(([key,value])=>key==="owner_id"&&value==="owner"));assert.ok(filters.some(([key,value])=>key==="deleted_at"&&value===null));
    for(const value of ["basic","accelerated","maximum","city_premium",null]){
      calls.length=0;assert.equal((await profile.PUT(request("PUT",{promotionChoice:value}),context)).status,200);
      assert.deepEqual(calls,[{name:"set_listing_promotion_choice",args:{target_listing_id:id,promotion_choice:value}}]);
      calls.length=0;assert.equal((await submit.POST(request("POST",{promotionChoice:value}),context)).status,200);
      assert.deepEqual(calls,[{name:"submit_listing_with_promotion_choice",args:{target_listing_id:id,promotion_choice:value}}]);
    }
    for(const body of [{},{promotionChoice:"vip"},{promotionChoice:4},null]){
      calls.length=0;assert.equal((await profile.PUT(request("PUT",body),context)).status,400);
      assert.equal((await submit.POST(request("POST",body),context)).status,400);assert.equal(calls.length,0);
    }
    calls.length=0;await submit.POST(request("POST"),context);assert.deepEqual(calls,[{name:"submit_listing",args:{target_listing_id:id}}]);
    for(const [method,handler] of [["PUT",profile.PUT],["POST",submit.POST]]){
      calls.length=0;assert.equal((await handler(request(method,{promotionChoice:"basic"},"https://evil.invalid"),context)).status,403);assert.equal(calls.length,0);
      authenticated=false;assert.equal((await handler(request(method,{promotionChoice:"basic"}),context)).status,401);authenticated=true;
    }
    exists=false;assert.equal((await profile.GET(request("GET"),context)).status,404);assert.equal((await profile.PUT(request("PUT",{promotionChoice:"basic"}),context)).status,404);exists=true;
    status="archived";assert.equal((await profile.PUT(request("PUT",{promotionChoice:"basic"}),context)).status,409);status="active";
    failure={code:"42501"};assert.equal((await profile.PUT(request("PUT",{promotionChoice:"basic"}),context)).status,409);
  }finally{delete globalThis.__promotionRouteClient;}
});
