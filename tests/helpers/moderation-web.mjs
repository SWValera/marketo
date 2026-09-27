// Compiled Worker + isolated staff/session fixtures. No production network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function moderationWeb({latency=0}={}){
 const host=new URL(process.env.JEVU_TEST_PUBLIC_SUPABASE_URL??'https://reference-test.supabase.co').hostname;
 const user={id:'5abcdef0-0000-4000-8000-000000000001',email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 const cookie='sb-'+host.split('.')[0]+'-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user})).toString('base64url');
 const id='60000000-0000-4000-8000-000000000001';let anonymous=false;let calls=[],f,decision='HUMAN_REVIEW',manualDecision=null,mutationError=false,staff=true;
 const trace={version:'jevu-automatic-1',basis:'technical_hold',provider_status:'invalid_schema',schema_validated:false,observations:[],timeline:[{code:'SUBMITTED',status:'PASS',duration_ms:null},{code:'AI_ANALYSIS',status:'FAILED',duration_ms:6468}],category:null,ocr_images:0,vision_images:0};
 const summary=()=>({current_revision:'a'.repeat(64),owner_controls:true,effective_state:manualDecision==='APPROVE'?'manual_approved':manualDecision==='REJECT'?'manual_rejected':manualDecision==='NEEDS_FIX'?'needs_fix':'technical',label_code:manualDecision==='APPROVE'?'manual_approved':manualDecision==='REJECT'?'manual_rejected':manualDecision==='NEEDS_FIX'?'needs_fix':'technical',manual_decision:manualDecision});
 const audit=()=>({run:{id:'70000000-0000-4000-8000-000000000001',content_revision_hash:'a'.repeat(64),decision:'HUMAN_REVIEW',decision_basis:'technical_hold',engine_version:'jevu-moderation-3',ruleset_version:'fixture',created_at:'2026-09-27T06:22:00Z',automatic_trace:trace,ai_calls:[]},current_revision:'a'.repeat(64),owner_controls:true,history:[],findings:[],overrides:[]});
 const wrap=original=>async(input,init)=>{
  const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(u.hostname,host,'isolated fixture only');calls.push(u.pathname);
  if(latency)await new Promise(r=>setTimeout(r,latency));
  if(u.pathname==='/auth/v1/user')return Response.json(anonymous?null:user);
  if(u.pathname.includes('/rpc/moderation_')&&(!staff||anonymous))return Response.json({code:'42501',message:'staff required'},{status:403});
  if(u.pathname.endsWith('/user_roles'))return Response.json(staff?[{user_id:user.id,role:'admin'},{user_id:user.id,role:'moderator'}]:[]);
  if(u.pathname.endsWith('/get_my_account_profile'))return Response.json({id:user.id,display_name:'Fixture moderator',status:'active',language_code:'ru'});
  if(u.pathname.endsWith('/get_profile_for_staff'))return Response.json([{id:user.id,display_name:'Fixture seller',status:'active'}]);
  if(u.pathname.endsWith('/moderation_case')){const row=f.referenceTables.listings[0];return Response.json({...row,seller_name:'Fixture seller',city_ru:'Астана',city_kk:'Астана',category_path:[{ru:'Телевизоры',kk:'Теледидарлар'}],images:row.listing_images,attributes:[],summary:{run_id:audit().run.id,decision:'HUMAN_REVIEW',status:'completed',created_at:audit().run.created_at,current_revision:'a'.repeat(64),owner_controls:true,manual_decision:manualDecision,basis:'technical_hold',provider_status:manualDecision?null:'invalid_schema',...summary()}});}
  if(u.pathname.endsWith('/get_listing_moderation')||u.pathname.endsWith('/moderation_staff_audit'))return Response.json(audit());
  if(u.pathname.endsWith('/moderation_admin'))return Response.json({metrics:{runs_total:1},switches:{auto_approve:true,auto_reject:true,automatic_enabled:true}});
  if(u.pathname.endsWith('/moderation_dashboard'))return Response.json({total:1,owner_controls:true,items:[{...f.referenceTables.listings[0],id,created_at:'2026-09-27T06:22:00Z',seller_name:'Fixture seller',category_ru:'Телевизоры',category_kk:'Теледидарлар',city_ru:'Астана',city_kk:'Астана',image_key:null,decision:'HUMAN_REVIEW',effective_state:summary().effective_state,label_code:summary().label_code,manual_decision:manualDecision,decision_basis:'technical_hold',run_status:'completed',overridden:false}]});
  if(u.pathname.endsWith('/moderate_listing')||u.pathname.endsWith('/moderate_listing_checked')){
   if(mutationError)return Response.json({code:'40001',message:'stale revision'},{status:409});
   const b=JSON.parse(init.body);manualDecision=b.decision.toUpperCase();f.referenceTables.listings[0].status=b.decision==='approve'?'active':'rejected';decision=b.decision==='approve'?'APPROVED':b.decision==='reject'?'REJECTED':'NEEDS_FIX';return Response.json({id,status:decision==='APPROVED'?'active':'rejected',decision:manualDecision,revision:'a'.repeat(64),override_id:'80000000-0000-4000-8000-000000000001',summary:summary()});
  }
  if(u.pathname.endsWith('/my_moderation_statuses'))return Response.json(Object.fromEntries(f.referenceTables.listings.map(r=>[r.id,{...summary(),run_id:null,status:manualDecision?'APPROVED':'HUMAN_REVIEW',reasons:[] }])));
  if(u.pathname.endsWith('/get_seller_verification'))return Response.json({verified:false});
  if(u.pathname.endsWith('/profiles'))return Response.json([{id:user.id,display_name:'Fixture seller',status:'active'}]);
  return original(input,init);
 };
 globalThis.__moderationWebWrap=wrap;
 const url=new URL('../rendered-html.test.mjs',import.meta.url);
 let source=(await readFile(url,'utf8')).split('test("Home streams')[0];
 source=source.replace('const workerUrl =','globalThis.fetch=globalThis.__moderationWebWrap(globalThis.fetch);\nconst workerUrl =').replaceAll('import.meta.url',JSON.stringify(url.href));
 f=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {worker,env,ctx,referenceTables};').toString('base64'));
 f.referenceTables.listings=f.referenceTables.listings.slice(0,1);
 for(const row of f.referenceTables.listings){row.owner_id=user.id;row.updated_at='2026-09-27T06:22:00Z';row.expires_at='2099-10-27T06:22:00Z';row.status='pending';row.created_at='2026-09-27T06:22:00Z';row.categories={...row.categories,parent_id:null};row.listing_images=row.listing_images.map((x,i)=>({...x,id:'90000000-0000-4000-8000-'+String(i+1).padStart(12,'0')}));}
 return {...f,id,cookie,audit,calls:()=>calls,clear:()=>{calls=[];},setAnonymous:value=>{anonymous=value;},setStaff:value=>{staff=value;},failMutation:value=>{mutationError=value;},async render(path){calls=[];const start=performance.now();const response=await f.worker.fetch(new Request('http://localhost'+path,{headers:{accept:'text/html',cookie}}),f.env,f.ctx);const html=await response.text();return {status:response.status,html,ms:Math.round(performance.now()-start),calls:[...calls]};}};
}
