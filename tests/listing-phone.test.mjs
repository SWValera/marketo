import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import {isSameOriginMutationRequest} from "../lib/http/same-origin.ts";
const source = path => readFile(new URL("../"+path,import.meta.url),"utf8");
const routeSource=await source("app/api/listings/[id]/phone/route.ts");
const fixtureId="10000000-0000-4000-8000-000000000001", quotaKey="a".repeat(64);
function fixture({session=true,verified=true,verifyTask,data={state:"revealed",phone:"+77001112233"},rpcError=null}={}) {
  const calls=[],challenges=[];
  const modules={"next/server":{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    "@/lib/http/same-origin":{isSameOriginMutationRequest},
    "@/lib/phone/protection":{
      getPhoneProtectionConfig:()=>({siteKey:"public-fixture-key"}),isPhoneHostAllowed:()=>true,
      readPhoneSession:async()=>session?{quotaKey}:null,createPhoneSession:async()=>"signed-fixture-cookie",
      serializePhoneSession:value=>"__Host-marketo-phone="+value+"; Secure; HttpOnly; SameSite=Lax; Path=/",
      boundedJson:request=>request.json(),verifyPhoneChallenge:(...args)=>{challenges.push(args);return verifyTask??Promise.resolve(verified);},
      createPhoneGateway:()=>({rpc:(...args)=>{calls.push(args);return {abortSignal:signal=>{assert.ok(signal instanceof AbortSignal);return Promise.resolve({data,error:rpcError});}};}}),
    }};
  const route={};new Function("require","exports",ts.transpileModule(routeSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)
    (name=>{assert.ok(name in modules,name);return modules[name];},route);
  return {calls,challenges,run:({id=fixtureId,origin="https://marketo.test",signal,method="POST",body={token:"dummy-token"},headers={}}={})=>route[method](new Request(`https://marketo.test/api/listings/${id}/phone`,{
    method,headers:{origin,"Content-Type":"application/json",...headers},signal,...(method==="POST"?{body:JSON.stringify(body)}:{})}),{params:Promise.resolve({id})})};
}
function noStore(response) {assert.match(response.headers.get("cache-control"),/private, no-store/);}
test("guest phone needs no Auth and uses only the server-derived quota identity",async()=>{
  const f=fixture(),r=await f.run({headers:{Authorization:"spoofed",Prefer:"tx=rollback"}});assert.equal(r.status,200);noStore(r);
  assert.deepEqual(await r.json(),{phone:"+77001112233"});
  assert.deepEqual(f.calls,[["reveal_listing_phone",{target_listing_id:fixtureId,p_session_key:quotaKey}]]);
  assert.equal(f.challenges.length,1);assert.equal(f.challenges[0][1],fixtureId);
});
test("GET has only the public key; valid session is retained and no phone RPC runs",async()=>{
  for(const session of [true,false]) {const f=fixture({session}),r=await f.run({method:"GET"});noStore(r);
    assert.deepEqual(await r.json(),{siteKey:"public-fixture-key"});assert.equal(f.calls.length,0);
    assert.equal(!!r.headers.get("set-cookie"),!session);
  }
});
test("origin, ID, missing session, bad token and failed challenge never reach gateway",async()=>{
  for(const [options,input,status] of [
    [{},{origin:"https://evil.test"},403],[{},{id:"invalid"},400],[{session:false},{},403],
    [{verified:false},{},403],[{},{body:{token:""}},400],[{},{body:{token:"x",p_session_key:quotaKey}},400],
    [{},{body:{token:"x".repeat(2049)}},400],[{},{headers:{"Content-Type":"text/plain"}},400],
  ]) {const f=fixture(options),r=await f.run(input);assert.equal(r.status,status);noStore(r);assert.equal(f.calls.length,0);assert.equal((await r.json()).phone,undefined);}
});
test("quota and all negative outcomes discard any response phone",async()=>{
  for(const [options,status] of [
    [{data:{state:"limited",retry_after:56,phone:"+77001112233"}},429],[{data:{state:"denied",phone:"+77001112233"}},403],
    [{data:{state:"unavailable",phone:"+77001112233"}},404],[{rpcError:{code:"57014"}},503],
    [{data:{state:"revealed",phone:"bad"}},503],[{data:null},503],
  ]) {const r=await fixture(options).run();assert.equal(r.status,status);noStore(r);assert.equal((await r.json()).phone,undefined);if(status===429)assert.equal(r.headers.get("retry-after"),"56");}
});
test("cancelled verification cannot reach the phone RPC after its late success",async()=>{
  let resolveVerify;const verifyTask=new Promise(resolve=>{resolveVerify=resolve;});
  const f=fixture({verifyTask}),controller=new AbortController();const pending=f.run({signal:controller.signal});
  await new Promise(resolve=>setTimeout(resolve,0));controller.abort();
  assert.equal((await pending).status,503);resolveVerify(true);
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.calls.length,0);
});
test("seller saves enable calls without a checkbox, while legacy payloads remain off",async()=>{
  const form=await source("components/publish-form.tsx");
  assert.doesNotMatch(form,/setAllowPhone|checked=\{allowPhone\}|publish.allowPhone/);
  assert.match(form,/allowPhone: true/);assert.match(form,/aria-describedby="listing-phone-disclosure"/);
  assert.match(await source("lib/publish/contract.ts"),/allowPhone: z.boolean\(\).default\(false\)/);
});
test("phone display is ephemeral, never login-gated or loaded from public contact rows",async()=>{
  const options=await source("components/listing-contacts.tsx"),button=await source("components/listing-phone-button.tsx");
  assert.doesNotMatch(options,/options.phone|row.phone|tel:/);assert.match(options,/ListingPhoneButton key=\{listingId\}/);
  assert.match(button,/method: "POST"/);assert.match(button,/if \(flight.current\) return/);assert.match(button,/solvePhoneChallenge/);
  assert.match(button,/if \(controller.signal.aborted\) return/);assert.match(button,/pagehide/);assert.match(button,/pageshow/);
  assert.doesNotMatch(button,/localStorage|sessionStorage|console\.|getUser|onAuthStateChange|\/login/);
});
