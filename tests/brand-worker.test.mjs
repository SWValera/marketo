import assert from 'node:assert/strict';
import test from 'node:test';
import {Miniflare,createFetchMock} from 'miniflare';
import {resolve} from 'node:path';
import {readdir,readFile} from 'node:fs/promises';

// Match public build configuration; all outgoing requests remain mocked.
const fixtureOrigin=process.env.JEVU_TEST_PUBLIC_SUPABASE_URL??'https://reference-test.supabase.co';
const fixtureKey=process.env.JEVU_TEST_PUBLIC_SUPABASE_KEY??'sb_publishable_reference_test';

test('compiled Cloudflare application renders JEVU metadata, logo, SEO and WWW redirect',async()=>{
 const mock=createFetchMock();mock.disableNetConnect();
 mock.get(fixtureOrigin).intercept({path:/.*/,method:'GET'}).reply(200,'[]',{headers:{'content-type':'application/json','content-range':'*/0'}}).persist();
 mock.get(fixtureOrigin).intercept({path:/.*/,method:'HEAD'}).reply(200,'',{headers:{'content-range':'*/0'}}).persist();
 const root=resolve('dist/server');
 const paths=(await readdir(root,{recursive:true})).filter(p=>p.endsWith('.js')&&p!=='index.js');
 const modules=await Promise.all(['index.js',...paths].map(async path=>({type:'ESModule',path:resolve(root,path),contents:await readFile(resolve(root,path),'utf8')})));
 const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',fetchMock:mock,
  bindings:{NEXT_PUBLIC_SUPABASE_URL:fixtureOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixtureKey},
  serviceBindings:{ASSETS:()=>new Response('not found',{status:404})},
 });
 try{
  const redirect=await mf.dispatchFetch('https://www.jevu.kz/categories?city=petropavlovsk',{redirect:'manual'});
  assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'https://jevu.kz/categories?city=petropavlovsk');
  const insecure=await mf.dispatchFetch('http://jevu.kz/categories?city=petropavlovsk',{redirect:'manual'});
  assert.equal(insecure.status,308);assert.equal(insecure.headers.get('location'),'https://jevu.kz/categories?city=petropavlovsk');
  for(const path of ['/','/categories','/search','/profile','/favorites','/messages','/login','/login?mode=register','/help']){
   const response=await mf.dispatchFetch('https://jevu.kz'+path,{headers:{host:'jevu.kz'}});assert.equal(response.status,200,path);
   const html=await response.text();
   assert.match(html,/<title>[^<]*JEVU[^<]*<\/title>/,path);
   assert.match(html,/<meta name="application-name" content="JEVU"/);
   assert.match(html,/<meta name="apple-mobile-web-app-title" content="JEVU"/);
   // Miniflare dispatch preserves the request URL but rewrites Host to its
   // loopback listener. Install assets must stay local; SEO must still be JEVU.
   assert.equal(html.match(/rel="manifest" href="([^"]+)"/)?.[1],new URL('/manifest.webmanifest',await mf.ready).href);
   assert.match(html,/https:\/\/jevu.kz\/icons\/jevu-512-v1.png/);
   const jsons=[...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m=>JSON.parse(m[1]));
   const graph=jsons.flatMap(x=>x['@graph']??[]);
   for(const type of ['Organization','WebSite','WebApplication'])assert.ok(graph.some(x=>x['@type']===type&&x.name==='JEVU'&&x.url==='https://jevu.kz'),path+type);
   const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,'');
   assert.doesNotMatch(visible,new RegExp('mar'+'keto','i'),path);
   if(path==='/'||path==='/categories')assert.match(html,new RegExp('rel="canonical" href="https://jevu.kz'+(path==='/'?'/':path)+'"'));
  }
  const robots=await mf.dispatchFetch('https://jevu.kz/robots.txt');assert.equal(robots.status,200);
  assert.match(await robots.text(),/Sitemap: https:\/\/jevu.kz\/sitemap.xml/);
  const sitemap=await mf.dispatchFetch('https://jevu.kz/sitemap.xml');assert.equal(sitemap.status,200);
  const xml=await sitemap.text();assert.match(xml,/<loc>https:\/\/jevu.kz\//);assert.doesNotMatch(xml,/https:\/\/(?!jevu.kz)/);
 }finally{await mf.dispose();await mock.close();}
});
