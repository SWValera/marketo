import assert from 'node:assert/strict';
import test from 'node:test';
import {Miniflare,createFetchMock} from 'miniflare';
import {resolve} from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
const fixtureOrigin=process.env.JEVU_TEST_PUBLIC_SUPABASE_URL??'https://reference-test.supabase.co';
const fixtureKey=process.env.JEVU_TEST_PUBLIC_SUPABASE_KEY??'sb_publishable_reference_test';

test('built auth recovery and signup redirects work in workerd with isolated session cookies',async()=>{
 const mock=createFetchMock();mock.disableNetConnect();
 const user={id:'10000000-0000-4000-8000-000000000001',email:'fixture@example.test',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-09-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-01T00:00:00Z'};
 const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'fixture'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.');
 const session={access_token:jwt,refresh_token:'fixture-refresh-only',expires_in:3600,token_type:'bearer',user};
 let fail=false,authError=null,exchangeError=null,verifications=0,users=0,exchanges=0;
 mock.get(fixtureOrigin).intercept({path:'/auth/v1/token?grant_type=pkce',method:'POST'}).reply(()=>{exchanges++;return {statusCode:exchangeError?400:200,data:JSON.stringify(exchangeError??session),responseOptions:{headers:{'content-type':'application/json'}}};}).persist();
 mock.get(fixtureOrigin).intercept({path:'/auth/v1/verify',method:'POST'}).reply(()=>{verifications++;return {statusCode:authError?429:fail?403:200,data:JSON.stringify(authError??(fail?{code:'otp_expired',msg:'Email link is invalid or has expired'}:session)),responseOptions:{headers:{'content-type':'application/json'}}};}).persist();
 mock.get(fixtureOrigin).intercept({path:'/auth/v1/user',method:'GET'}).reply(()=>{users++;return {statusCode:200,data:JSON.stringify(user),responseOptions:{headers:{'content-type':'application/json'}}};}).persist();
 mock.get(fixtureOrigin).intercept({path:/^\/rest\//,method:'GET'}).reply(200,'[]',{headers:{'content-type':'application/json','content-range':'*/0'}}).persist();
 const root=resolve('dist/server'),paths=(await readdir(root,{recursive:true})).filter(p=>p.endsWith('.js')&&p!=='index.js');
 const modules=await Promise.all(['index.js',...paths].map(async p=>({type:'ESModule',path:resolve(root,p),contents:await readFile(resolve(root,p),'utf8')})));
 const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',fetchMock:mock,bindings:{NEXT_PUBLIC_SUPABASE_URL:fixtureOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixtureKey},serviceBindings:{ASSETS:()=>new Response('not found',{status:404})}});
 try{
  const verifier='sb-'+new URL(fixtureOrigin).hostname.split('.')[0]+'-auth-token-code-verifier=base64-'+Buffer.from(JSON.stringify('fixture-verifier/recovery')).toString('base64url');
  const pkce=await mf.dispatchFetch('https://jevu.kz/api/auth/callback?flow=recovery&code=fixture-code',{redirect:'manual',headers:{cookie:verifier}});assert.equal(pkce.status,307);assert.equal(new URL(pkce.headers.get('location')).pathname,'/auth/update-password',JSON.stringify({exchanges,location:pkce.headers.get('location')}));assert.equal(exchanges,1);
  const r=await mf.dispatchFetch('https://jevu.kz/api/auth/callback?type=recovery&token_hash=fixture',{redirect:'manual'});
  assert.equal(r.status,307);assert.equal(r.headers.get('location'),'https://jevu.kz/auth/update-password?next=%2Flogin%3Fpassword_reset%3Dsuccess');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(verifications,1);
  const cookies=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.ok(cookies.includes('-auth-token='),'verified callback must persist session for this browser');
  const update=await mf.dispatchFetch('https://jevu.kz/auth/update-password',{headers:{cookie:cookies}});assert.equal(update.status,200);const html=await update.text();assert.match(html,/Создайте новый пароль/);assert.equal((html.match(/type="password"/g)??[]).length,2);assert.ok(users>=1);
  const anonymous=await mf.dispatchFetch('https://jevu.kz/auth/update-password',{redirect:'manual'});assert.equal(anonymous.status,307);assert.match(anonymous.headers.get('location'),/\/login\?mode=recover&auth_error=invalid$/);
  fail=true;
  for(let i=0;i<2;i++){
   const used=await mf.dispatchFetch('https://jevu.kz/api/auth/callback?type=recovery&token_hash=fixture',{redirect:'manual'});assert.equal(used.status,307);assert.match(used.headers.get('location'),/auth_error=expired/);assert.equal(used.headers.getSetCookie().length,0);
  }
  const invalid=await mf.dispatchFetch('https://jevu.kz/login?mode=recover&auth_error=expired',{headers:{cookie:cookies},redirect:'manual'});assert.equal(invalid.status,200);assert.match(await invalid.text(),/Срок действия ссылки истёк/);
  const success=await mf.dispatchFetch('https://jevu.kz/login?password_reset=success');assert.equal(success.status,200);assert.match(await success.text(),/Пароль успешно изменён. Войдите с новым паролем/);
  const noToken=await mf.dispatchFetch('https://jevu.kz/api/auth/callback?flow=recovery',{redirect:'manual'});assert.equal(noToken.status,307);assert.match(noToken.headers.get('location'),/auth_error=invalid/);
  exchangeError={code:'bad_code_verifier',msg:'invalid code'};
  const badCode=await mf.dispatchFetch('https://jevu.kz/api/auth/callback?flow=recovery&code=bad',{redirect:'manual',headers:{cookie:verifier}});assert.equal(badCode.status,307);assert.match(badCode.headers.get('location'),/auth_error=invalid/);exchangeError=null;
  authError={code:'over_request_rate_limit',msg:'Rate limit'};
  const rate=await mf.dispatchFetch('https://jevu.kz/api/auth/callback?type=recovery&token_hash=fixture',{redirect:'manual'});assert.equal(rate.status,307);assert.match(rate.headers.get('location'),/auth_error=rate_limited/);authError=null;
  for(const [kind,ru] of [['rate_limited','Слишком много попыток'],['unavailable','Не удалось выполнить операцию']]){const page=await mf.dispatchFetch('https://jevu.kz/login?mode=recover&auth_error='+kind,{headers:{cookie:cookies},redirect:'manual'});assert.equal(page.status,200);assert.ok((await page.text()).includes(ru));}
  const legacy=await mf.dispatchFetch('https://jevu.kz/auth/callback?flow=recovery',{redirect:'manual'});assert.equal(legacy.headers.get('location'),noToken.headers.get('location'));assert.equal(legacy.headers.get('cache-control'),'no-store');
  fail=false;
  const signup=await mf.dispatchFetch('https://jevu.kz/api/auth/callback?type=signup&token_hash=fixture',{redirect:'manual'});assert.equal(signup.status,307);assert.match(signup.headers.get('location'),/^https:\/\/jevu.kz\/auth\/result\?event=signup-confirmed/);
 }finally{await mf.dispose();await mock.close();}
});
