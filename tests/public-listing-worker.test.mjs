import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Miniflare,createFetchMock} from 'miniflare';

test('workerd: built public listing renders localized embeds in two reads, then observes removal',async()=>{
 const origin='https://reference-test.supabase.co';const mock=createFetchMock();mock.disableNetConnect();let calls=[],visible=true;
 const row={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',slug:'synthetic',title:'Synthetic phone',description:'Synthetic public listing',category_id:'category',price_minor:1000,currency_code:'KZT',published_at:'2026-01-01T00:00:00Z',expires_at:'2099-01-01T00:00:00Z',vip_until:null,x2_until:null,promoted_until:null,categories:{id:'category',slug:'phone',name_ru:'Телефоны',name_kk:'Телефондар'},settlements:{id:'city',name_ru:'Астана',name_kk:'Астана'},listing_images:[{storage_key:'synthetic/photo.jpg',sort_order:0}],listing_attribute_values:[],listing_attribute_option_values:[{listing_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',attribute_id:'a',option_id:'o',category_attributes:{id:'a',key:'condition',label_ru:'Состояние',label_kk:'Күйі',data_type:'select',is_active:true,is_visible:true,sort_order:1},category_attribute_options:{id:'o',value:'new',label_ru:'Новый',label_kk:'Жаңа'}}]};
 mock.get(origin).intercept({path:/^\/rest\/v1\//,method:'GET'}).reply(({path})=>{
  const url=new URL(path,origin),table=url.pathname.split('/').at(-1);calls.push(table);
  assert.ok(['listings','seller_profiles'].includes(table));
  return {statusCode:200,data:JSON.stringify(table==='listings'?(visible?[row]:[]):[{id:row.owner_id,display_name:'Synthetic seller'}]),responseOptions:{headers:{'content-type':'application/json'}}};
 }).persist();
 const root=resolve('dist/server'),paths=(await readdir(root,{recursive:true})).filter(p=>p.endsWith('.js'));
 const modules=await Promise.all(['index.js',...paths.filter(p=>p!=='index.js')].map(async p=>({type:'ESModule',path:resolve(root,p),contents:await readFile(resolve(root,p),'utf8')})));
 const mf=new Miniflare({host:'127.0.0.1',modules,modulesRoot:root,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],fetchMock:mock,bindings:{NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},serviceBindings:{ASSETS:()=>new Response(null,{status:404})}});
 try{
  for(const [locale,label] of [['ru','Новый'],['kk','Жаңа']]){
   calls=[];const response=await mf.dispatchFetch(`https://jevu.kz/listing/${row.id}-${row.slug}`,{headers:{cookie:'marketo-locale='+locale}});const html=await response.text();
   assert.equal(response.status,200);assert.match(html,/listing-gallery/);assert.ok(html.includes(label));assert.deepEqual(calls,['listings','seller_profiles']);
  }
  visible=false;calls=[];const missing=await mf.dispatchFetch(`https://jevu.kz/listing/${row.id}-${row.slug}`);assert.equal(missing.status,404);assert.deepEqual(calls,['listings']);
  const guarded=await mf.dispatchFetch('https://jevu.kz/admin/moderation',{redirect:'manual'});assert.equal(guarded.status,307);assert.ok(guarded.headers.get('location').includes('/login'));
 }finally{await mf.dispose();await mock.close();}
});
