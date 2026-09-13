import assert from 'node:assert/strict';

// Caller supplies an isolated migrated database and independent connections for the race test.
export async function auditCityPremium(db, {owner, buyer, city, otherCity, category, connect}) {
  const call = async (user, sql, args=[]) => {
    await db.exec('set role authenticated');
    try { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]); return await db.query(sql,args); }
    finally { await db.exec('reset role'); }
  };
  const activate=(id,user=owner)=>call(user,'select public.activate_city_premium($1) id',[id]);
  const availability=async id=>(await db.query('select * from public.get_city_premium_availability($1)',[id])).rows[0];
  const make=async(user,location,suffix)=>(await db.query("insert into public.listings(owner_id,category_id,settlement_id,slug,title,description,status,published_at) values($1,$2,$3,$4,'Synthetic listing','Synthetic isolated test listing','active',clock_timestamp()) returning id",[user,category,location,'promotion-test-'+suffix])).rows[0].id;
  const ids=[]; for(let i=0;i<19;i++) ids.push(await make(i===15?buyer:owner,city,String(i)));
  assert.equal((await availability(city)).available,15);
  for(const id of ids.slice(0,14)) await activate(id);
  assert.equal((await availability(city)).available,1);
  // The first transaction owns the final slot until commit. The second must wait and then reject.
  if (connect) {
  const a=await connect(),b=await connect();
  let settled=false;
  try {
    for(const [client,user] of [[a,owner],[b,buyer]]) {
      await client.query('begin');await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    }
    await a.query('select public.activate_city_premium($1)',[ids[14]]);
    const second=b.query('select public.activate_city_premium($1)',[ids[15]]).then(()=>{settled=true;return null},e=>{settled=true;return e});
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(settled,false,'Second transaction waits for the city lock');
    await a.query('commit');
    const rejected=await second;assert.equal(rejected?.code,'23514');
    await b.query('rollback');
  } finally { await a.end();await b.end(); }
  } else {
    await activate(ids[14]);await assert.rejects(activate(ids[15],buyer),e=>e.code==='23514');
  }
  assert.equal((await availability(city)).available,0);
  await assert.rejects(activate(ids[16]),e=>e.code==='23514');
  assert.equal((await db.query("select count(*)::int n from public.city_premium_placements where settlement_id=$1 and status='active'",[city])).rows[0].n,15);
  const other=await make(owner,otherCity,'other');
  await activate(other);assert.equal((await availability(otherCity)).available,14);
  const first=(await db.query('select * from public.city_premium_placements where listing_id=$1',[ids[0]])).rows[0];
  assert.equal(Number(first.price_amount),0);assert.equal(first.currency,'KZT');assert.equal(first.payment_status,'not_required');assert.equal(first.payment_reference,null);
  assert.equal(new Date(first.ends_at)-new Date(first.starts_at),7*24*3600*1000);
  assert.equal((await activate(ids[0])).rows[0].id,first.id,'Idempotent retry retains original term');
  for(const sql of [
    "insert into public.city_premium_placements(listing_id,settlement_id,starts_at,ends_at) values($1,$2,now(),now()+interval '99 days')",
    "update public.city_premium_placements set status='active',ends_at=now()+interval '99 days',price_amount=0,user_id=auth.uid() where listing_id=$1 and settlement_id=$2",
    "update public.promotion_products set price_amount=0 where code='CITY_PREMIUM' and $1::uuid is not null and $2::uuid is not null"
  ]) await assert.rejects(call(owner,sql,[ids[0],city]),e=>e.code==='42501');
  await assert.rejects(activate(ids[0],buyer),e=>e.code==='42501');
  await assert.rejects(activate('ffffffff-ffff-4fff-8fff-ffffffffffff'),e=>e.code==='42501');
  await db.exec('set role anon');
  assert.equal((await db.query('select * from public.get_city_premium_placements($1,50)',[city])).rows.length,15);
  await assert.rejects(db.query('select public.activate_city_premium($1)',[ids[1]]),e=>e.code==='42501');
  await assert.rejects(db.query('select payment_reference from public.city_premium_placements'),e=>e.code==='42501');
  await db.exec('reset role');
  // Exact read-time expiry, before cron cleanup; the ordinary listing keeps its lifecycle.
  const originalListing=(await db.query('select status,published_at,expires_at from public.listings where id=$1',[ids[0]])).rows[0];
  await db.query("update public.city_premium_placements set starts_at=now()-interval '8 days',ends_at=now()-interval '1 second' where id=$1",[first.id]);
  assert.equal((await availability(city)).available,1);
  assert.equal((await db.query('select * from public.get_city_premium_placements($1,50)',[city])).rows.length,14);
  const offer=(await call(owner,'select public.get_city_premium_offer($1) data',[ids[0]])).rows[0].data;
  assert.equal(offer.placement.status,'expired');
  await db.query('select public.expire_listing_promotions()');
  assert.equal((await db.query('select status from public.city_premium_placements where id=$1',[first.id])).rows[0].status,'expired');
  assert.deepEqual((await db.query('select status,published_at,expires_at from public.listings where id=$1',[ids[0]])).rows[0],originalListing);
  const renewed=(await activate(ids[0])).rows[0].id;assert.notEqual(renewed,first.id);
  assert.equal((await db.query('select count(*)::int n from public.city_premium_placements where listing_id=$1',[ids[0]])).rows[0].n,2);
  // Reserved leases occupy a slot and expire without any checkout implementation.
  const reserve=await make(owner,otherCity,'reserve');
  const reservation=(await db.query("insert into public.city_premium_placements(listing_id,settlement_id,status,payment_status,reservation_expires_at) values($1,$2,'reserved','pending',now()+interval '5 minutes') returning id",[reserve,otherCity])).rows[0].id;
  assert.equal((await availability(otherCity)).available,13);
  await assert.rejects(activate(reserve),e=>e.code==='23505');
  await db.query("update public.city_premium_placements set reservation_expires_at=now()-interval '1 second' where id=$1",[reservation]);
  assert.equal((await availability(otherCity)).available,14);
  // New nonzero prices are enforced server-side; old snapshots remain unchanged.
  await db.exec("update public.promotion_products set price_amount=1000 where code='CITY_PREMIUM'");
  await assert.rejects(activate(reserve),e=>e.code==='22023'&&e.message==='payment required');
  assert.equal(Number((await db.query('select price_amount from public.city_premium_placements where id=$1',[renewed])).rows[0].price_amount),0);
  await db.exec("update public.promotion_products set price_amount=0,enabled=false where code='CITY_PREMIUM'");
  await assert.rejects(activate(reserve),e=>e.code==='22023');
  await db.exec("update public.promotion_products set enabled=true where code='CITY_PREMIUM'");
  for(const state of ['sold','archived','rejected','pending']) {
    await db.query('update public.listings set status=$1 where id=$2',[state,other]);
    assert.equal((await db.query('select * from public.get_city_premium_placements($1)',[otherCity])).rows.length,0);
    await assert.rejects(activate(other),e=>e.code==='22023');
  }
  // Simulate a stored historical expiry; the real publication trigger intentionally prevents client term edits.
  await db.exec('begin; alter table public.listings disable trigger listings_publication_period');
  await db.query("update public.listings set status='active',published_at=now()-interval '40 days',expires_at=now()-interval '1 second' where id=$1",[other]);
  await db.exec('alter table public.listings enable trigger listings_publication_period; commit');
  assert.equal((await db.query('select * from public.get_city_premium_placements($1)',[otherCity])).rows.length,0);
  await db.query("update public.listings set status='deleted',deleted_at=now() where id=$1",[other]);
  assert.equal((await db.query('select * from public.get_city_premium_placements($1)',[otherCity])).rows.length,0);
  assert.equal((await db.query('select status from public.listings where id=$1',[ids[16]])).rows[0].status,'active','Capacity failure never rolls back ordinary publication');
  await db.query('select public.archive_expired_listings()');
  assert.equal((await db.query('select status from public.city_premium_placements where id=$1',[reservation])).rows[0].status,'expired','Existing cron entry point cleans reservations');
  await db.query("update public.city_premium_placements set status='cancelled' where id=$1",[renewed]);
  if (connect) {
  const rrA=await connect(),rrB=await connect();
  try {
    for(const c of [rrA,rrB]) {
      await c.query('begin isolation level repeatable read');await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
      await c.query('select * from public.get_city_premium_availability($1)',[city]);
    }
    await rrA.query('select public.activate_city_premium($1)',[ids[16]]);
    const stale=rrB.query('select public.activate_city_premium($1)',[ids[17]]).then(()=>null,e=>e);
    await rrA.query('commit');assert.equal((await stale)?.code,'40001');await rrB.query('rollback');
  } finally {await rrA.end();await rrB.end()}
  assert.equal((await availability(city)).available,0);
  }
  return {repeatableReadSafe:!!connect,capacity15:true,twoConnectionRace:!!connect,independentCities:true,sevenDays:true,expiryWithoutCron:true,listingLifecyclePreserved:true,ownerOnly:true,noDirectWrites:true,idempotent:true,renewal:true,reservationExpiry:true,priceSnapshot:true,paidBypassDenied:true,inactiveListingFiltered:true,publicationPreserved:true};
}
