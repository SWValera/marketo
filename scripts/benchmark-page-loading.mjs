// Same built Worker and existing fixtures as the integration tests. No live accounts.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const phase=process.argv[2]??'before';
if(!['before','after','routes'].includes(phase))throw new Error('before|after|routes');
const fixtureUrl=new URL('../tests/rendered-html.test.mjs',import.meta.url);
const source=(await readFile(fixtureUrl,'utf8')).split('test("Home streams')[0];
let calls=[];
const delay=40;
let user;
globalThis.__auditWrap=(original)=>async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.hostname!=='reference-test.supabase.co')throw new Error('Non-fixture network forbidden: '+url.hostname);
  const start=performance.now();
  await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,delay);init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(init.signal.reason);},{once:true});});
  calls.push({path:url.pathname,start,end:performance.now()});
  if(url.pathname==='/auth/v1/user')return Response.json(user);
  if(url.pathname.endsWith('/get_my_conversation_inbox'))return Response.json({items:[],total:0});
  if(url.pathname.endsWith('/get_my_account_profile'))return Response.json({id:user.id,display_name:'Fixture User',avatar_path:null,settlement_id:null,bio:null,verified_at:null,language_code:'ru',status:'active',contact_phone_e164:null});
  return original(input,init);
};
const instrumented=source.replace('const workerUrl =', 'globalThis.fetch=globalThis.__auditWrap(globalThis.fetch);\nconst workerUrl =');
const fixtureRuntimeUrl=process.env.MARKETO_AUDIT_WORKER_ROOT?pathToFileURL(resolve(process.env.MARKETO_AUDIT_WORKER_ROOT,'tests/rendered-html.test.mjs')):fixtureUrl;
const fixture=await import('data:text/javascript;base64,'+Buffer.from(instrumented.replaceAll('import.meta.url',JSON.stringify(fixtureRuntimeUrl.href))+'\nexport {worker,env,ctx,ids,referenceTables};').toString('base64'));
user={id:fixture.ids.seller,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const session={access_token:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture',refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
const cookie='sb-reference-test-auth-token=base64-'+Buffer.from(JSON.stringify(session)).toString('base64url');
fixture.referenceTables.get_my_account_profile=[{id:user.id,display_name:'Fixture User',avatar_path:null,settlement_id:null,bio:null,verified_at:null,language_code:'ru',status:'active',contact_phone_e164:null}];
for (const row of fixture.referenceTables.listings) {
  row.created_at = row.published_at; row.updated_at = row.published_at;
  row.expires_at = '2099-01-01T00:00:00Z';
}
const results=[];
const primaryPaths=['/','/categories','/category/transport','/search',`/listing/${fixture.referenceTables.listings[0].id}-${fixture.referenceTables.listings[0].slug}`,`/seller/${fixture.ids.seller}`,'/profile','/favorites','/messages','/notifications','/settings','/help'];
const paths=phase==='routes'?[...primaryPaths,'/admin',`/admin/${fixture.referenceTables.listings[0].id}`,'/auth/registration-confirmed','/auth/result','/auth/update-password','/login','/messages/new',`/messages/${fixture.ids.seller}`,'/offline','/profile/delete','/profile/edit','/publish',`/category/transport?city=${fixture.ids.astana}&page=2&sort=cheap&q=car`,'/category/cars','/category/missing','/search?q=phone&page=2&min=100','/profile?tab=archived&page=2','/favorites?page=2','/messages?page=2','/notifications?filter=unread&page=2',`/seller/${fixture.ids.seller}?page=2`,'/missing-route']:primaryPaths;
const repetitions=phase==='routes'?1:20;
for(const auth of ['guest','fixture-user'])for(const path of paths){
  const samples=[];const requestCounts=[];let errors=0;let example=[];
  const responses=[];
  for(let i=0;i<repetitions;i++){
    calls=[];const start=performance.now();
    const response=await fixture.worker.fetch(new Request('http://localhost'+path,{headers:{accept:'text/html',cookie:auth==='fixture-user'?cookie:''}}),fixture.env,fixture.ctx);
    const headers=performance.now()-start;const html=await response.text();
    if(auth==='fixture-user' && path==='/profile' && !html.includes('Fixture User'))throw new Error('Authenticated profile fixture not rendered');
    if(phase!=='routes' && /data-marketo-error="true"/.test(html))throw new Error('Error screen is not a successful benchmark sample: '+path);
    responses.push({status:response.status,location:response.headers.get('location'),errorScreen:/data-marketo-error="true"/.test(html)});
    const duration=performance.now()-start;
    if(response.status!==200||/data-dgst="[^"]+"/.test(html))errors++;
    samples.push({headers,completeBody:duration});requestCounts.push(calls.length);if(i===0)example=calls.map(c=>({path:c.path,start:c.start-start,end:c.end-start}));
  }
  const times=samples.map(s=>s.completeBody).sort((a,b)=>a-b);
  results.push({auth,path,n:repetitions,p50:times[Math.ceil(repetitions*.5)-1],p95:times[Math.ceil(repetitions*.95)-1],max:times.at(-1),errors,requestCounts,example,samples,responses});
  console.log(JSON.stringify({phase,auth,path,p95:times[18],requests:requestCounts[0],errors}));
}
await mkdir('artifacts/performance-20260908',{recursive:true});
await writeFile(`artifacts/performance-20260908/benchmark-${phase}.json`,JSON.stringify({phase,conditions:'Node production Worker, fixture upstream 40ms per request, no real browser; complete HTML body is a server metric, NOT useful browser readiness',results},null,2));
