import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {automaticDatabase} from './helpers/automatic-db.mjs';
import {moderate} from '../lib/moderation/engine.ts';import {UnavailableAIProvider,UnavailableOCRProvider} from '../lib/moderation/providers.ts';
import {evaluateAutomatic} from '../lib/moderation/automatic.ts';import {evaluateShadow} from '../lib/moderation/shadow.ts';
import {cleanObservation,observation} from './helpers/moderation-ai-fixtures.mjs';
const metadata={provider:'openai',model:'gpt-5.6-luna',schema_version:'moderation-ai-observation-v1',request_id:'req_synthetic',status:'success',latency_ms:10,image_count:1,input_tokens:123,output_tokens:45,retry_count:0};
test('automatic migration: actual submit -> revision -> result -> publication -> owner trace/security/lifecycle',async t=>{
 const d=await automaticDatabase(),{db,as,make,submit,claim,finish,record,hash,users}=d;
 try{
 const jpeg=await readFile('tests/moderation/benchmark/v1/images/phone.jpg');
 const evaluate=async(job,observations=cleanObservation())=>{const base=await moderate({snapshot:job.snapshot,rules:job.rules,fraud:job.fraud,ai:new UnavailableAIProvider(),ocr:new UnavailableOCRProvider(),loadImage:async()=>jpeg,allowExternal:false,lexicalAIState:'READY'});const {result,trace}=await evaluateAutomatic({base,rules:job.rules,response:{observations,metadata},providerStatus:'success',switches:{enabled:true,approval:true,rejection:true}});return {...result,automatic:trace,shadow:evaluateShadow(observations,job.rules,base)};};
 let normal,normalRun,rejected;
 await t.test('full pipeline publishes once; ledger and required stages cannot be forged by users',async()=>{
  normal=await make();await submit(normal);normalRun=await claim();assert.equal(normalRun.engine_version,'jevu-moderation-3');let result=await evaluate(normalRun);
  await assert.rejects(as(users.seller,'select public.finish_moderation_job($1,$2,$3)',[normalRun.id,normalRun.claim_token,result]),/permission/);
  for(const sql of ["update public.listings set status='active' where id=$1","update public.listings set status='rejected' where id=$1","update public.listings set published_at=now() where id=$1","insert into public.user_roles(user_id,role) values($1,'admin')","select public.assign_user_role($1,'admin',true)","select public.moderation_dashboard()","select public.moderation_admin('settings','{\"auto_approve\":true}')"])await assert.rejects(as(users.seller,sql,sql.includes('$1')?[normal]:[]),/permission|role|staff|admin/);
  await record(normalRun,metadata);assert.equal(await finish(normalRun,result),'APPROVED');assert.equal(await finish(normalRun,result),'ignored');
  const listing=(await db.query('select status,published_at,expires_at from public.listings where id=$1',[normal])).rows[0];assert.equal(listing.status,'active');assert.equal(+listing.expires_at- +listing.published_at,720*3600000);
  assert.equal((await db.query('select count(*)::int n from public.moderation_actions where listing_id=$1',[normal])).rows[0].n,1);
  const safe=(await as(users.seller,'select public.get_listing_moderation($1,true) value',[normal])).rows[0].value;assert.equal(safe.status,'APPROVED');assert.ok(!JSON.stringify(safe).includes('automatic_trace'));assert.ok(!JSON.stringify(safe).includes('openai'));
  await assert.rejects(as(users.stranger,'select public.get_listing_moderation($1,true)',[normal]),/authorized/);
  const staff=(await as(users.owner,'select public.get_listing_moderation($1,true) value',[normal])).rows[0].value;assert.equal(staff.owner_controls,true);assert.equal(staff.run.automatic_trace.schema_validated,true);assert.equal(staff.run.decision_source,'AUTOMATIC');
 });
 await t.test('AI reject is tied to active JEVU policy; owner can override both directions without rewriting run',async()=>{
  rejected=await make({title:'Одноразки',description:'Есть одноразки, разные вкусы: манго и мята.',category:'other'});await submit(rejected);const job=await claim(),o=cleanObservation();o.text_observations=[observation('possible_vape','text',null),{...observation('possible_nicotine_product','text',null),confidence:.93}];const result=await evaluate(job,o);assert.equal(result.decision,'REJECTED');await record(job,metadata);assert.equal(await finish(job,result),'REJECTED');
  await assert.rejects(as(users.moderator,"select public.moderate_listing($1,'approve',null,'ordinary moderator override')",[rejected]),/transition/);
  await as(users.owner,"select public.moderate_listing($1,'approve',null,'Owner reviewed synthetic rejected fixture')",[rejected]);assert.equal((await db.query('select decision from private.moderation_runs where id=$1',[job.id])).rows[0].decision,'REJECTED');
  const before=(await db.query('select published_at,expires_at from public.listings where id=$1',[normal])).rows[0];await as(users.owner,"select public.moderate_listing($1,'reject','other','Owner reviewed synthetic approved fixture')",[normal]);
  assert.equal((await db.query('select decision from private.moderation_runs where id=$1',[normalRun.id])).rows[0].decision,'APPROVED');
  await as(users.owner,"select public.moderate_listing($1,'approve',null,'Owner restores original approved fixture')",[normal]);assert.deepEqual((await db.query('select published_at,expires_at from public.listings where id=$1',[normal])).rows[0],before);
  const q=(await as(users.owner,"select public.moderation_admin('queue') q")).rows[0].q;assert.equal(q.metrics.auto_approve_manual_reject,1);assert.equal(q.metrics.auto_reject_manual_approve,1);
 });
 await t.test('owner editing creates revision, preserves lifecycle/promotions; stale A cannot publish B',async()=>{
  await as(users.seller,"select public.set_listing_promotion_choice($1,'maximum')",[normal]);const original=(await db.query('select published_at,expires_at,vip_until,x2_until from public.listings where id=$1',[normal])).rows[0],rev=await hash(normal);
  await assert.rejects(as(users.seller,"select public.set_listing_promotion_choice($1,'maximum')",[normal]),/promotion already active/);assert.equal(await hash(normal),rev);
  const patch={reason:'Fixture edit',expected_revision:rev,title:'Обновлённый телефон',description:'Телефон в хорошем состоянии, обновлённое описание.',price_minor:100};
  await assert.rejects(as(users.moderator,"select public.moderation_owner_listing($1,'edit',$2)",[normal,patch]),/owner permission/);
  await assert.rejects(as(users.seller,"select public.moderation_owner_listing($1,'edit',$2)",[normal,patch]),/owner permission/);
  await as(users.owner,"select public.moderation_owner_listing($1,'edit',$2)",[normal,patch]);const a=await claim();assert.notEqual(a.content_revision_hash,rev);
  const next={...patch,title:'Ещё раз обновлённый телефон',expected_revision:await hash(normal)};await as(users.owner,"select public.moderation_owner_listing($1,'edit',$2)",[normal,next]);assert.equal(await finish(a,await evaluate(a)),'ignored');
  const b=await claim();assert.notEqual(b.content_revision_hash,a.content_revision_hash);await record(b,metadata);assert.equal(await finish(b,await evaluate(b)),'APPROVED');assert.deepEqual((await db.query('select published_at,expires_at,vip_until,x2_until from public.listings where id=$1',[normal])).rows[0],original);
 });
 await t.test('missing ledger/stages, stale seller content, disabled switches, invalid trace remain unpublished',async()=>{
  for(const mode of ['ledger','stage','switch','stale']){
   const id=await make({title:'Телефон '+mode,description:'Синтетический телефон '+mode});await submit(id);const job=await claim(),result=await evaluate(job);
   if(mode!=='ledger')await record(job,metadata);
   if(mode==='stage')result.stages=result.stages.filter(s=>s.code!=='ocr_0');
   if(mode==='switch')await as(users.owner,"select public.moderation_admin('settings','{\"auto_approve\":false,\"reason\":\"Emergency switch test\"}')");
   if(mode==='stale'){await as(users.seller,"select public.owner_listing_transition($1,'edit')",[id]);await as(users.seller,"update public.listings set title='Revision B seller' where id=$1",[id]);await submit(id);}
   assert.equal(await finish(job,result),mode==='stale'?'stale':'HUMAN_REVIEW');assert.equal((await db.query('select published_at from public.listings where id=$1',[id])).rows[0].published_at,null);
   if(mode==='switch')await as(users.owner,"select public.moderation_admin('settings','{\"auto_approve\":true,\"reason\":\"End emergency switch test\"}')");
  }
 });
 await t.test('all automatic outcomes/overrides visible in owner dashboard; ordinary roles cannot mutate rules/findings',async()=>{
  const all=(await as(users.owner,"select public.moderation_dashboard('all') q")).rows[0].q;assert.ok(all.items.some(i=>i.id===normal));assert.ok(all.items.some(i=>i.id===rejected));
  const approved=(await as(users.owner,"select public.moderation_dashboard('approved') q")).rows[0].q;assert.ok(approved.items.some(i=>i.id===normal));
  for(const sql of ["update private.moderation_rules set enabled=false","update private.moderation_runs set decision='APPROVED'","insert into private.moderation_findings(run_id) values(gen_random_uuid())"])await assert.rejects(as(users.seller,sql),/permission/);
  await db.query("update public.profiles set status='suspended' where id=$1",[users.owner]);await assert.rejects(as(users.owner,'select public.moderation_dashboard()'),/staff/);await db.query("update public.profiles set status='active' where id=$1",[users.owner]);
 });
 }finally{await db.close();}
});
