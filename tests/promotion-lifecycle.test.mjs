import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir,mkdtemp,cp,rm} from 'node:fs/promises';
import {join,resolve,sep,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

const owner='61000000-0000-4000-8000-000000000001',other='62000000-0000-4000-8000-000000000002';
const hour=3600000,day=24*hour;

test('real promotion lifecycle, moderation, 30 days, scheduled bumps, queue, security and catalog',async t=>{
 const baselineNames=(await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')&&x<'0038').sort();
 const baseline=await Promise.all(baselineNames.map(n=>readFile('supabase/migrations/'+n,'utf8')));
 const key=createHash('sha256').update(baseline.join('\n')).digest('hex');
 const cachedPath=resolve('artifacts/promotion-db-baseline-'+key);
 const readyPath=cachedPath+'.ready';
 const options={extensions:{pg_trgm,pgcrypto},initialMemory:128*1024*1024};
 if(!await readFile(readyPath).catch(()=>null)){
  assert.ok(cachedPath.startsWith(resolve('artifacts')+sep)&&basename(cachedPath).startsWith('promotion-db-baseline-'));
  await rm(cachedPath,{recursive:true,force:true});
  await mkdir(cachedPath,{recursive:true});
  const db=new PGlite(cachedPath,options);
  try {
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
   grant usage on schema auth to anon,authenticated,service_role;
   create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}'::jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create publication supabase_realtime;`);
  for(let i=0;i<baseline.length;i++){await db.exec(baseline[i]);console.log('baseline',baselineNames[i]);}
  } finally {await db.close();}
  await writeFile(readyPath,key);
 }
 // Copy a closed on-disk database instead of allocating a second WASM-sized tar.
 const directory=await mkdtemp(join(tmpdir(),'jevu-promotion-test-'));
 await cp(cachedPath,directory,{recursive:true});
 const db=new PGlite(directory,options);
 try {
  await db.exec("create function public.fixture_clock() returns timestamptz language sql stable as $$select coalesce(nullif(current_setting('test.clock',true),'' )::timestamptz,clock_timestamp())$$;grant execute on function public.fixture_clock() to anon,authenticated;");
  // The controllable clock is installed AFTER the baseline security inventory.
  // It is test-only; production accepts no caller-supplied clock or date.
  const lifecycle=(await readFile('supabase/migrations/0038_listing_promotion_lifecycle.sql','utf8')).replaceAll('clock_timestamp()','public.fixture_clock()').replaceAll('statement_timestamp()','public.fixture_clock()');
  await db.exec(lifecycle);
  await db.exec((await readFile("supabase/migrations/0039_bump_execution_freshness.sql","utf8")).replaceAll("clock_timestamp()","public.fixture_clock()").replaceAll("statement_timestamp()","public.fixture_clock()"));
  // The existing showcase reader predates 0038 and uses CURRENT_TIMESTAMP.
  // Give it the same isolated clock as lifecycle writes, without editing migrations.
  const reader=(await db.query("select pg_get_functiondef('public.get_city_premium_placements(uuid,integer)'::regprocedure) definition")).rows[0].definition;
  await db.exec(reader.replaceAll('CURRENT_TIMESTAMP','public.fixture_clock()').replaceAll('current_timestamp','public.fixture_clock()').replaceAll('statement_timestamp()','public.fixture_clock()'));
  console.log('all real migrations applied to isolated PostgreSQL');
  await db.exec(`insert into public.locales(code,name_ru,name_kk) values('ru','Russian','Russian') on conflict do nothing;
   insert into public.countries(code,slug,name_ru,name_kk,currency_code,currency_symbol,phone_code) values('KZ','fixture-kz','KZ','KZ','KZT','T','+7') on conflict do nothing;`);
  const country=(await db.query("select id from public.countries where code='KZ'")).rows[0].id;
  const region=(await db.query("insert into public.regions(country_id,code,slug,name_ru,name_kk,kind) values($1,'fixture','fixture','Test','Test','region') returning id",[country])).rows[0].id;
  const cities=[];for(const slug of ['fixture-a','fixture-b','fixture-c'])cities.push((await db.query("insert into public.settlements(region_id,slug,name_ru,name_kk,kind) values($1,$2,'Test','Test','city') returning id",[region,slug])).rows[0].id);
  const category=(await db.query("select id from public.categories where slug='free-other'")).rows[0].id;
  await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{\"display_name\":\"Owner\"}'),($2,'{\"display_name\":\"Staff\"}')",[owner,other]);
  await db.query("insert into public.user_roles(user_id,role) values($1,'moderator')",[other]);
  let sequence=0,now=Date.parse('2030-01-01T10:00:00Z');
  const clock=async instant=>{now=instant;await db.query("select set_config('test.clock',$1,false)",[new Date(now).toISOString()]);};
  await clock(now);
  const as=async(who,sql,args=[])=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');}};
  const read=async id=>(await db.query('select * from public.listings where id=$1',[id])).rows[0];
  const choice=async id=>(await db.query('select * from public.listing_promotion_choices where listing_id=$1',[id])).rows[0];
  const bumps=async id=>(await db.query('select * from private.listing_promotion_bumps where listing_id=$1 order by ordinal',[id])).rows;
  const placement=async id=>(await db.query('select * from public.city_premium_placements where listing_id=$1 order by created_at desc,id',[id])).rows;
  const pick=(id,pkg)=>as(owner,'select public.set_listing_promotion_choice($1,$2)',[id,pkg]);
  const submit=(id,pkg)=>as(owner,'select public.submit_listing_with_promotion_choice($1,$2)',[id,pkg]);
  const approve=id=>as(other,"select public.moderate_listing($1,'approve',null,null)",[id]);
  const make=async(city=cities[0])=>{
   const id=(await as(owner,"insert into public.listings(owner_id,category_id,settlement_id,slug,title,description) values($1,$2,$3,$4,'Promotion fixture','Isolated promotion lifecycle fixture') returning id",[owner,category,city,'promotion-fixture-'+sequence++])).rows[0].id;
   await as(owner,"insert into public.listing_contacts(listing_id,contact_name,allow_messages,allow_phone) values($1,'Fixture',true,false)",[id]);
   await db.query("insert into public.listing_images(listing_id,storage_key,sort_order) values($1,$2,0)",[id,'listings/'+id+'/fixture.webp']);return id;
  };
  const active=async(city=cities[0])=>{const id=await make(city);await submit(id,null);await approve(id);return id;};
  const tick=()=>db.query('select public.archive_expired_listings()');
  const time=x=>x===null?null:new Date(x).getTime();
  const report=[];
  await t.test('ordinary + no promotion: one first approval, exact 720h, no entitlements or showcase',async()=>{
   const id=await active();const row=await read(id);assert.equal(time(row.published_at),now);assert.equal(time(row.expires_at)-time(row.published_at),30*day);
   assert.equal(row.vip_until,null);assert.equal(row.x2_until,null);assert.equal(row.bumped_at,null);assert.equal((await placement(id)).length,0);assert.equal((await bumps(id)).length,0);
   const start=now;await clock(start+5*day);await as(owner,"select public.owner_listing_transition($1,'edit')",[id]);await submit(id,null);await approve(id);
   const edited=await read(id);assert.equal(time(edited.published_at),start);assert.equal(time(edited.expires_at),start+30*day);assert.equal(time(edited.created_at),time(row.created_at));
   report.push('ordinary + edit preserves first publication');
  });
  await t.test('explicit opt-out cancels pending showcase; invalid selection rolls submission back',async()=>{
   const id=await make();await pick(id,'city_premium');assert.equal((await placement(id))[0].status,'pending_approval');
   await assert.rejects(submit(id,'forever'),{code:'22023'});assert.equal((await read(id)).status,'draft');
   await submit(id,null);await approve(id);assert.equal(await choice(id),undefined);
   assert.ok((await placement(id)).every(p=>p.status==='cancelled'));assert.equal((await read(id)).vip_until,null);
   assert.equal((await bumps(id)).length,0);
  });
  for(const [pkg,duration,schedule,x2] of [['basic',3,[],false],['accelerated',7,[48,96,144],false],['maximum',7,[24,48,72,96,120,144,168],true],['city_premium',7,Array.from({length:14},(_,i)=>(i+1)*12),true]]) {
   await t.test(pkg+': approval start, complete term, exact schedule, no duplicated bumps',async()=>{
    await clock(now+40*day);const id=await make();await submit(id,pkg);
    assert.equal((await choice(id)).status,'pending_approval');assert.equal((await read(id)).vip_until,null);
    if(pkg!=='city_premium')assert.equal((await placement(id)).length,0);
    await clock(now+day);const start=now;await approve(id);const row=await read(id),selected=await choice(id);
    assert.equal(time(selected.started_at),start);assert.equal(time(row.vip_until),start+duration*day);assert.equal(time(row.x2_until),x2?start+duration*day:null);
    assert.equal(time(row.expires_at),start+30*day);assert.equal(row.bumped_at,null);
    assert.deepEqual((await bumps(id)).map(b=>(time(b.scheduled_at)-start)/hour),schedule);
    await assert.rejects(pick(id,'basic'),/promotion already active/);
    await assert.rejects(pick(id,null),/promotion already active/);
    await clock(start+hour);await as(owner,"select public.owner_listing_transition($1,'edit')",[id]);await submit(id,'maximum');await approve(id);
    assert.equal((await choice(id)).run_id,selected.run_id);assert.equal(time((await choice(id)).started_at),start);assert.equal(time((await read(id)).expires_at),start+30*day);
    for(const h of schedule){await clock(start+h*hour);await tick();await tick();assert.equal(time((await read(id)).bumped_at),now);}
    await clock(start+duration*day+1);await tick();const final=await read(id);
    assert.equal(time(final.created_at),time(row.created_at));assert.equal(time(final.published_at),start);assert.equal(final.status,'active');
    assert.equal((await choice(id)).status,'expired');assert.equal((await bumps(id)).filter(b=>b.applied_at).length,schedule.length);
    const cards=(await db.query('select vip_until,x2_until from public.catalog_listing_cards where id=$1',[id])).rows[0];assert.equal(cards.vip_until,null);assert.equal(cards.x2_until,null);
    if(pkg!=='city_premium')assert.equal((await placement(id)).length,0);
   });
  }
  for(const age of [10,25,29])await t.test('profile promotion on day '+age+' extends only when necessary',async()=>{
   await clock(now+40*day);const start=now,id=await active();await clock(start+age*day);await pick(id,'maximum');const row=await read(id);
   assert.equal(time(row.published_at),start);assert.equal(time(row.expires_at),Math.max(start+30*day,now+7*day));assert.equal(row.status,'active');
   assert.equal(time((await choice(id)).started_at),now);
  });
  await t.test('basic near expiry gives only full 72h',async()=>{
   await clock(now+40*day);const start=now,id=await active();await clock(start+29*day);await pick(id,'basic');assert.equal(time((await read(id)).expires_at),now+3*day);
  });
  await t.test('15 slots, real waiting request, full delayed showcase, idempotent cron',async()=>{
   await clock(now+40*day);const start=now,ids=[];for(let i=0;i<16;i++)ids.push(await active(cities[1]));
   await clock(start+29*day);for(const id of ids.slice(0,15))await pick(id,'city_premium');
   await as(owner,"select public.owner_listing_transition($1,'edit')",[ids[0]]);await submit(ids[0],null);
   await pick(ids[15],'city_premium');await approve(ids[0]);
   const waiting=(await placement(ids[15]))[0];assert.equal(waiting.status,'waiting');assert.equal(waiting.starts_at,null);assert.equal(waiting.ends_at,null);
   assert.equal(time((await read(ids[15])).vip_until),now+7*day);assert.equal((await bumps(ids[15])).length,14);
   assert.equal((await db.query("select count(*)::int n from public.city_premium_placements where settlement_id=$1 and status='active'",[cities[1]])).rows[0].n,15);
   const selected=await choice(ids[15]);await clock(now+8*day);await tick();await tick();
   const entered=(await placement(ids[15]))[0],row=await read(ids[15]);assert.equal(entered.id,waiting.id);assert.equal(entered.status,'active');assert.equal(time(entered.starts_at),now);assert.equal(time(entered.ends_at),now+7*day);assert.equal(time(row.expires_at),now+7*day);
   assert.equal(time(row.published_at),start);assert.equal((await choice(ids[15])).run_id,selected.run_id);assert.equal((await bumps(ids[15])).length,14);
   await clock(now+7*day);await tick();assert.equal((await read(ids[15])).status,'archived');
  });
  await t.test('freshness A/B/C, delayed actual bump, newer free publication, stable ties and unchanged created_at',async()=>{
   await clock(now+40*day);const start=now,a=await active(cities[2]);await pick(a,'maximum');const original=await read(a);
   await clock(start+60000);const b=await active(cities[2]);await clock(start+120000);const c=await active(cities[2]);
   const ids=[a,b,c],ordered=async()=> (await db.query('select id from public.catalog_listing_cards where id=any($1::uuid[]) order by sort_at desc,id desc',[ids])).rows.map(x=>x.id);
   assert.deepEqual(await ordered(),[c,b,a]);
   await clock(start+24*hour+10000);const between=await active(cities[2]);ids.push(between);assert.equal((await ordered())[0],between);
   await clock(start+24*hour+30000);await tick();assert.equal((await ordered())[0],a);assert.equal(time((await read(a)).bumped_at),now);
   const applied=now;await clock(now+1000);await tick();assert.equal(time((await read(a)).bumped_at),applied);
   const newer=await active(cities[2]);ids.push(newer);assert.deepEqual((await ordered()).slice(0,3),[newer,a,between]);
   const tied=await active(cities[2]);ids.push(tied);assert.deepEqual((await ordered()).slice(0,2),[newer,tied].sort().reverse());
   assert.equal(time((await read(a)).created_at),time(original.created_at));assert.equal(time((await read(a)).published_at),start);
   assert.equal((time((await bumps(a))[0].scheduled_at)-start)/hour,24);
  });
  await t.test('three explicit city packages are readable, maximum is not showcase, plain edit retains exact entitlements',async()=>{
   await clock(now+40*day);const start=now,ids=[];
   for(let i=0;i<3;i++){const id=await make(cities[2]);await submit(id,'city_premium');await approve(id);ids.push(id);}
   const rows=(await db.query('select listing_id from public.get_city_premium_placements($1)',[cities[2]])).rows;
   assert.deepEqual(rows.map(x=>x.listing_id).sort(),[...ids].sort());
   const maximum=await active(cities[2]);await pick(maximum,'maximum');assert.equal((await placement(maximum)).length,0);
   const ordinary=await active(cities[2]);
   for(const id of [ordinary,maximum,ids[0]]){
    const l=await read(id),c=await choice(id),p=await placement(id),b=await bumps(id);
    await clock(start+3*day);await as(owner,"select public.owner_listing_transition($1,'edit')",[id]);
    await as(owner,'select public.submit_listing($1)',[id]);await approve(id);
    const after=await read(id);for(const key of ['created_at','published_at','expires_at','vip_until','x2_until'])assert.equal(time(after[key]),time(l[key]),key);
    assert.deepEqual(await choice(id),c);assert.deepEqual(await placement(id),p);assert.deepEqual(await bumps(id),b);
   }
   assert.equal((await db.query('select count(*)::int n from public.get_city_premium_placements($1)',[cities[2]])).rows[0].n,3);
  });
  await t.test('owner/anonymous authorization, immutable dates, package whitelist, standalone showcase denied',async()=>{
   await clock(now+40*day);const id=await active(cities[2]);
   await assert.rejects(as(other,"select public.set_listing_promotion_choice($1,'maximum')",[id]),{code:'42501'});
   await assert.rejects(pick(id,'forever'),{code:'22023'});
   await assert.rejects(as(other,'select public.get_listing_promotion_state($1)',[id]),{code:'42501'});
   await assert.rejects(as(owner,"insert into public.city_premium_placements(listing_id,user_id,settlement_id,promotion_type,status) select id,owner_id,settlement_id,'CITY_PREMIUM','waiting' from public.listings where id=$1",[id]),{code:'42501'});
   for(const field of ['published_at','expires_at','vip_until','x2_until','bumped_at','created_at'])await assert.rejects(as(owner,`update public.listings set ${field}=now()+interval '100 years' where id=$1`,[id]),{code:'42501'});
   for(const sql of ["select public.activate_city_premium($1)","select public.connect_city_premium($1)","select private.start_listing_promotion($1,now())","insert into private.listing_promotion_bumps(run_id,ordinal,listing_id,scheduled_at) values(gen_random_uuid(),1,$1,now())","update public.listing_promotion_choices set ends_at=now()+interval '100 years' where listing_id=$1"])await assert.rejects(as(owner,sql,[id]),{code:'42501'});
   await db.exec('set role anon');await assert.rejects(db.query("select public.set_listing_promotion_choice($1,'basic')",[id]),{code:'42501'});await db.exec('reset role');
   assert.equal((await placement(id)).length,0);
   const fresh=(await db.query('select sort_at,published_at from public.catalog_listing_cards where id=$1',[id])).rows[0];assert.equal(time(fresh.sort_at),time(fresh.published_at));
  });
  console.log('PROMOTION LIFECYCLE PASS',report);
 } finally{
  await db.close();
  const safe=resolve(directory);
  assert.ok(safe.toLowerCase().startsWith(resolve(tmpdir()).toLowerCase()+sep)&&basename(safe).startsWith('jevu-promotion-test-'));
  await rm(safe,{recursive:true,force:true});
 }
});
