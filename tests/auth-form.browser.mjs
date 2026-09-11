import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,access,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer,get} from 'node:http';
import {build} from 'esbuild';

// Actual React forms + SW in a browser. Auth responses are fixtures, never real accounts/emails.
const root=resolve('.'),out=resolve(process.env.JEVU_AUTH_CHECK_OUTPUT||'artifacts/jevu-auth-flow-20260911/browser');
await mkdir(out,{recursive:true});
const candidates=[process.env.JEVU_BROWSER_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].filter(Boolean);
let executable;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){executable=path;break;}
assert.ok(executable,'Installed Chromium required; no downloads');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {LoginContent} from './components/login-content';
const app=createRoot(document.getElementById('app'));let revision=0;
window.fixtureAccount=JSON.parse(localStorage.getItem('test-account')||'{"displayName":"Existing name","password":"old-password-ONLY"}');window.fixture={scenario:'new',calls:[],args:[],navigations:[]};
window.showAuth=(mode='login',scenario='new',props={},stored=null)=>{sessionStorage.clear();if(stored){sessionStorage.setItem('marketo:auth:pending-email','fixture@example.test');sessionStorage.setItem('marketo:auth:pending-flow',stored);}window.fixture={scenario,calls:[],args:[],navigations:[]};revision++;app.render(<div key={revision} data-fixture={revision}><LoginContent mode={mode} next='/profile' {...props}/></div>);return revision;};
window.showAuth();`;
const authMock=`export function getSupabaseBrowserClient(){return {auth:new Proxy({}, {get(_target,method){return async(...args)=>{const f=window.fixture;f.calls.push(method);f.args.push({method,args});const fail=(code,message,status=400)=>({data:{user:null,session:null},error:{code,message,status}});if(method==='signInWithPassword'){if(f.scenario==='password-login'&&args[0].password!==window.fixtureAccount.password)return fail('invalid_credentials','Invalid login credentials');if(f.scenario==='wrong')return fail('invalid_credentials','Invalid login credentials');if(f.scenario==='unconfirmed')return fail('email_not_confirmed','Email not confirmed');return {data:{session:{}},error:null};}if(method==='signUp'){if(f.scenario==='explicit-existing')return fail('user_already_exists','User already registered');if(f.scenario==='signup-rate')return fail('over_email_send_rate_limit','Rate limit',429);if(f.scenario==='throw')throw new Error('raw English transport failure');return {data:{session:null,user:{id:f.scenario==='existing'?'obfuscated':'fixture',identities:f.scenario==='existing'?[]:[{}]}},error:null};}if(method==='resend'&&f.scenario==='resend-rate')return fail('over_email_send_rate_limit','Rate limit',429);if(method==='updateUser'){if(f.scenario==='expired')return fail('session_not_found','Session not found');if(f.scenario==='same')return fail('same_password','New password must differ');}if(method==='updateUser'){window.fixtureAccount.password=args[0].password;localStorage.setItem('test-account',JSON.stringify(window.fixtureAccount));}if(method==='signOut'&&f.scenario==='signout-fail')return fail('unexpected_failure','Unable to sign out',500);return {data:{user:null},error:null};}}})};}`;
const plugins=[{name:'auth-fixtures',setup(b){
 const fixtures={
  'next/navigation':`const router={replace:path=>window.fixture.navigations.push(path)};export function useRouter(){return router;}`,
  '@/components/i18n-provider':`import {translate} from './lib/i18n/messages';const t=(key,values)=>translate('ru',key,values);export function useI18n(){return {locale:'ru',t};}`,
  '@/components/back-button':`export function BackButton(){return null;}`,
  '@/components/brand':`export function BrandIcon(){return null;}`,
  '@/lib/supabase/browser':authMock,
 };
 b.onResolve({filter:/^(next\/navigation|@\/components\/(i18n-provider|back-button|brand)|@\/lib\/supabase\/browser)$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path],loader:'tsx',resolveDir:root}));
}}];
const js=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'auth-browser.tsx',loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins});
const css=await readFile('app/globals.css'),sw=await readFile('public/sw.js'),serverCalls=[];
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://fixture').pathname;serverCalls.push({path,method:req.method});
 if(path==='/ordinary-offline-fixture'){req.socket.destroy();}
 else if(path==='/sw.js'){res.setHeader('Content-Type','text/javascript');res.end(sw);}
 else if(path==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js.outputFiles[0].contents);}
 else if(path==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}
 else if(path==='/offline.html'){res.setHeader('Content-Type','text/html');res.end('<h1>OFFLINE FIXTURE</h1>');}
 else if(path==='/api/auth/registration/start'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({callback:'https://jevu.kz/api/auth/callback?flow=signup&bridge=fixture'}));}
 else if(path==='/api/auth/registration/complete'){res.setHeader('Content-Type','application/json');res.end('{"state":"waiting"}');}
 else if(path==='/api/auth/registration/cancel'){res.setHeader('Content-Type','application/json');res.end('{}');}
 else if(path==='/auth/callback'||path==='/api/auth/callback'){res.writeHead(307,{location:'/auth/update-password','cache-control':'no-store'});res.end();}
 else if(path==='/guarded-fixture'){res.writeHead(307,{location:'/login?mode=recover'});res.end();}
 else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="app"></div><script src="/app.js"></script></body></html>');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(out,'browser-profile-'));
const child=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-extensions','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const json=url=>new Promise((r,j)=>get(url,res=>{let data='';res.on('data',x=>data+=x);res.on('end',()=>{try{r(JSON.parse(data));}catch(e){j(e);}});}).on('error',j));
let socket;const report=[];
try{
 let port;for(let i=0;i<100&&!port;i++){port=await readFile(join(profile,'DevToolsActivePort'),'utf8').then(x=>Number(x.split('\n')[0]),()=>0);if(!port)await delay(100);}assert.ok(port);
 const page=(await json('http://127.0.0.1:'+port+'/json/list')).find(x=>x.type==='page');
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map(),errors=[],responses=[];
 socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);if(x.error)p?.reject(new Error(JSON.stringify(x.error)));else p?.resolve(x.result);}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.exception?.description??x.params.exceptionDetails.text);else if(x.method==='Network.responseReceived'&&x.params.type==='Document')responses.push(x.params.response);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(50);}assert.fail('DOM condition timed out: '+expression+' errors='+JSON.stringify(errors)+' html='+await evaluate('document.body.innerHTML.slice(0,1500)'));};
 const show=async(mode,scenario='new',props={},stored=null)=>{await until(`typeof window.showAuth==='function'`);const rev=await evaluate(`window.showAuth(${JSON.stringify(mode)},${JSON.stringify(scenario)},${JSON.stringify(props)},${JSON.stringify(stored)})`);await until(`!!document.querySelector('[data-fixture="${rev}"]')`);await delay(100);};
 const fill=async(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing input '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const submit=async()=>{await evaluate(`document.querySelector('form').requestSubmit()`);await delay(150);};
 const clickText=async text=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent===${JSON.stringify(text)});if(!b)throw new Error('missing button');b.click();})()`);await delay(100);};
 const text=()=>evaluate('document.body.innerText');
 const credentials=async(register=false)=>{if(register)await fill('input[autocomplete="name"]','Новое имя');await fill('input[type="email"]','fixture@example.test');await fill('input[type="password"]','fixture-password-ONLY');if(register)await fill('input[type="password"]:last-of-type','fixture-password-ONLY');};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 for(const mobile of [false,true]){
  await send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:900,deviceScaleFactor:mobile?2:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});
  await send('Page.navigate',{url});await until(`typeof window.showAuth==='function'`);
  let neutral;
  for(const scenario of ['new','existing']){
   await show('register',scenario);await fill('input[autocomplete="name"]','Новое имя');await fill('input[type="email"]','fixture@example.test');await fill('input[autocomplete="new-password"]','fixture-password-ONLY');await fill('label:last-of-type input','fixture-password-ONLY');await submit();
   await until(`!!document.querySelector('.auth-pending-state')`);
   const content=await text();assert.match(content,/Если аккаунт с этим адресом ещё не создан/);assert.match(content,/Если аккаунт уже существует, войдите или восстановите пароль/);
   if(neutral)assert.equal(content,neutral,'new and obfuscated existing accounts must have identical visible outcome');neutral=content;
   assert.deepEqual(await evaluate('window.fixture.calls'),['signUp']);assert.deepEqual(await evaluate('window.fixtureAccount'),{displayName:'Existing name',password:'old-password-ONLY'});assert.equal(new URL(await evaluate('window.fixture.args[0].args[0].options.emailRedirectTo')).pathname,'/api/auth/callback');assert.equal(await evaluate(`document.querySelectorAll('input[type="password"]').length`),0);
   for(const label of ['Войти','Восстановить пароль','Отправить письмо ещё раз'])assert.ok(content.includes(label));
   await clickText('Отправить письмо ещё раз');assert.deepEqual(await evaluate('window.fixture.calls'),['signUp','resend']);assert.match(await text(),/Если отправка доступна/);
   await evaluate(`window.fixture.scenario='resend-rate'`);await clickText('Отправить письмо ещё раз');assert.match(await text(),/Слишком много попыток/);
   await clickText('Восстановить пароль');assert.equal(await evaluate(`document.querySelector('input[type="email"]').value`),'fixture@example.test');assert.equal(await evaluate(`document.querySelectorAll('input[type="password"]').length`),0);
   report.push({mobile,scenario,status:'PASS'});
  }
  for(const [scenario,expected] of [['wrong',/Неверный email или пароль/],['unconfirmed',/Email ещё не подтверждён/]]){
   await show('login',scenario);await credentials();await submit();assert.match(await text(),expected);
   if(scenario==='unconfirmed'){await clickText('Отправить письмо ещё раз');assert.ok((await evaluate('window.fixture.calls')).includes('resend'));}
   report.push({mobile,scenario,status:'PASS'});
  }
  for(const [scenario,expected] of [['explicit-existing',/Аккаунт с этим email уже существует/],['signup-rate',/Слишком много попыток/],['throw',/Не удалось выполнить операцию/]]){
   await show('register',scenario);await fill('input[autocomplete="name"]','Имя');await fill('input[type="email"]','fixture@example.test');await fill('input[autocomplete="new-password"]','fixture-password-ONLY');await fill('label:last-of-type input','fixture-password-ONLY');await submit();assert.match(await text(),expected);assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`),false);assert.doesNotMatch(await text(),/raw English|Rate limit|User already registered/);report.push({mobile,scenario,status:'PASS'});
  }
  await show('register','new');await fill('input[autocomplete="name"]','Имя');await fill('input[type="email"]','fixture@example.test');await fill('input[autocomplete="new-password"]','fixture-password-ONLY');await fill('label:last-of-type input','different-fixture-password');await submit();assert.match(await text(),/Пароли не совпадают/);assert.deepEqual(await evaluate('window.fixture.calls'),[]);
  for(const error of ['expired','invalid','rate_limited','unavailable']){
   await show('recover','new',{callbackError:error},'signup');assert.match(await text(),error==='expired'?/Срок действия ссылки истёк/:error==='rate_limited'?/Слишком много попыток/:error==='unavailable'?/Не удалось выполнить операцию/:/Ссылка недействительна/);assert.equal(await evaluate(`!!document.querySelector('.auth-pending-state')`),false);assert.equal(await evaluate(`document.querySelectorAll('input[type="password"]').length`),0);report.push({mobile,scenario:'callback-'+error,status:'PASS'});
  }
  await show('login','new',{passwordResetSuccess:true},'recovery');assert.match(await text(),/Пароль успешно изменён. Войдите с новым паролем/);assert.equal(await evaluate(`!!document.querySelector('.auth-pending-state')`),false);
  await show('recover');await fill('input[type="email"]','fixture@example.test');await submit();const recoveryUrl=new URL(await evaluate('window.fixture.args[0].args[1].redirectTo'));assert.equal(recoveryUrl.pathname,'/api/auth/callback');assert.equal(recoveryUrl.searchParams.get('flow'),'recovery');await clickText('Отправить письмо ещё раз');assert.equal(new URL(await evaluate('window.fixture.args[1].args[1].redirectTo')).pathname,'/api/auth/callback');assert.match(await text(),/Если аккаунт с этим адресом существует/);assert.doesNotMatch(await text(),/Подтвердить регистрацию/);
  for(const scenario of ['expired','same','signout-fail']){
   await show('update-password',scenario);await fill('input[autocomplete="new-password"]','fixture-password-ONLY');await fill('label:last-of-type input','fixture-password-ONLY');await submit();
   assert.match(await text(),scenario==='expired'?/Срок действия ссылки истёк/:scenario==='same'?/отличается от текущего/:/Пароль изменён, но выход не завершён/);
   if(scenario==='signout-fail'){
    assert.ok(await evaluate(`[...document.querySelectorAll('input[type="password"]')].every(x=>x.value===''&&x.disabled)`));
    await submit();assert.deepEqual(await evaluate('window.fixture.calls'),['updateUser','signOut','signOut'],'retry logout must not update password again');
    await evaluate(`window.fixture.scenario='success'`);await submit();await until(`location.search==='?password_reset=success'`);
   }
   report.push({mobile,scenario:'password-'+scenario,status:'PASS'});
  }
  await show('login','password-login');await credentials();await fill('input[type="password"]','old-password-ONLY');await submit();assert.match(await text(),/Неверный email или пароль/);await fill('input[type="password"]','fixture-password-ONLY');await submit();assert.deepEqual(await evaluate('window.fixture.navigations'),['/profile']);report.push({mobile,scenario:'new password accepted and old rejected (isolated Auth fixture)',status:'PASS'});
  await evaluate(`window.fixtureAccount.password='old-password-ONLY';localStorage.setItem('test-account',JSON.stringify(window.fixtureAccount))`);
  await show('register','new');const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,mobile?'auth-mobile.png':'auth-desktop.png'),Buffer.from(shot.data,'base64'));
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
 }
 // This exact SW controls assets, but every document redirect remains native.
 await evaluate(`navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready)`);await until(`!!navigator.serviceWorker.controller`);
 for(const [path,target,native] of [['/api/auth/callback?flow=recovery&code=fixture','/auth/update-password',true],['/auth/callback?flow=recovery&code=fixture','/auth/update-password',true],['/login?mode=recover','/login',true],['/guarded-fixture','/login',true]]){
  responses.length=0;await send('Page.navigate',{url:url+path});await until(`location.pathname===${JSON.stringify(target)}&&!!document.querySelector('form')`);assert.ok(responses.length);assert.equal(Boolean(responses.at(-1).fromServiceWorker),!native);report.push({scenario:'controlled-SW '+path.split('?')[0],status:'PASS'});
 }
 for(const [code,expected] of [['otp_expired','Срок действия ссылки истёк'],['over_request_rate_limit','Слишком много попыток']]){
  await evaluate(`history.replaceState(null,'','/login?mode=recover&auth_error=invalid#error=access_denied&error_code=${code}&error_description=RAW_PROVIDER_ERROR')`);await show('recover','new',{callbackError:'invalid'});await until(`location.hash===''`);assert.ok((await text()).includes(expected));assert.doesNotMatch(await text(),/RAW_PROVIDER_ERROR/);report.push({scenario:'provider fragment '+code,status:'PASS'});
 }
 assert.ok(await evaluate(`!!navigator.serviceWorker.controller`));report.push({scenario:'SW remains active while documents are native; optional cache tested separately',status:'PASS'});
 assert.deepEqual(errors,[]);assert.ok(serverCalls.every(x=>!x.path.includes('rest/v1')));
 await writeFile(join(out,'results.json'),JSON.stringify({status:'PASS',environment:'local Chromium real React and Service Worker; Auth fixtures; Safari engine not available',cases:report},null,2));console.log(JSON.stringify({status:'PASS',cases:report.length,output:out}));await send('Browser.close').catch(()=>{});
}finally{socket?.close();child.kill();server.close();}
