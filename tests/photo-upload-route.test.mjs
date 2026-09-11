import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import sharp from 'sharp';
import {normalizeListingPhotoForUpload} from '../lib/media/client-image-normalization.ts';
import {localPhotoProcessor,photoFixture} from './helpers/photo-processor.mjs';
import '../scripts/lib/register-cloudflare-node-shim.mjs';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', listing='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const url=p=>new URL('../'+p,import.meta.url).href;
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const f=()=>globalThis.__photoRouteTest;
const fixtureUrl=data(`
const f=()=>globalThis.__photoRouteTest;
export const createSupabaseServerClient=async()=>f().client;
export const createSupabasePublicServerClient=()=>f().client;
export const createSupabaseAdminClient=()=>f().admin;
export const getListingMediaBucket=()=>f().bucket;
export const getListingImageProcessor=()=>f().processor;
export const getCurrentAuthContext=async()=>f().context;
export {photoFailure} from ${JSON.stringify(url('lib/media/photo-service.ts'))};
`);
async function route(path){
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const resolved=compiled.replace(/from ["']([^"']+)["']/g,(_,name)=>{
    if(name==='next/server') return 'from '+JSON.stringify(data('export const NextResponse=Response;'));
    if(['@/lib/supabase/server','@/lib/supabase/admin','@/lib/media/bucket','@/lib/media/photo-service','@/lib/auth/context'].includes(name))return 'from '+JSON.stringify(fixtureUrl);
    if(name.startsWith('@/'))return 'from '+JSON.stringify(url(name.slice(2)+'.ts'));
    throw Error('Unexpected route import '+name);
  });
  return import(data(resolved));
}
const upload=await route('app/api/listings/[id]/images/route.ts');
const preview=await route('app/api/photos/normalize/route.ts');
const media=await route('app/api/media/[...key]/route.ts');

test('actual routes: selection -> processor -> upload -> local workerd R2 -> metadata -> authorized display and rollback',async t=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',r2Buckets:['TEST_MEDIA'],host:'127.0.0.1'});
  const bucket=await mf.getR2Bucket('TEST_MEDIA');
  const jpeg=await photoFixture();
  function reset(){
    const state={rows:[],inserts:0,failInsert:0,failCleanup:false,readError:false,
      processor:localPhotoProcessor(),bucket,context:{status:'authenticated',accountStatus:'active',user:{id:owner}}};
    state.client={auth:{getUser:async()=>({data:{user:state.user===false?null:{id:owner}},error:null})},from(table){
      const filters={};
      return {select(){return this;},eq(k,v){filters[k]=v;return this;},
        async maybeSingle(){
          if(state.readError)return {data:null,error:Error('read failure')};
          return {data:table==='listings'?{id:listing,owner_id:state.otherOwner?'cccccccc-cccc-4ccc-8ccc-cccccccccccc':owner,status:'draft'}
            :state.rows.find(r=>r.storage_key===filters.storage_key)??null,error:null};
        },async order(){return {data:state.rows,error:null};}};
    }};
    state.admin={from(){return {insert(row){return {select(){return {async single(){
      if(++state.inserts===state.failInsert)return {data:null,error:Error('metadata failure')};
      const saved={...row,id:crypto.randomUUID()};state.rows.push(saved);return {data:saved,error:null};
    }}}};},delete(){return {async in(_key,ids){if(state.failCleanup)return {error:Error('cleanup failure')};state.rows=state.rows.filter(r=>!ids.includes(r.id));return {error:null};}};}};}};
    globalThis.__photoRouteTest=state;return state;
  }
  async function post(files){const form=new FormData();for(const file of files)form.append('photos',file);return upload.POST(new Request('https://marketo.test/api/listings/'+listing+'/images',{method:'POST',headers:{origin:'https://marketo.test'},body:form}),{params:Promise.resolve({id:listing})});}
  const photo=()=>new File([jpeg],'photo.jpg',{type:'image/jpeg'});
  try {
    await t.test('full successful pipeline with actual codecs and actual local R2',async()=>{
      const state=reset();const png=new File([await photoFixture(600,400,'png')],'camera.png',{type:'image/png'});
      const prepared=await normalizeListingPhotoForUpload(png,(_url,init)=>preview.POST(new Request('https://marketo.test/api/photos/normalize',{...init,headers:{...init.headers,origin:'https://marketo.test'}})));
      const result=await post([prepared]);assert.equal(result.status,201);
      const payload=await result.json();assert.equal(payload.images.length,1);assert.equal(state.rows.length,1);
      const key=payload.images[0].storageKey;assert.ok(await bucket.get(key));
      const displayed=await media.GET(new Request('https://marketo.test/api/media/'+key),{params:Promise.resolve({key:key.split('/')})});
      assert.equal(displayed.status,200);assert.match(displayed.headers.get('cache-control'),/no-store/);
      const bytes=Buffer.from(await displayed.arrayBuffer());assert.equal((await sharp(bytes).metadata()).width,600);
      assert.equal((await sharp(bytes).metadata()).exif,undefined);await bucket.delete(key);
    });
    await t.test('7 accepted and stored; 8th and existing + new rejected',async()=>{
      const state=reset();assert.equal((await post(Array.from({length:7},photo))).status,201);assert.equal(state.rows.length,7);
      assert.equal((await post([photo()])).status,400);assert.equal(state.rows.length,7);
      await bucket.delete(state.rows.map(r=>r.storage_key));reset();assert.equal((await post(Array.from({length:8},photo))).status,400);
    });
    await t.test('wrong owner and anonymous caller cannot process or store a photo',async()=>{
      const state=reset();state.otherOwner=true;assert.equal((await post([photo()])).status,403);assert.equal(state.inserts,0);
      state.otherOwner=false;state.user=false;assert.equal((await post([photo()])).status,401);assert.equal(state.inserts,0);
    });
    await t.test('second metadata failure rolls back this whole batch and its R2 objects',async()=>{
      const state=reset();state.failInsert=2;const result=await post([photo(),photo()]);assert.equal(result.status,503);
      assert.equal(state.rows.length,0);assert.equal((await bucket.list()).objects.length,0);
    });
    await t.test('metadata cleanup failure preserves referenced objects and reports failure honestly',async()=>{
      const state=reset();state.failInsert=2;state.failCleanup=true;const result=await post([photo(),photo()]);
      assert.equal(result.status,503);assert.equal((await result.json()).error,'photo_upload_cleanup_failed');
      assert.equal(state.rows.length,1);assert.ok(await bucket.get(state.rows[0].storage_key));
      assert.equal((await bucket.list()).objects.length,1);await bucket.delete(state.rows[0].storage_key);
    });
    await t.test('fake MIME fails before persistent storage',async()=>{
      reset();assert.equal((await post([new File([jpeg],'photo.png',{type:'image/png'})])).status,400);
      assert.equal((await bucket.list()).objects.length,0);
    });
    await t.test('preview rejects unauthenticated and cross-origin calls without persisting originals',async()=>{
      reset();f().context={status:'anonymous'};
      const request=()=>new Request('https://marketo.test/api/photos/normalize',{method:'POST',body:photo(),headers:{origin:'https://marketo.test'}});
      assert.equal((await preview.POST(request())).status,401);
      const other=new Request('https://marketo.test/api/photos/normalize',{method:'POST',body:photo(),headers:{origin:'https://evil.test'}});
      assert.equal((await preview.POST(other)).status,403);assert.equal((await bucket.list()).objects.length,0);
    });
  }finally{delete globalThis.__photoRouteTest;await mf.dispose();}
});
