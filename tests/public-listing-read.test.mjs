import assert from 'node:assert/strict';
import test from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {getListingDetailByRouteKey,publicListingAttributeRecords,PUBLIC_LISTING_DETAIL_SELECT} from '../lib/data/supabase/listings.ts';

test('public detail embeds only the used values/dictionaries, without wildcard/private fields',()=>{
 assert.ok(!PUBLIC_LISTING_DETAIL_SELECT.includes('*'));
 for(const field of ['listing_attribute_values(','listing_attribute_option_values(','category_attributes(','category_attribute_options('])assert.ok(PUBLIC_LISTING_DETAIL_SELECT.includes(field));
 for(const field of ['moderation_reason','internal_details','contact_phone','listing_contacts','profile_private','user_roles'])assert.ok(!PUBLIC_LISTING_DETAIL_SELECT.includes(field));
});

test('embedded definitions deduplicate and retain RU/KK values; RLS-hidden relations are not invented',()=>{
 const definition={id:'attribute',key:'brand',label_ru:'Марка',label_kk:'Маркасы',is_active:true,is_visible:true};
 const option={id:'option',value:'toyota',label_ru:'Toyota',label_kk:'Toyota'};
 const row={listing_attribute_values:[{listing_id:'listing',attribute_id:'hidden',text_value:'not-displayed',category_attributes:null}],listing_attribute_option_values:[{listing_id:'listing',attribute_id:'attribute',option_id:'option',category_attributes:definition,category_attribute_options:option},{listing_id:'listing',attribute_id:'attribute',option_id:'hidden',category_attributes:definition,category_attribute_options:null}]};
 const records=publicListingAttributeRecords(row);
 assert.deepEqual(records.attributes,[definition]);assert.deepEqual(records.options,[option]);
 assert.equal(records.optionValues.length,2);
 assert.deepEqual(publicListingAttributeRecords({listing_attribute_values:[],listing_attribute_option_values:[]}),{scalarValues:[],optionValues:[],attributes:[],options:[]});
 assert.throws(()=>publicListingAttributeRecords({listing_attribute_values:null,listing_attribute_option_values:[]}),/invalid/);
});

test('new reads observe publication removal and edits, with no shared cache or session endpoint',async()=>{
 let row={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'Original',listing_images:[],listing_attribute_values:[],listing_attribute_option_values:[]};let calls=0;
 const client=createClient('https://public-fixture.invalid','fixture-publishable',{auth:{persistSession:false,autoRefreshToken:false},db:{retry:false},global:{fetch:async input=>{
  const url=new URL(input instanceof Request?input.url:input);assert.equal(url.pathname,'/rest/v1/listings');calls++;
  assert.equal(url.searchParams.get('select'),PUBLIC_LISTING_DETAIL_SELECT.replaceAll(' ',''));
  return Response.json(row?[row]:[]);
 }}});
 const key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-original';
 assert.equal((await getListingDetailByRouteKey(client,key)).title,'Original');
 row={...row,title:'Edited'};assert.equal((await getListingDetailByRouteKey(client,key)).title,'Edited');
 // RLS returns no public row after archive/delete/expiry; do not resurrect one.
 row=null;assert.equal(await getListingDetailByRouteKey(client,key),null);assert.equal(calls,3);
});
