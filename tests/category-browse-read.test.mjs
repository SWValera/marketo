import assert from 'node:assert/strict';
import test from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {listActiveCategories,listBrowseCategories,mapCategoryReferenceRows} from '../lib/data/supabase/categories.ts';

test('browse projection preserves all paginated hierarchy/search fields without publishing hints',async()=>{
 const rows=Array.from({length:1358},(_,i)=>({id:String(i),parent_id:i?'0':null,slug:'category-'+i,name_ru:'Категория '+i,name_kk:'Санат '+i,icon_key:'car',tone_key:'blue',search_placeholder_ru:'Поиск',search_placeholder_kk:'Іздеу',price_mode:'price',sort_order:i,title_placeholder_ru:'Заголовок',title_placeholder_kk:'Тақырып',description_hint_ru:'Описание формы',description_hint_kk:'Пішін сипаттамасы'}));
 let calls=[];
 const client=createClient('https://public-fixture.invalid','fixture-publishable',{auth:{persistSession:false,autoRefreshToken:false},db:{retry:false},global:{fetch:async input=>{
  const url=new URL(input instanceof Request?input.url:input);assert.equal(url.pathname,'/rest/v1/categories');assert.equal(url.searchParams.get('is_active'),'eq.true');assert.equal(url.searchParams.get('order'),'sort_order.asc,name_ru.asc,id.asc');
  const selected=url.searchParams.get('select').split(','),offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit'));calls.push({selected,offset,limit});
  return Response.json(rows.slice(offset,offset+limit).map(row=>Object.fromEntries(selected.map(key=>[key,row[key]]))));
 }}});
 const browse=mapCategoryReferenceRows(await listBrowseCategories(client));assert.equal(browse.categories.length,1358);assert.equal(calls.length,2);assert.deepEqual(calls.map(x=>x.offset).sort((a,b)=>a-b),[0,1000]);
 for(const call of calls)assert.ok(!call.selected.some(field=>/title_placeholder|description_hint/.test(field)));
 calls=[];const full=mapCategoryReferenceRows(await listActiveCategories(client));
 assert.ok(full.categories.every(row=>row.titlePlaceholder&&row.descriptionHint),'Publishing retains its complete metadata');
 assert.deepEqual(browse.categories,full.categories.map(row=>({...row,titlePlaceholder:null,descriptionHint:null})));
});

test('browse read propagates missing pages instead of returning a partial hierarchy',async()=>{
 const client=createClient('https://public-fixture.invalid','fixture-publishable',{auth:{persistSession:false,autoRefreshToken:false},db:{retry:false},global:{fetch:async()=>Response.json({code:'XX000',message:'fixture failure'},{status:503})}});
 await assert.rejects(()=>listBrowseCategories(client));
});
