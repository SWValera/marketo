import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Miniflare,createFetchMock} from 'miniflare';

test('compiled workerd: cron lazily loads the real queue and claims persisted jobs without an HTTP wake-up',async()=>{
 const root=resolve('dist/server');
 const files=(await readdir(root,{recursive:true})).filter(p=>p.endsWith('.js'));
 const modules=[{type:'ESModule',path:resolve(root,'scheduler-test.js'),contents:`import worker from './index.js';
 export default {async fetch(request,env){const pending=[];await worker.scheduled({},env,{waitUntil:p=>pending.push(p)});await Promise.all(pending);return new Response('scheduled');}};`},
  ...await Promise.all(files.map(async p=>({type:'ESModule',path:resolve(root,p),contents:await readFile(resolve(root,p),'utf8')})))];
 const network=createFetchMock();network.disableNetConnect();let claims=0;
 network.get('https://reference-test.supabase.co').intercept({path:'/rest/v1/rpc/claim_moderation_job',method:'POST'}).reply(()=>{
  claims++;return {statusCode:200,data:'null',responseOptions:{headers:{'content-type':'application/json'}}};
 });
 const mf=new Miniflare({host:'127.0.0.1',modules,modulesRoot:root,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],fetchMock:network,
  bindings:{MODERATION_FRAMEWORK_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://reference-test.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture_only'},
  serviceBindings:{ASSETS:()=>new Response(null,{status:404})}});
 try{const response=await mf.dispatchFetch('https://fixture.test/');assert.equal(await response.text(),'scheduled');assert.equal(claims,1);}
 finally{await mf.dispose();await network.close();}
});
