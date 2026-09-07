// Exercise the real verification source in workerd, not Node's different fetch API.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {Miniflare, createFetchMock} from 'miniflare';

const source=await readFile(new URL('../lib/phone/protection.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  transformers:{before:[()=>file=>ts.factory.updateSourceFile(file,file.statements.filter(statement=>!ts.isImportDeclaration(statement)))]},
}).outputText.replace(/^export /gm,'');
const script=`
const cloudflareEnv={};
function createClient(){throw new Error('database_not_in_scope');}
function getServerSupabaseSecretConfig(){throw new Error('database_not_in_scope');}
${compiled}
export default {async fetch(){
  try {
    const verified=await verifyPhoneChallenge('dummy-token','10000000-0000-4000-8000-000000000001',
      {siteKey:'dummy-site-key',secretKey:'dummy-test-secret',hostnames:['marketo.test']},AbortSignal.timeout(3000));
    return Response.json({verified});
  } catch(error) {return Response.json({failure:error.message==='challenge_unavailable'?'unavailable':'unexpected_failure'});}
}};`;

test('phone verification works in Cloudflare and never follows redirects with its secret',async()=>{
  const mock=createFetchMock();
  mock.disableNetConnect();
  const origin='https://challenges.cloudflare.com';
  const matched={success:true,hostname:'marketo.test',action:'listing_phone',cdata:'10000000-0000-4000-8000-000000000001'};
  let followed=false;
  mock.get('https://redirect-target.invalid').intercept({path:'/collect',method:'POST'}).reply(()=>{
    followed=true;return {statusCode:200,data:JSON.stringify(matched)};
  }).persist();
  const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],
    host:'127.0.0.1',fetchMock:mock});
  const cases=[
    {status:200,body:matched,expected:{verified:true}},
    {status:200,body:{success:false,'error-codes':['invalid-input-response']},expected:{verified:false}},
    ...[301,302,303,307,308].map(status=>({status,body:{},headers:{location:'https://redirect-target.invalid/collect'},expected:{failure:'unavailable'}})),
    {status:503,body:{},expected:{failure:'unavailable'}},
  ];
  try {
    for(const item of cases){
      let called=false;
      mock.get(origin).intercept({path:'/turnstile/v0/siteverify',method:'POST'}).reply(()=>{
        called=true;
        return {statusCode:item.status,data:JSON.stringify(item.body),responseOptions:{headers:item.headers??{}}};
      });
      const response=await mf.dispatchFetch('https://marketo.test/verify');
      assert.deepEqual(await response.json(),item.expected,'Siteverify status '+item.status);
      assert.equal(called,true,'The supported fetch must reach the mock transport');
      assert.equal(followed,false,'Never forward the verification secret to a redirect destination');
    }
  }finally{await mf.dispose();await mock.close();}
});
