import assert from 'node:assert/strict';
import test from 'node:test';
import {Miniflare,createFetchMock} from 'miniflare';
import {resolve} from 'node:path';
import {readdir,readFile} from 'node:fs/promises';

// Match public build configuration; all outgoing requests remain mocked.
const fixtureOrigin=process.env.JEVU_TEST_PUBLIC_SUPABASE_URL??'https://reference-test.supabase.co';
const fixtureKey=process.env.JEVU_TEST_PUBLIC_SUPABASE_KEY??'sb_publishable_reference_test';

test('production artifact serves guest routes with request-local deadlines in real workerd',async()=>{
  const mock=createFetchMock();mock.disableNetConnect();
  mock.get(fixtureOrigin).intercept({path:/.*/,method:'GET'}).reply(200,'[]',{headers:{'content-type':'application/json','content-range':'*/0'}}).persist();
  const root=resolve('dist/server');
  const paths=(await readdir(root,{recursive:true})).filter(p=>p.endsWith('.js')&&p!=='index.js');
  const modules=await Promise.all(['index.js',...paths].map(async path=>({type:'ESModule',path:resolve(root,path),contents:await readFile(resolve(root,path),'utf8')})));
  const mf=new Miniflare({modules,modulesRoot:root,
    compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',fetchMock:mock,
    bindings:{NEXT_PUBLIC_SUPABASE_URL:fixtureOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixtureKey},
    serviceBindings:{ASSETS:()=>new Response('not found',{status:404})},
  });
  try{
    for(const path of ['/profile','/favorites','/messages','/settings','/categories','/']){
      const response=await mf.dispatchFetch('https://marketo.test'+path);
      assert.equal(response.status,200,path);
      const html=await response.text();
      assert.match(html,/<main/);assert.doesNotMatch(html,/data-dgst="[^"]+"/);
    }
  }finally{await mf.dispose();await mock.close();}
});
