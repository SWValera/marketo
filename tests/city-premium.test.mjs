import assert from "node:assert/strict";
import test from "node:test";
import { activateCityPremium, readCityPremiumOffer, CityPremiumRpcError, promotionResults } from "../lib/promotions/city-premium.ts";
import { translate } from "../lib/i18n/messages.ts";
const id="10000000-0000-4000-8000-000000000001";
function client(result,calls=[]) {return {rpc:(name,args)=>{calls.push({name,args});return {abortSignal:async signal=>{assert.ok(signal instanceof AbortSignal);return {status:200,...result}}}}};}
test("connection sends only listing ID and preserves every normal server outcome",async()=>{
 const calls=[];
 for(const status of promotionResults) {
  const data={status,reason:status==="LISTING_NOT_ELIGIBLE"?"listing_expired":undefined};
  assert.deepEqual(await activateCityPremium(client({data,error:null},calls),id),data);
 }
 assert.ok(calls.every(c=>c.name==="connect_city_premium"));
 assert.ok(calls.every(c=>JSON.stringify(c.args)===JSON.stringify({target_listing_id:id})));
});
test("technical RPC errors retain safe diagnostic code, endpoint and HTTP status",async t=>{
 const logger=t.mock.method(console,"error",()=>{});
 const error={code:"25006",message:"cannot execute SELECT FOR SHARE in a read-only transaction",details:"sensitive record values must not enter logs"};
 await assert.rejects(readCityPremiumOffer(client({data:null,error,status:405}),id,new AbortController().signal),
  e=>e instanceof CityPremiumRpcError&&e.code==="25006"&&e.httpStatus===405&&e.rpc==="get_city_premium_offer");
 assert.deepEqual(logger.mock.calls[0].arguments,["[jevu-promotion]",{rpc:"get_city_premium_offer",code:"25006",httpStatus:405}]);
});
test("known ownership/eligibility denial is not logged as a technical failure",async t=>{
 const logger=t.mock.method(console,"error",()=>{});
 await assert.rejects(readCityPremiumOffer(client({data:null,error:{code:"42501",message:"listing unavailable"},status:403}),id,new AbortController().signal),
  e=>e.eligibilityReason==="listing_unavailable");
 assert.equal(logger.mock.calls.length,0);
});
test("malformed success cannot be presented as activated",async t=>{
 t.mock.method(console,"error",()=>{});
 await assert.rejects(activateCityPremium(client({data:id,error:null}),id),e=>e instanceof CityPremiumRpcError);
});
test("offer keeps server config and history; RU/KK cover all business messages",async()=>{
 const data={product:{duration_seconds:604800,price_amount:0,capacity:15,available:0},placement:{status:"expired"},listing_active:true};
 assert.deepEqual(await readCityPremiumOffer(client({data,error:null}),id,new AbortController().signal),data);
 for(const locale of ["ru","kk"])for(const key of ["full","days","free","alreadyActive","authRequired","listingExpired","cityUnavailable","reserved","errorCode"]) {
  const text=translate(locale,"promotion."+key,{capacity:15,count:7,code:"25006"});
  assert.ok(text.length>0&&!text.startsWith("promotion."));
 }
});
