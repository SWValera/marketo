import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {safeInternalPath} from '../lib/auth/redirect.ts';
import {classifyAuthCallbackError} from '../lib/auth/callback-error.ts';

async function callback(error=null) {
 const calls=[];
 const source=await readFile(new URL('../app/auth/callback/route.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const modules={
  'next/server':{NextResponse:{redirect:(url,init={})=>new Response(null,{status:307,headers:{...init.headers,location:String(url)}})}},
  '@/lib/auth/redirect':{safeInternalPath},'@/lib/auth/callback-error':{classifyAuthCallbackError},
  '@/lib/auth/registration-handoff':{depositRegistrationCode:async()=>{calls.push('deposit');return true;}},
  '@/lib/supabase/server':{createSupabaseServerClient:async()=>({auth:{
   exchangeCodeForSession:async()=>{calls.push('exchange');return {error};},
   verifyOtp:async()=>{calls.push('verify');return {error};},
  }})},
 };
 const exports={};new Function('require','exports',code)(name=>{assert.ok(name in modules,name);return modules[name];},exports);
 return {calls,get:query=>exports.GET(new Request('https://jevu.kz/auth/callback'+query))};
}
for(const [query,operation] of [['?flow=recovery&code=fixture','exchange'],['?type=recovery&token_hash=fixture','verify']]){
 test(`recovery ${operation} preserves native HTTP redirect and safe headers`,async()=>{
  const f=await callback(),r=await f.get(query+'&next=https://evil.invalid');
  assert.equal(r.status,307);const u=new URL(r.headers.get('location'));
  assert.equal(u.origin,'https://jevu.kz');assert.equal(u.pathname,'/auth/update-password');assert.equal(u.searchParams.get('next'),'/login?password_reset=success');
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.deepEqual(f.calls,[operation]);
 });
}
for(const [kind,error,expected] of [['expired',{code:'otp_expired',message:'Token expired'},'expired'],['invalid',{code:'bad_code_verifier',message:'Invalid verifier'},'invalid'],['used',{code:'flow_state_not_found',message:'Flow state not found'},'invalid']]){
 test(`${kind} recovery link returns safe Russian UI state without tokens or external redirect`,async()=>{
  const f=await callback(error),r=await f.get('?flow=recovery&code=fixture&next=//evil.invalid');
  const u=new URL(r.headers.get('location'));assert.equal(u.origin,'https://jevu.kz');assert.equal(u.pathname,'/login');assert.equal(u.searchParams.get('mode'),'recover');assert.equal(u.searchParams.get('auth_error'),expected);assert.equal(u.searchParams.get('next'),'/profile');assert.equal(u.searchParams.has('code'),false);assert.equal(r.headers.get('cache-control'),'no-store');
 });
}
test('missing callback does not exchange anything, signup confirmation retains existing handoff',async()=>{
 const f=await callback();const bad=await f.get('?flow=recovery');assert.equal(new URL(bad.headers.get('location')).searchParams.get('auth_error'),'invalid');assert.deepEqual(f.calls,[]);
 const ok=await f.get('?flow=signup&code=fixture');assert.equal(new URL(ok.headers.get('location')).pathname,'/auth/result');assert.deepEqual(f.calls,['exchange']);
 const bridge=await f.get('?flow=signup&bridge=fixture&code=fixture');assert.equal(new URL(bridge.headers.get('location')).pathname,'/auth/registration-confirmed');assert.deepEqual(f.calls,['exchange','deposit']);
});
