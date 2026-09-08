import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

// Reuse the existing data fixtures, but execute the built Worker, proxy, React
// metadata/content render, repositories and installed SDK without substituting them.
const fixtureUrl=new URL('./rendered-html.test.mjs',import.meta.url);
const source=(await readFile(fixtureUrl,'utf8')).split('test("Home streams')[0];
let categoryFailure=true,authFailure=false,attributeFailure=false;
let listFailure=null;
let stalledProtectedPath=null;
let calls=[];
const user={id:'5abcdef0-0000-4000-8000-000000000001',email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
globalThis.__pageReadFixtureWrap=original=>async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  assert.equal(url.hostname,'reference-test.supabase.co','test must never reach live services');
  calls.push(url.pathname);
  if(url.pathname===stalledProtectedPath)return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));
  if(url.pathname==='/auth/v1/user')return authFailure?Response.json({msg:'fixture outage'},{status:503}):Response.json(user);
  if(url.pathname==='/auth/v1/token')return Response.json({access_token:token,refresh_token:'fixture-refreshed',token_type:'bearer',expires_in:3600,user});
  if(url.pathname.endsWith('/get_my_conversation_inbox'))return Response.json({items:[],total:0});
  if(url.pathname.endsWith('/get_my_account_profile'))return Response.json({id:user.id,display_name:'Fixture Account',status:'active',language_code:'ru'});
  if(categoryFailure && url.pathname.endsWith('/categories'))return Response.json({code:'08006',message:'fixture outage'},{status:503});
  if(attributeFailure && url.pathname.endsWith('/category_attributes'))return Response.json({code:'08006',message:'fixture outage'},{status:503});
  if(listFailure && url.pathname.endsWith('/search_catalog_listing_cards')){
    if(listFailure==='disconnect')throw new TypeError('fixture network disconnected');
    if(typeof listFailure==='number')return Response.json({code:'fixture',message:'temporary failure'},{status:listFailure,headers:{'retry-after':'120'}});
    if(listFailure==='headers')return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));
    return new Response(new ReadableStream({start(controller){init.signal.addEventListener('abort',()=>controller.error(init.signal.reason),{once:true});}}),{headers:{'content-type':'application/json'}});
  }
  return original(input,init);
};
const fixtureRuntimeUrl=process.env.MARKETO_AUDIT_WORKER_ROOT?pathToFileURL(resolve(process.env.MARKETO_AUDIT_WORKER_ROOT,'tests/rendered-html.test.mjs')):fixtureUrl;
const fixtureSource=source.replace('const workerUrl =','globalThis.fetch=globalThis.__pageReadFixtureWrap(globalThis.fetch);\nconst workerUrl =').replaceAll('import.meta.url',JSON.stringify(fixtureRuntimeUrl.href));
const f=await import('data:text/javascript;base64,'+Buffer.from(fixtureSource+'\nexport {worker,env,ctx,referenceTables};').toString('base64'));
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const cookie='sb-reference-test-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user})).toString('base64url');
async function render(path,authenticated=false,sessionCookie=cookie){calls=[];const response=await f.worker.fetch(new Request('https://marketo.test'+path,{headers:{accept:'text/html',cookie:authenticated?sessionCookie:''}}),f.env,f.ctx);return {response,html:await response.text()};}

test('metadata failure is not fetched again by content; next HTTP read really retries',async()=>{
  const first=await render('/category/transport');
  assert.equal(first.response.status,200);
  assert.equal(calls.filter(p=>p.endsWith('/categories')).length,2,'two parallel pagination ranges, not a second metadata/content wave');
  categoryFailure=false;
  const second=await render('/category/transport');
  assert.ok(calls.some(p=>p.endsWith('/categories')),'failure must not be cached into the next request');
  assert.match(second.html,/Легковые автомобили/);
});

test('protected pages verify identity once, still load scoped profile and roles, and do not turn outage into signed-out UI',async()=>{
  for(const path of ['/settings','/favorites','/messages','/notifications','/help']){
    const {html,response}=await render(path,true);
    assert.equal(response.status,200,path);
    assert.equal(calls.filter(p=>p==='/auth/v1/user').length,1,path);
    assert.ok(calls.includes('/rest/v1/rpc/get_my_account_profile'),path);
    assert.ok(calls.includes('/rest/v1/user_roles'),path);
    assert.match(html,/Fixture Account/,path);
  }
  authFailure=true;
  for(const path of ['/settings','/profile/delete']){
    const failed=await render(path,true);
    assert.doesNotMatch(failed.html,/Fixture Account/);
    assert.match(failed.html,/data-marketo-error/,path);
    assert.equal(calls.filter(p=>p==='/auth/v1/user').length,1);
  }
});

test('listing metadata and content share their successful detail hydration',async()=>{
  const row=f.referenceTables.listings[0];
  const {html,response}=await render(`/listing/${row.id}-${row.slug}`);
  assert.equal(response.status,200);
  assert.match(html,/SEO Seller/);
  assert.equal(calls.filter(p=>p==='/rest/v1/listings').length,1);
  assert.equal(calls.filter(p=>p==='/rest/v1/seller_profiles').length,1);
});

test('failed filter definitions never silently turn a filtered page into a broad successful list',async()=>{
  attributeFailure=true;
  for(const path of ['/category/cars?f_brand=Toyota','/search?category=cars&f_brand=Toyota']){
    const {html}=await render(path);
    assert.ok(calls.includes('/rest/v1/category_attributes'));
    assert.match(html,/data-marketo-error="true"/,path);
    assert.equal(calls.includes('/rest/v1/rpc/search_catalog_listing_cards'),false,path);
  }
  attributeFailure=false;
});

test('Worker does not turn Retry-After into an unbounded retry loop',async()=>{
  for(const status of [429,503]){
    listFailure=status;const {html}=await render('/search?q=fixture-failure');
    assert.equal(calls.filter(p=>p.endsWith('/search_catalog_listing_cards')).length,1);
    assert.match(html,/data-marketo-error="true"/);
  }
  listFailure=null;
  assert.doesNotMatch((await render('/search?q=fixture-retry')).html,/data-marketo-error="true"/);
});

for(const stage of ['headers','body'])test(`real compiled page exits a stalled ${stage} read inside its nine-second server deadline`,async()=>{
  listFailure=stage;const start=Date.now();
  const {html}=await render('/search?q=stopped-fixture');
  assert.match(html,/data-marketo-error="true"/);
  assert.ok(Date.now()-start<10000,'includes error rendering and entire response body');
  assert.equal(calls.filter(p=>p.endsWith('/search_catalog_listing_cards')).length,1);
  listFailure=null;
});

test('network disconnect is not a false empty list and a fresh page read recovers',async()=>{
  listFailure='disconnect';
  assert.match((await render('/search?q=disconnected')).html,/data-marketo-error="true"/);
  assert.equal(calls.filter(p=>p.endsWith('/search_catalog_listing_cards')).length,1);
  listFailure=null;
  assert.doesNotMatch((await render('/search?q=disconnected')).html,/data-marketo-error="true"/);
});

for(const path of ['/rest/v1/user_roles','/rest/v1/rpc/get_my_account_profile'])test(`stalled protected dependency ${path} preserves access checks and bounded retry`,async()=>{
  authFailure=false;stalledProtectedPath=path;
  const start=Date.now();
  const {html}=await render('/settings',true);
  assert.match(html,/data-marketo-error="true"/);
  assert.doesNotMatch(html,/Fixture Account/,'protected profile must not escape a failed access check');
  assert.ok(Date.now()-start<10000);
  assert.equal(calls.filter(p=>p===path).length,1);
  stalledProtectedPath=null;
  assert.match((await render('/settings',true)).html,/Fixture Account/);
});

test('read-only authentication pages share verified identity and preserve temporary errors',async()=>{
  for(const path of ['/login','/auth/result?event=signup-confirmed','/auth/update-password']){
    authFailure=false;
    await render(path,true);
    assert.equal(calls.filter(p=>p==='/auth/v1/user').length,1,path);
    authFailure=true;
    const failed=await render(path,true);
    assert.equal(failed.response.status,200,path+' must not redirect an outage into an invalid-link result');
    assert.match(failed.html,/data-marketo-error="true"/,path);
    assert.equal(calls.filter(p=>p==='/auth/v1/user').length,1,path);
  }
  authFailure=false;
});

test('authentication result page includes proxy and body in the page deadline',async()=>{
  authFailure=false;stalledProtectedPath='/auth/v1/user';
  const started=Date.now();
  const {html}=await render('/auth/result?event=signup-confirmed',true);
  assert.match(html,/data-marketo-error="true"/);
  assert.ok(Date.now()-started<10000);
  assert.equal(calls.filter(p=>p==='/auth/v1/user').length,1);
  stalledProtectedPath=null;
});

test('expired session refreshes once and still verifies identity before protected content',async()=>{
  authFailure=false;
  const expiredToken='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:user.id,exp:1})).toString('base64url')+'.fixture';
  const expiredCookie='sb-reference-test-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:expiredToken,refresh_token:'fixture-refresh',token_type:'bearer',expires_at:1,user})).toString('base64url');
  const {response,html}=await render('/settings',true,expiredCookie);
  assert.equal(response.status,200);
  assert.match(html,/Fixture Account/);
  assert.equal(calls.filter(p=>p==='/auth/v1/token').length,1);
  assert.equal(calls.filter(p=>p==='/auth/v1/user').length,1);
  assert.ok(response.headers.has('set-cookie'),'refreshed SSR cookie is returned, not dropped');
});
