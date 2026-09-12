import assert from 'node:assert/strict';
import test from 'node:test';
import {internalReturnPath,resolveBackTarget} from '../lib/navigation/back-target.ts';
const currentHref='https://jevu.kz/listing/car',base={currentHref,historyLength:2,fallback:'/category/cars'};
for(const source of ['/','/category/cars?sort=price','/search?q=camry&page=3#results','/#recommended','/favorites','/seller/example'])test('returns one real step to '+source,()=>{
 assert.deepEqual(resolveBackTarget({...base,previousEntry:'https://jevu.kz'+source}),{kind:'back'});
 assert.deepEqual(resolveBackTarget({...base,storedCurrent:'/listing/car',storedPrevious:source}),{kind:'back'});
 assert.deepEqual(resolveBackTarget({...base,historyLength:1,previousEntry:null,storedCurrent:'/listing/car',storedPrevious:source}),{kind:'replace',href:source});
});
test('reload uses saved exact source; stale storage cannot redirect a new direct entry',()=>{
 assert.deepEqual(resolveBackTarget({...base,storedCurrent:'/listing/car',storedPrevious:'/search?q=camry&page=3'}),{kind:'back'});
 assert.deepEqual(resolveBackTarget({...base,storedCurrent:'/other',storedPrevious:'/favorites'}),{kind:'replace',href:'/category/cars'});
});
test('known preceding entry takes priority over stale hints',()=>{
 assert.deepEqual(resolveBackTarget({...base,previousEntry:'https://jevu.kz/search?q=new',routerPrevious:'/search?q=old',storedPrevious:'/favorites'}),{kind:'back'});
});
test('new tab with no prior entry uses internal referrer without going to blank page',()=>{
 assert.deepEqual(resolveBackTarget({...base,previousEntry:null,referrer:'https://jevu.kz/seller/example'}),{kind:'replace',href:'/seller/example'});
});
test('direct or external entry uses category fallback; history length is not enough',()=>{
 for(const x of [{},{previousEntry:null},{previousEntry:'https://external.test/'},{referrer:'https://external.test/'},{routerPrevious:'/listing/car'}])assert.deepEqual(resolveBackTarget({...base,historyLength:8,...x}),{kind:'replace',href:'/category/cars'});
});
test('return URLs retain query and hash, reject cross-origin, credentials and auth tokens',()=>{
 assert.equal(internalReturnPath('/search?q=camry&page=2#results',currentHref),'/search?q=camry&page=2#results');
 for(const value of ['//external.test','https://external.test','javascript:alert(1)','/\\external.test','https://user:pass@jevu.kz/','/api/auth/callback?code=secret','/auth#access_token=secret','/auth?token_hash=secret',{},null])assert.equal(internalReturnPath(value,currentHref),null);
});

test('saved full source wins over router hint without anchor for a replacement',()=>{
 assert.deepEqual(resolveBackTarget({...base,previousEntry:null,storedCurrent:'/listing/car',storedPrevious:'/search?q=car#results',routerPrevious:'/search?q=car'}),{kind:'replace',href:'/search?q=car#results'});
});
