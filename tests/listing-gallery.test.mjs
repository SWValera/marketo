import assert from 'node:assert/strict';
import test from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {getListingDetailByRouteKey} from '../lib/data/supabase/listings.ts';
import {galleryIndex, galleryTarget} from '../lib/media/gallery-position.ts';

test('gallery positions stay in bounds during swipe, resize and repeated selection', () => {
  assert.equal(galleryIndex(0,390,7),0);
  assert.equal(galleryIndex(390,390,7),1);
  assert.equal(galleryIndex(2340,390,7),6);
  assert.equal(galleryIndex(-100,390,7),0);
  assert.equal(galleryIndex(10000,390,7),6);
  assert.equal(galleryIndex(780,780,7),1);
  for (const width of [0,NaN,Infinity]) assert.equal(galleryIndex(100,width,7),0);
  assert.equal(galleryTarget(2,7),2);
  assert.equal(galleryTarget(2,7),2);
  assert.equal(galleryTarget(-1,7),0);
  assert.equal(galleryTarget(7,7),6);
  assert.equal(galleryTarget(2,1),0);
  assert.equal(galleryTarget(1,0),0);
});

test('detail query keeps every stored photograph, ordered, for UUID and legacy slug routes', async () => {
  for (const key of ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-tablet','tablet']) {
    let requested;
    const images=Array.from({length:7},(_,i)=>({storage_key:`seller/photo-${i}.jpg`,sort_order:i}));
    const client=createClient('https://gallery.test','public-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async input=>{
      requested=new URL(input instanceof Request?input.url:input);
      const limit=requested.searchParams.get('listing_images.limit');
      return Response.json([{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',listing_images:limit?images.slice(0,Number(limit)):images}]);
    }}});
    const result=await getListingDetailByRouteKey(client,key);
    assert.equal(result.listing_images.length,7,'detail must not reuse the one-cover card limit');
    assert.equal(requested.searchParams.get('listing_images.order'),'sort_order.asc');
    assert.equal(requested.searchParams.get(key==='tablet'?'slug':'id'),key==='tablet'?'eq.tablet':'eq.bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  }
});

test('gallery query does not turn a database error into an empty album', async () => {
  const client=createClient('https://gallery.test','public-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>Response.json({code:'42501',message:'denied'},{status:403})}});
  await assert.rejects(getListingDetailByRouteKey(client,'tablet'),error=>error.code==='42501');
});
