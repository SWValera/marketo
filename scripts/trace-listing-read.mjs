// Read-only diagnostic of the production artifact against PUBLIC Supabase data.
// Source the ignored production build environment. Never records bodies/keys/IDs.
import './lib/register-cloudflare-node-shim.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const phase=process.argv[2]??'before';
assert.match(phase,/^[a-z-]+$/);
const origin=process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(origin&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,'Public build environment required');
const output='artifacts/performance-followup';await mkdir(output,{recursive:true});
const listing=process.env.JEVU_PERF_LISTING_PATH??JSON.parse(await readFile('artifacts/pwa-removal/http-before.json','utf8')).listing;
assert.ok(listing.startsWith('/listing/')&&!/["'<>\\]/.test(listing),'A public listing path is required');
const realFetch=globalThis.fetch;
const allowed=new Set(['listings','listing_attribute_values','listing_attribute_option_values','category_attributes','category_attribute_options','seller_profiles']);
let calls=[],start=0;
globalThis.fetch=async(input,init)=>{
 const request=new Request(input,init),url=new URL(request.url),table=url.pathname.split('/').at(-1);
 assert.equal(url.origin,new URL(origin).origin,'Only configured public Supabase origin');
 assert.equal(request.method,'GET','No mutations/auth operations in this diagnostic');
 assert.ok(url.pathname.startsWith('/rest/v1/')&&allowed.has(table),'Unexpected data read');
 const call={table,start_ms:performance.now()-start};calls.push(call);
 const response=await realFetch(request);call.headers_ms=performance.now()-start;call.status=response.status;
 // Buffering here measures upstream body completion; these JSON reads already
 // need the complete body. Content is neither logged nor persisted.
 const bytes=await response.arrayBuffer();call.end_ms=performance.now()-start;call.bytes=bytes.byteLength;
 return new Response(bytes,{status:response.status,headers:response.headers});
};
const artifact=resolve(process.env.JEVU_TRACE_ARTIFACT??'dist');
const {default:worker}=await import(pathToFileURL(artifact+'/server/index.js'));
const samples=[];
try{for(let i=0;i<3;i++){
 calls=[];start=performance.now();
 const response=await worker.fetch(new Request('https://jevu.kz'+listing,{headers:{accept:'text/html'}}),{ASSETS:{fetch:async()=>new Response(null,{status:404})}},{waitUntil(){},passThroughOnException(){}});
 const headers_ms=performance.now()-start,html=await response.text();
 assert.equal(response.status,200);assert.ok(html.includes('listing-gallery'));assert.ok(!html.includes('data-marketo-error="true"'));
 samples.push({headers_ms,complete_ms:performance.now()-start,bytes:Buffer.byteLength(html),calls});
 console.log(JSON.stringify({phase,repeat:i,headers_ms,complete_ms:samples.at(-1).complete_ms,calls}));
}}finally{globalThis.fetch=realFetch;}
await writeFile(`${output}/listing-trace-${phase}.json`,JSON.stringify({conditions:'Compiled production Worker in Node on Mac; real anonymous public Supabase reads. NOT a measurement inside the deployed Cloudflare isolate. No session or private data. Network timing includes TLS/connection reuse.',samples},null,2));
