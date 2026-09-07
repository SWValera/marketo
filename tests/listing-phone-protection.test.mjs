import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
async function load(file,modules) {
  const code=ts.transpileModule(await readFile(new URL("../"+file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const result={};new Function("require","exports",code)(name=>{assert.ok(name in modules,name);return modules[name];},result);return result;
}
const clientCalls=[];
const protection=await load("lib/phone/protection.ts",{
  "server-only":{},"cloudflare:workers":{env:{TURNSTILE_SITE_KEY:"dummy-public-site-key",TURNSTILE_SECRET_KEY:"dummy-private-secret-123456789",TURNSTILE_ALLOWED_HOSTNAMES:"marketo.test"}},
  "@supabase/supabase-js":{createClient:(...args)=>{clientCalls.push(args);return {}; }},
  "@/lib/supabase/server-env":{getServerSupabaseSecretConfig:()=>({url:"https://fixture.supabase.co",secretKey:"dummy-server-secret"})},
});
const config=protection.getPhoneProtectionConfig();
const request=value=>new Request("https://marketo.test/api/listings/x/phone",{headers:{cookie:"__Host-marketo-phone="+value}});
test("cookie is random, signed, stable and scoped; tampered, duplicate and expired values fail",async()=>{
  const value=await protection.createPhoneSession(config),another=await protection.createPhoneSession(config);
  assert.notEqual(value,another);assert.match(value,/^v1\.[a-f0-9]{32}\.[0-9]+\.[a-f0-9]{64}$/);
  const session=await protection.readPhoneSession(request(value),config);
  assert.match(session.quotaKey,/^[a-f0-9]{64}$/);assert.deepEqual(await protection.readPhoneSession(request(value),config),session);
  assert.notEqual((await protection.readPhoneSession(request(another),config)).quotaKey,session.quotaKey);
  for(const bad of [value.replace(/^v1\../,"v1.z"),value.slice(0,-1)+(value.endsWith("0")?"1":"0"),value+"; __Host-marketo-phone="+value]) assert.equal(await protection.readPhoneSession(request(bad),config),null);
  assert.equal(await protection.readPhoneSession(request(value),{...config,secretKey:"rotated-key"}),null);
  const now=Date.now;try{Date.now=()=>now()+86401000;assert.equal(await protection.readPhoneSession(request(value),config),null);}finally{Date.now=now;}
  assert.match(protection.serializePhoneSession(value),/Path=\/; Max-Age=86400; Secure; HttpOnly; SameSite=Lax/);
  assert.equal(protection.isPhoneHostAllowed(new Request("https://evil.test"),config),false);
  assert.equal(protection.isPhoneHostAllowed(new Request("http://marketo.test"),config),false);
});
test("siteverify checks success, hostname, action and listing binding on every call",async()=>{
  const oldFetch=globalThis.fetch,calls=[],listing="10000000-0000-4000-8000-000000000001";
  let result={success:true,hostname:"marketo.test",action:"listing_phone",cdata:listing};
  globalThis.fetch=async(...args)=>{calls.push(args);return Response.json(result);};
  try {
    assert.equal(await protection.verifyPhoneChallenge("dummy-token",listing,config,new AbortController().signal),true);
    for(const change of [{success:false},{hostname:"foreign.test"},{action:"login"},{cdata:"different-listing"}]) {
      result={success:true,hostname:"marketo.test",action:"listing_phone",cdata:listing,...change};
      assert.equal(await protection.verifyPhoneChallenge("dummy-token",listing,config,new AbortController().signal),false);
    }
    assert.equal(calls.length,5);
    for(const [url,options] of calls) {
      assert.equal(url,"https://challenges.cloudflare.com/turnstile/v0/siteverify");assert.equal(options.redirect,"manual");
      assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(),["response","secret"]);
      assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Prefer,undefined);
    }
  }finally{globalThis.fetch=oldFetch;}
});
test("request reader bounds bytes and aborts; gateway has no caller session/header input",async()=>{
  const signal=new AbortController().signal;
  assert.deepEqual(await protection.boundedJson(Response.json({token:"dummy"}),signal),{token:"dummy"});
  await assert.rejects(protection.boundedJson(new Response("x".repeat(4097)),signal));
  const c=new AbortController();c.abort();await assert.rejects(protection.boundedJson(Response.json({}),c.signal));
  protection.createPhoneGateway();
  assert.deepEqual(clientCalls[0],["https://fixture.supabase.co","dummy-server-secret",{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}]);
});
test("challenge lifecycle binds listing, removes widget and rejects cancellation/errors",async()=>{
  const challenge=await load("lib/phone/challenge.ts",{}),previous=globalThis.window;
  const rendered=[],removed=[];
  globalThis.window={turnstile:{render:(_container,options)=>{rendered.push(options);return "fixture-widget";},remove:id=>removed.push(id)}};
  try {
    const c=new AbortController(),pending=challenge.solvePhoneChallenge("dummy-site","listing-id",{},c.signal);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(rendered[0].action,"listing_phone");assert.equal(rendered[0].cData,"listing-id");assert.equal(rendered[0]["response-field"],false);
    rendered[0].callback("dummy-token");assert.equal(await pending,"dummy-token");await Promise.resolve();assert.equal(removed.length,1);
    const second=challenge.solvePhoneChallenge("dummy-site","listing-id",{},c.signal);await new Promise(resolve=>setImmediate(resolve));c.abort();await assert.rejects(second);
    const third=challenge.solvePhoneChallenge("dummy-site","listing-id",{},new AbortController().signal);await new Promise(resolve=>setImmediate(resolve));rendered[2]["error-callback"]();await assert.rejects(third);
  }finally{globalThis.window=previous;}
});
