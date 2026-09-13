import assert from "node:assert/strict";
import test from "node:test";
import { activateCityPremium, readCityPremiumOffer } from "../lib/promotions/city-premium.ts";
import { translate } from "../lib/i18n/messages.ts";
const id="10000000-0000-4000-8000-000000000001";
function client(result, calls) { return {rpc:(name,args)=>{calls.push({name,args});return {abortSignal:async signal=>{assert.ok(signal instanceof AbortSignal);return result}}}}; }
test("activation submits only listing ID and maps server capacity/payment refusals", async()=>{
 const calls=[];assert.equal(await activateCityPremium(client({data:id,error:null},calls),id),id);
 assert.deepEqual(calls,[{name:"activate_city_premium",args:{target_listing_id:id}}]);
 for(const [message,expected] of [["city premium capacity exceeded","full"],["payment required","payment"],["listing not active","activation"]]) {
   await assert.rejects(activateCityPremium(client({data:null,error:{message}},[]),id),{message:expected});
 }
});
test("offer uses server configuration, retains expired history, and propagates errors", async()=>{
 const data={product:{duration_seconds:604800,price_amount:0,capacity:15,available:0},placement:{status:"expired"},listing_active:true};
 assert.deepEqual(await readCityPremiumOffer(client({data,error:null},[]),id,new AbortController().signal),data);
 await assert.rejects(readCityPremiumOffer(client({data:null,error:{}},[]),id,new AbortController().signal));
 for(const locale of ["ru","kk"]) {
   assert.ok(translate(locale,"promotion.full",{capacity:15}).includes("15"));
   assert.ok(translate(locale,"promotion.days",{count:7}).includes("7"));
   assert.ok(translate(locale,"promotion.free").length>0);
 }
});
