import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import sharp from "sharp";
import { listingThumbnailUrl } from "../lib/media/listing-thumbnail.ts";

const key="listings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/00-12345678901234567890.jpg";
const url="https://jevu.test/api/media/"+key;
const data=code=>"data:text/javascript;base64,"+Buffer.from(code).toString("base64");
const fixture=data('const f=()=>globalThis.__thumbnailTest; export const createSupabasePublicServerClient=()=>f().publicClient; export const createSupabaseServerClient=async()=>f().privateClient; export const getListingMediaBucket=()=>f().bucket; export const getListingImageProcessor=()=>f().processor;');
const source=await readFile(new URL("../app/api/media/[...key]/route.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from ["']([^"']+)["']/g,(_,name)=>{
 if(["@/lib/supabase/server","@/lib/media/bucket","@/lib/media/photo-service"].includes(name))return "from "+JSON.stringify(fixture);
 return "from "+JSON.stringify(new URL("../"+name.slice(2)+".ts",import.meta.url).href);
});
const {GET}=await import(data(code));
const original=await sharp({create:{width:1920,height:2560,channels:3,background:"#529bc6"}}).jpeg().toBuffer();
function setup({isPublic=true,authenticated=true,privateRow=true,processorError=false}={}){
 const state={r2Reads:0,transforms:[],outputs:[],auth:0};
 const client=row=>({auth:{getUser:async()=>{state.auth++;return{data:{user:authenticated?{id:"owner"}:null},error:null}}},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:row?{mime_type:"image/jpeg"}:null,error:null})})});
 state.publicClient=client(isPublic);state.privateClient=client(privateRow);
 state.bucket={get:async()=>{state.r2Reads++;return {body:new Response(original).body,httpEtag:'"original"'}}};
 state.processor={input(stream){let resize;return {transform(options){resize=options;state.transforms.push(options);return this},async output(options){state.outputs.push(options);if(processorError)throw Error("processor down");const bytes=Buffer.from(await new Response(stream).arrayBuffer());const out=await sharp(bytes).resize(resize.width,resize.height,{fit:resize.fit}).webp({quality:options.quality}).toBuffer();return{response:()=>new Response(out,{headers:{"content-type":"image/webp"}})}}}}};
 globalThis.__thumbnailTest=state;return state;
}
const get=(suffix="?variant=card")=>GET(new Request(url+suffix),{params:Promise.resolve({key:key.split("/")})});

test("thumbnail URLs use the same media path and one stable bounded variant",()=>{
 assert.equal(listingThumbnailUrl(null),null);
 assert.equal(listingThumbnailUrl("/api/media/"+key),"/api/media/"+key+"?variant=card");
 assert.equal(listingThumbnailUrl("/api/media/"+key+"?variant=card"),"/api/media/"+key+"?variant=card");
});
test("authorized thumbnail decodes to 768x576 WebP; no writes or original response",async()=>{
 const s=setup();const response=await get("&unused");
 assert.equal(response.status,200);assert.match(response.headers.get("content-type"),/jpeg/);
 const thumb=await get("?variant=card&width=99999");const bytes=Buffer.from(await thumb.arrayBuffer());
 assert.equal(thumb.status,200);assert.equal(thumb.headers.get("content-type"),"image/webp");
 const info=await sharp(bytes).metadata();assert.equal(info.width,768);assert.equal(info.height,576);
 assert.deepEqual(s.transforms,[{width:768,height:576,fit:"cover"}]);
 assert.ok(bytes.length<original.length);assert.match(thumb.headers.get("cache-control"),/private, no-store/);
 assert.notEqual(thumb.headers.get("etag"),'"original"');assert.equal(s.auth,0);
});
test("normal photo delivery is unchanged and does not invoke the processor",async()=>{
 const s=setup();const r=await get("");assert.deepEqual(Buffer.from(await r.arrayBuffer()),original);assert.equal(s.transforms.length,0);
});
test("private thumbnail retains authenticated RLS path and no-store/vary",async()=>{
 const s=setup({isPublic:false});const r=await get();assert.equal(r.status,200);assert.equal(s.auth,1);assert.match(r.headers.get("vary"),/Cookie, Authorization/);assert.match(r.headers.get("cache-control"),/no-store/);
});
test("inaccessible or removed images never read R2 or call the processor",async()=>{
 for(const authenticated of [true,false]){const s=setup({isPublic:false,authenticated,privateRow:false});assert.equal((await get()).status,404);assert.equal(s.r2Reads,0);assert.equal(s.transforms.length,0);}
});
test("thumbnail processor failure returns a safe error, never a heavy original fallback",async()=>{
 setup({processorError:true});const r=await get();assert.equal(r.status,503);assert.equal(await r.text(),"Media unavailable");
});
