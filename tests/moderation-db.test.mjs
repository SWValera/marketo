import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const owner='71000000-0000-4000-8000-000000000001',staff='72000000-0000-4000-8000-000000000002',buyer='73000000-0000-4000-8000-000000000003';
test('moderation migration, RLS, revision race, jobs, manual review, appeals and lifecycle',async t=>{
 const db=new PGlite({extensions:{pg_trgm,pgcrypto}});
 try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 grant usage on schema auth to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create publication supabase_realtime;`);
 for(const name of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()){await db.exec(await readFile('supabase/migrations/'+name,'utf8'));console.log('applied',name);}
 const as=async(user,sql,args=[])=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');try{return await db.query(sql,args)}finally{await db.exec('reset role')}};
 const service=async(sql,args=[])=>{await db.exec('set role service_role');try{return await db.query(sql,args)}finally{await db.exec('reset role')}};
 await db.exec("insert into public.countries(code,slug,name_ru,name_kk,currency_code,currency_symbol,phone_code) values('KZ','fixture-kz','KZ','KZ','KZT','T','+7') on conflict do nothing");
 await db.exec("insert into public.locales(code,name_ru,name_kk) values('ru','Russian','Russian') on conflict do nothing");
 const country=(await db.query("select id from public.countries where code='KZ'")).rows[0].id;
 const region=(await db.query("insert into public.regions(country_id,code,slug,name_ru,name_kk,kind) values($1,'moderation-test','moderation-test','Test','Test','region') returning id",[country])).rows[0].id;
 const city=(await db.query("insert into public.settlements(region_id,slug,name_ru,name_kk,kind) values($1,'moderation-test','Test','Test','city') returning id",[region])).rows[0].id;
 const category=(await db.query("select id from public.categories where slug='free-other'")).rows[0].id;
 for(const id of [owner,staff,buyer])await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{\"display_name\":\"Fixture\"}')",[id]);
 await db.query("insert into public.user_roles(user_id,role) values($1,'admin')",[staff]);
 let seq=0;
 const make=async()=>{const id=(await as(owner,"insert into public.listings(owner_id,category_id,settlement_id,slug,title,description) values($1,$2,$3,$4,'Ordinary furniture','Ordinary furniture in good condition') returning id",[owner,category,city,'moderation-fixture-'+seq++])).rows[0].id;await as(owner,"insert into public.listing_contacts(listing_id,contact_name) values($1,'Fixture')",[id]);await db.query("insert into public.listing_images(listing_id,storage_key,sort_order) values($1,$2,0)",[id,'listings/'+id+'/image.jpg']);return id;};
 const submit=id=>as(owner,'select public.submit_listing_with_promotion_choice($1,null)',[id]);
 const claim=async()=>(await service('select public.claim_moderation_job() job')).rows[0].job;
 const finish=(job,result)=>service('select public.finish_moderation_job($1,$2,$3) result',[job.id,job.claim_token,result]);
 const result={decision:'APPROVED',risk_score:0,findings:[],stages:['rules','text','privacy','fraud','category','ai_text','image_technical_0','image_semantic_0','ocr_0'].map(code=>({code,status:'PASS'})),images:[{image_index:0,sha256:'a'.repeat(64),status:'PASS',perceptual_hash:null}],provider:'fixture',provider_version:'1',ocr_provider:'fixture',ocr_version:'1',error_code:null};
 let id,job;
 await t.test('submit creates immutable revision and no browser can forge decision/rules',async()=>{
  id=await make();await submit(id);job=await claim();assert.equal(job.snapshot.title,'Ordinary furniture');assert.equal(job.content_revision_hash.length,64);
  for(const sql of ["update public.listings set status='active' where id=$1","update public.listings set published_at=now() where id=$1","select public.finish_moderation_job($1,$1,'{}')","select public.moderation_admin('settings','{\"auto_approve\":true}')","update private.moderation_runs set decision='APPROVED' where id=$1","update private.moderation_rules set enabled=false where id=$1"]){await assert.rejects(as(owner,sql,sql.includes('$1')?[id]:[]),/permission|admin|required|authorized/i)}
  await assert.rejects(as(buyer,'select public.get_listing_moderation($1)',[id]),/authorized/);
  await assert.rejects(as(buyer,"insert into public.reports(reporter_id,listing_id,reason_code) values($1,$2,'listing.fraud')",[buyer,id]),/permission/);
  await assert.rejects(service("insert into public.listing_images(listing_id,storage_key,sort_order) values($1,'late-photo.jpg',1)",[id]),/permission|edit listing/i);
  assert.equal((await finish({...job,claim_token:buyer},result)).rows[0].result,'ignored');
  await assert.rejects(finish(job,{...result,risk_score:null}),/invalid moderation result/);
 });
 await t.test('production defaults never auto-approve; missing required stages cannot approve',async()=>{
  assert.equal((await finish(job,result)).rows[0].result,'HUMAN_REVIEW');assert.equal((await db.query('select status from public.listings where id=$1',[id])).rows[0].status,'pending');
  assert.equal((await finish(job,result)).rows[0].result,'ignored');
  await assert.rejects(as(staff,"select public.moderation_admin('settings','{\"auto_approve\":true,\"reason\":\"isolated test\"}')"),/automatic approval disabled/);
  const next=await make();await submit(next);const j=await claim();assert.equal((await finish(j,{...result,stages:[]})).rows[0].result,'HUMAN_REVIEW');
 });
 await t.test('manual override records actor/reason; edit reapproval and promotion preserve lifetime/hash',async()=>{
  await assert.rejects(as(staff,"select public.moderate_listing($1,'approve',null,null)",[id]),/reason/);
  await as(staff,"select public.moderate_listing($1,'approve',null,'Reviewed all content')",[id]);
  const before=(await db.query('select * from public.listings where id=$1',[id])).rows[0];
  const hash=(await db.query('select private.moderation_hash(private.moderation_content($1)) h',[id])).rows[0].h;
  await as(owner,"select public.set_listing_promotion_choice($1,'maximum')",[id]);assert.equal((await db.query('select private.moderation_hash(private.moderation_content($1)) h',[id])).rows[0].h,hash);
  await as(owner,"select public.owner_listing_transition($1,'edit')",[id]);await as(owner,"update public.listings set title='Updated ordinary furniture' where id=$1",[id]);await submit(id);const j=await claim();assert.equal((await finish(j,result)).rows[0].result,'HUMAN_REVIEW');await as(staff,"select public.moderate_listing($1,'approve',null,'Human reapproval in shadow mode')",[id]);
  assert.equal((await finish(j,result)).rows[0].result,'ignored');const after=(await db.query('select * from public.listings where id=$1',[id])).rows[0];assert.equal(+after.published_at,+before.published_at);assert.equal(+after.expires_at,+before.expires_at);assert.ok(after.vip_until);assert.ok(after.x2_until);
 });
 await t.test('late revision A cannot publish B',async()=>{
  const target=await make();await submit(target);const a=await claim();await as(owner,"select public.owner_listing_transition($1,'edit')",[target]);await as(owner,"update public.listings set title='Revised title B' where id=$1",[target]);await submit(target);
  assert.equal((await finish(a,result)).rows[0].result,'stale');assert.equal((await db.query('select status from public.listings where id=$1',[target])).rows[0].status,'pending');const b=await claim();assert.notEqual(a.content_revision_hash,b.content_revision_hash);const rule=(await db.query("select id from private.moderation_rules where code='vape' and ruleset_version=$1",[b.ruleset_version])).rows[0].id;await finish(b,{...result,decision:'REJECTED',findings:[{rule_id:rule,finding_code:'vape',source_type:'text',confidence:1,recommended_action:'REJECTED',severity:'critical',evidence_summary:'vape',user_reason_ru:'JEVU policy',user_reason_kk:'JEVU ережесі'}]});
  const appeal=(await as(owner,'select public.appeal_listing_moderation($1,$2) id',[b.id,'Please review my ordinary furniture listing'])).rows[0].id;
  assert.equal((await as(owner,'select public.appeal_listing_moderation($1,$2) id',[b.id,'Please review my ordinary furniture listing'])).rows[0].id,appeal);
  await assert.rejects(as(owner,"select public.resolve_moderation_appeal($1,'upheld','Reason')",[appeal]),/staff/);await as(staff,"select public.resolve_moderation_appeal($1,'overturned','Human reviewed')",[appeal]);
  assert.equal((await db.query('select status from public.listings where id=$1',[target])).rows[0].status,'pending');
  assert.equal((await as(owner,'select public.get_listing_moderation($1) state',[target])).rows[0].state.status,'HUMAN_REVIEW');
  assert.equal((await db.query("select count(*)::int n from private.moderation_runs where listing_id=$1 and status in ('queued','running')",[target])).rows[0].n,0);
  await as(staff,"select public.moderate_listing($1,'needs_fix','other','Human needs a correction')",[target]);
  assert.equal((await as(owner,'select public.get_listing_moderation($1) state',[target])).rows[0].state.status,'NEEDS_FIX');
 });
 await t.test('complaints deduplicate; confirmed serious report enters human review',async()=>{
  const a=(await as(buyer,"select public.report_listing($1,'listing.fraud',null) id",[id])).rows[0].id;
  assert.equal((await as(buyer,"select public.report_listing($1,'listing.fraud',null) id",[id])).rows[0].id,a);
  await as(staff,"select public.resolve_report($1,'resolved','Human confirmed')",[a]);assert.equal((await db.query('select status from public.listings where id=$1',[id])).rows[0].status,'pending');
 });
 await t.test('rules draft/review/activation audit; immutable active rules',async()=>{
  await as(staff,"select public.moderation_admin('clone','{\"version\":\"fixture-v2\",\"reason\":\"test\"}')");
  await assert.rejects(as(staff,"select public.moderation_admin('edit','{\"version\":\"kz-policy-2026-09-26.1\",\"code\":\"vape\",\"enabled\":false,\"reason\":\"test\"}')"),/draft/);
  await as(staff,"select public.moderation_admin('review','{\"version\":\"fixture-v2\",\"reason\":\"test\"}')");await as(staff,"select public.moderation_admin('activate','{\"version\":\"fixture-v2\",\"reason\":\"test\"}')");
  assert.equal((await db.query("select count(*)::int n from private.moderation_rulesets where status='active'")).rows[0].n,1);
 });
 await t.test('revision covers price, currency, attributes and image order; lease expiry cannot publish',async()=>{
  const target=await make();const hash=async()=>(await db.query('select private.moderation_hash(private.moderation_content($1)) h',[target])).rows[0].h;
  const initial=await hash();await as(owner,'update public.listings set price_minor=123 where id=$1',[target]);assert.notEqual(await hash(),initial);
  const priced=await hash();await db.query("insert into public.listing_images(listing_id,storage_key,sort_order) values($1,'second.jpg',1)",[target]);const two=await hash();assert.notEqual(two,priced);
  await db.query('update public.listing_images set sort_order=sort_order+2 where listing_id=$1',[target]);assert.notEqual(await hash(),two);
  await submit(target);const j=await claim();await db.query("update private.moderation_runs set lease_until=now()-interval '1 second' where id=$1",[j.id]);assert.equal((await finish(j,result)).rows[0].result,'ignored');
  await service('select public.archive_expired_listings()');await db.query("update private.moderation_runs set next_attempt_at=now() where id=$1",[j.id]);const retry=await claim();assert.equal(retry.id,j.id);assert.notEqual(retry.claim_token,j.claim_token);
  await finish(retry,{...result,decision:'HUMAN_REVIEW'});
 });
 await t.test('moderator cannot change rules; inactive staff cannot override; SMS gate is fail closed',async()=>{
  await db.query("insert into public.user_roles(user_id,role) values($1,'moderator')",[buyer]);
  await as(buyer,"select public.moderation_admin('queue')");await assert.rejects(as(buyer,"select public.moderation_admin('settings','{}')"),/admin required/);
  await as(staff,"select public.moderation_admin('settings','{\"require_verified_kz_phone\":true,\"reason\":\"SMS gate fixture\"}')");
  const target=await make();await submit(target);const j=await claim();assert.equal((await finish(j,result)).rows[0].result,'HUMAN_REVIEW');
  await assert.rejects(as(buyer,"select public.moderate_listing($1,'approve',null,'Review')",[target]),/verified KZ phone/);
  await assert.rejects(as(owner,"select public.seller_phone_challenge('verified','{}')"),/permission/);
  const challenge=(await service("select public.seller_phone_challenge('create',$1) c",[{user_id:owner,phone:'+77011234567',provider:'isolated-fixture',reference:'not-a-real-sms'}])).rows[0].c;
  const payload={id:challenge.id,user_id:owner};await assert.rejects(service("select public.seller_phone_challenge('verified',$1)",[payload]),/challenge expired/);
  for(let i=0;i<5;i++)await service("select public.seller_phone_challenge('attempt',$1)",[payload]);
  await assert.rejects(service("select public.seller_phone_challenge('attempt',$1)",[payload]),/challenge expired/);
  await service("select public.seller_phone_challenge('verified',$1)",[payload]);
  await db.query("update public.profiles set status='suspended' where id=$1",[buyer]);
  await assert.rejects(as(buyer,"select public.moderate_listing($1,'approve',null,'Review')",[target]),/moderator role/);
  await db.query("update public.profiles set status='active' where id=$1",[buyer]);await as(buyer,"select public.moderate_listing($1,'approve',null,'Human review after verification')",[target]);
  await as(staff,"select public.moderation_admin('settings','{\"require_verified_kz_phone\":false,\"reason\":\"Fixture cleanup\"}')");
 });
 await t.test('worker loss and exhausted retries are manual, not approved',async()=>{
  const next=await make();await submit(next);for(let i=0;i<3;i++){const j=await claim();await service('select public.fail_moderation_job($1,$2)',[j.id,j.claim_token]);await db.exec("update private.moderation_runs set next_attempt_at=now() where status='queued'");}
  assert.equal((await db.query('select decision from private.moderation_runs where listing_id=$1',[next])).rows[0].decision,'HUMAN_REVIEW');
  const lost=await make();await submit(lost);await db.exec("update private.moderation_runs set created_at=now()-interval '16 minutes' where status='queued'");await service('select public.archive_expired_listings()');assert.equal((await db.query('select decision from private.moderation_runs where listing_id=$1',[lost])).rows[0].decision,'HUMAN_REVIEW');
 });
 await t.test('staff audit exposes immutable decisions and prior findings, never a claim token',async()=>{
  const state=(await as(staff,'select public.get_listing_moderation($1,true) audit',[id])).rows[0].audit;
  assert.ok(state.history.length>=2);assert.ok(state.history.every(r=>Array.isArray(r.findings)));
  assert.ok(!JSON.stringify(state).includes('claim_token'));assert.ok(!JSON.stringify(state).includes('rules_snapshot'));
  const q=(await as(staff,"select public.moderation_admin('queue') audit")).rows[0].audit;
  assert.ok(q.metrics.runs_total>0);assert.ok(q.appeal_count>0);assert.ok(q.override_count>0);
 });
 await t.test('shadow calls, budget, PII storage, private audit, human comparison, hashes and stale reservations',async()=>{
  await db.query("delete from public.user_roles where user_id=$1 and role='moderator'",[buyer]);
  const target=await make();await submit(target);const j=await claim();
  const rpc=(operation,payload={})=>service('select public.moderation_shadow_job($1,$2,$3,$4) value',[operation,j.id,j.claim_token,payload]);
  await assert.rejects(as(owner,"select public.moderation_shadow_job('reserve',$1,$2,'{}')",[j.id,j.claim_token]),/permission/);
  assert.equal((await rpc('reserve',{model:'gpt-5.6-luna',eligible_since:'2099-01-01'})).rows[0].value,null);
  await db.exec('update private.moderation_settings set shadow_daily_call_limit=0');
  assert.equal((await rpc('reserve',{model:'gpt-5.6-luna',eligible_since:'2026-01-01'})).rows[0].value,null);
  await db.exec('update private.moderation_settings set shadow_daily_call_limit=50');
  for(let attempt=1;attempt<=2;attempt++){
   assert.equal((await rpc('reserve',{model:'gpt-5.6-luna',eligible_since:'2026-01-01'})).rows[0].value,attempt);
   const meta={attempt,status:attempt===1?'provider_rate_limit':'success',latency_ms:123,image_count:1,input_tokens:12,output_tokens:34,request_id:'req_fixture',raw_response:'TEST CARD 4242 4242 4242 4242',api_key:'synthetic-must-not-persist'};
   assert.equal((await rpc('record',meta)).rows[0].value,true);assert.equal((await rpc('record',meta)).rows[0].value,false);
  }
  assert.equal((await rpc('reserve',{model:'gpt-5.6-luna',eligible_since:'2026-01-01'})).rows[0].value,null);
  const shadow={schema_version:'moderation-ai-observation-v1',mode:'shadow',status:'success',recommendation:'SHADOW_APPROVE',findings:[{code:'document_visible',source:'image',image_index:0,confidence:.5,action:'SHADOW_HUMAN_REVIEW',rule_code:null,reason:'RAW PII 4242 4242 4242 4242'}],languages:['ru','kk'],uncertainty:.01,ocr_images:1,subjects:[{image_index:0,object_type:'phone',confidence:.99}],raw_response:'never store'};
  assert.equal((await finish(j,{...result,shadow,images:[{...result.images[0],perceptual_hash:'0f0f0f0f0f0f0f0f',algorithm:'dhash64-v1'}]})).rows[0].result,'HUMAN_REVIEW');
  const ownerState=(await as(owner,'select public.get_listing_moderation($1,true) value',[target])).rows[0].value;assert.ok(!JSON.stringify(ownerState).includes('shadow'));assert.ok(!JSON.stringify(ownerState).includes('gpt-5'));
  await assert.rejects(as(buyer,'select public.get_listing_moderation($1,true)',[target]),/not authorized/);
  const audit=(await as(staff,'select public.get_listing_moderation($1,true) value',[target])).rows[0].value;
  assert.equal(audit.run.ai_calls.length,2);assert.equal(audit.run.ai_calls[1].input_tokens,12);assert.ok(!JSON.stringify(audit).includes('4242'));assert.ok(!JSON.stringify(audit).includes('synthetic-must'));assert.ok(!JSON.stringify(audit).includes('raw_response'));
  assert.equal((await finish(j,result)).rows[0].result,'ignored');
  await as(staff,"select public.moderate_listing($1,'approve',null,'Human agrees with shadow test')",[target]);
  const metrics=(await as(staff,"select public.moderation_admin('queue') value")).rows[0].value.metrics;
  assert.equal(metrics.ai_calls_total,2);assert.equal(metrics.ai_success,1);assert.equal(metrics.ai_human_agreement,1);assert.equal(metrics.total_evaluated,1);assert.equal(metrics.input_tokens,24);
  const next=await make();await submit(next);const second=await claim();
  const similar=(await service("select public.moderation_shadow_job('similar',$1,$2,$3) value",[second.id,second.claim_token,{sha256:'a'.repeat(64),perceptual_hash:'0f0f0f0f0f0f0f0e',algorithm:'dhash64-v1'}])).rows[0].value;assert.ok(similar.exact>=1);assert.ok(similar.perceptual>=1);
  assert.equal((await finish(second,{...result,decision:'REJECTED',shadow:{...shadow,recommendation:'SHADOW_REJECT'}})).rows[0].result,'HUMAN_REVIEW');
  const stale=await make();await submit(stale);const sj=await claim();await as(owner,"select public.owner_listing_transition($1,'edit')",[stale]);
  assert.equal((await service("select public.moderation_shadow_job('reserve',$1,$2,$3) value",[sj.id,sj.claim_token,{model:'gpt-5.6-luna',eligible_since:'2026-01-01'}])).rows[0].value,null);
  assert.equal((await finish(sj,{...result,shadow})).rows[0].result,'stale');
 });
 await t.test('existing account deletion erases listings with appeals and clears phone verification',async()=>{
  await db.query("update public.listing_images set storage_key='listings/'||$1::text||'/'||listing_id||'/'||id||'.jpg' where listing_id in (select id from public.listings where owner_id=$1::uuid)",[owner]);
  const history=(await db.query('select count(*)::int n from public.moderation_actions')).rows[0].n;
  await service('select public.begin_account_deletion($1,$2)',[owner,'f'.repeat(64)]);
  assert.equal((await db.query('select count(*)::int n from public.listings where owner_id=$1',[owner])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from private.seller_phone_verifications where user_id=$1',[owner])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from private.seller_phone_challenges where user_id=$1',[owner])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.moderation_actions')).rows[0].n,history);
 });
 }finally{await db.close()}
});
