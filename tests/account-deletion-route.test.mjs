import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {isSameOriginMutationRequest} from '../lib/http/same-origin.ts';
const code=ts.transpileModule(await readFile(new URL('../app/api/account/delete/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const actor='10000000-0000-4000-8000-000000000001',capability='a'.repeat(64);
function fixture({loggedIn=true,passwordValid=true,beginError=null,resumeCookie,workflow='completed',workflowError}={}){
  const calls=[],savedCookies=[];
  const gateway={rpc:async(name,args)=>{calls.push([name,args]);return {data:null,error:beginError};},auth:{admin:{deleteUser:async()=>{throw Error('Real Auth operation must not run in this test');}}}};
  const modules={
    'next/server':{NextResponse:{json:(body,init)=>{const r=Response.json(body,init);r.cookies={set:(...args)=>savedCookies.push(args)};return r;}}},
    'next/headers':{cookies:async()=>({get:()=>resumeCookie?{value:resumeCookie}:undefined})},
    '@/lib/http/same-origin':{isSameOriginMutationRequest},
    '@/lib/supabase/server':{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:loggedIn?{id:actor,email:'synthetic@example.invalid'}:null},error:null})}})},
    '@/lib/supabase/server-env':{getServerSupabasePublicConfig:()=>({url:'https://synthetic.invalid',publishableKey:'public-test'}),getServerSupabaseSecretConfig:()=>({url:'https://synthetic.invalid',secretKey:'server-test'})},
    '@supabase/supabase-js':{createClient:(url,key)=>key==='server-test'?gateway:{auth:{signInWithPassword:async options=>{calls.push(['verify',options.email]);return {data:{user:passwordValid?{id:actor}:null,session:passwordValid?{}:null},error:passwordValid?null:{code:'bad_password'}};},signOut:async()=>{calls.push(['verification-signout']);return {error:null};}}}},
    '@/lib/media/bucket':{getListingMediaBucket:()=>{throw Error('Real storage must not be used');}},
    '@/lib/account/deletion':{runAccountDeletionBatch:async(deps,hash)=>{calls.push(['workflow',hash]);if(workflowError)throw workflowError;return workflow;}},
  };
  const route={};new Function('require','exports',code)(name=>{assert.ok(name in modules,name);return modules[name];},route);
  return {calls,savedCookies,run:({body={password:'synthetic-password',confirmation:'DELETE'},origin='https://marketo.test',contentType='application/json',raw}={})=>route.POST(new Request('https://marketo.test/api/account/delete',{
    method:'POST',headers:{Origin:origin,'Content-Type':contentType},body:raw??JSON.stringify(body)}))};
}
test('initial deletion verifies current identity, delivers recovery cookie, and never erases Auth/media yet',async()=>{
  const f=fixture(),r=await f.run();assert.equal(r.status,202);assert.deepEqual(await r.json(),{status:'pending'});assert.match(r.headers.get('cache-control'),/private, no-store/);
  assert.equal(f.calls.filter(c=>c[0]==='workflow').length,0);
  const begin=f.calls.find(c=>c[0]==='begin_account_deletion');assert.equal(begin[1].p_user_id,actor);assert.match(begin[1].p_token_hash,/^[a-f0-9]{64}$/);
  assert.equal(f.savedCookies.length,1);const [name,value,options]=f.savedCookies[0];assert.equal(name,'__Host-marketo-account-deletion');assert.match(value,/^[a-f0-9]{64}$/);
  assert.deepEqual(options,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:3600});assert.notEqual(value,begin[1].p_token_hash);
});
test('CSRF, spoofed target, malformed payload and oversized body never reach deletion',async()=>{
  for(const input of [{origin:'https://evil.invalid'},{body:{password:'x',confirmation:'DELETE',userId:actor}},
    {body:{resume:true,password:'x'}},{body:{password:'x',confirmation:'YES'}},{contentType:'text/plain'},{raw:'x'.repeat(4097)},{raw:'{'}]){
    const f=fixture(),r=await f.run(input);assert.ok([400,403].includes(r.status));assert.equal(f.calls.length,0);assert.equal(f.savedCookies.length,0);
  }
});
test('missing login, wrong password and assisted/configuration blockers do not issue a recovery cookie',async()=>{
  for(const [options,status] of [[{loggedIn:false},401],[{passwordValid:false},403],[{beginError:{code:'P0002'}},409],[{beginError:{code:'PGRST202'}},503]]){
    const f=fixture(options),r=await f.run();assert.equal(r.status,status);assert.equal(f.savedCookies.length,0);assert.equal(f.calls.some(c=>c[0]==='workflow'),false);
    if(options.loggedIn===false||options.passwordValid===false)assert.equal(f.calls.some(c=>c[0]==='begin_account_deletion'),false);
  }
});
test('resume works after Auth erasure and keeps a short completion receipt for a lost response body',async()=>{
  for(const status of ['pending','completed']){
    const f=fixture({loggedIn:false,resumeCookie:capability,workflow:status}),r=await f.run({body:{resume:true}});
    assert.equal(r.status,status==='completed'?200:202);assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'workflow');
    assert.equal(f.savedCookies[0][2].maxAge,status==='completed'?300:3600);
  }
  for(const resumeCookie of [undefined,'bad']){const f=fixture({resumeCookie}),r=await f.run({body:{resume:true}});assert.equal(r.status,401);assert.equal(f.calls.length,0);}
});
test('lost external response is resumable, while a revoked capability asks for confirmation',async()=>{
  for(const [error,status,ttl] of [[new Error('synthetic timeout'),503,3600],[{code:'42501'},409,0]]){
    const f=fixture({resumeCookie:capability,workflowError:error}),r=await f.run({body:{resume:true}});assert.equal(r.status,status);assert.equal(f.savedCookies[0][2].maxAge,ttl);assert.notEqual((await r.json()).status,'completed');
  }
});
