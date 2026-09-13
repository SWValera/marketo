import assert from 'node:assert/strict';
export async function auditCityPremiumApproval(db,{owner,buyer,city,otherCity,category,connect}) {
 const as=async(user,sql,args=[])=>{await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);return await db.query(sql,args)}finally{await db.exec('reset role')}};
 const request=(id,user=owner)=>as(user,'select public.activate_city_premium($1) id',[id]);
 const moderate=(id,decision='approve')=>as(buyer,"select public.moderate_listing($1,$2,case when $2='reject' then 'other' else null end,null)",[id,decision]);
 const placement=async id=>(await db.query("select * from public.city_premium_placements where listing_id=$1 order by created_at desc,id limit 1",[id])).rows[0];
 const available=async(location=city)=>(await db.query('select * from public.get_city_premium_availability($1)',[location])).rows[0].available;
 let sequence=0;
 const make=async(status='pending',location=city)=>(await db.query("insert into public.listings(owner_id,category_id,settlement_id,slug,title,description,status,published_at) values($1,$2,$3,$4,'Synthetic listing','Synthetic isolated promotion test',$5,case when $5='active' then clock_timestamp() else null end) returning id",[owner,category,location,'approval-test-'+sequence++,status])).rows[0].id;
 await db.query("insert into public.user_roles(user_id,role) values($1,'moderator')",[buyer]);
 const selected=await make(),rejected=await make(),racerA=await make(),racerB=await make(),laterFull=await make();
 const first=(await request(selected)).rows[0].id;
 assert.equal((await request(selected)).rows[0].id,first);
 for(const id of [selected,rejected,racerA,racerB,laterFull]){
  await request(id);const p=await placement(id);assert.equal(p.status,'pending_approval');
  for(const key of ['starts_at','ends_at','reservation_expires_at','payment_reference'])assert.equal(p[key],null);
  assert.equal(p.payment_status,'not_required');assert.equal(Number(p.price_amount),0);
 }
 assert.equal(await available(),15);
 assert.equal((await db.query('select * from public.get_city_premium_placements($1)',[city])).rows.length,0);
 const offer=(await as(owner,'select public.get_city_premium_offer($1) data',[selected])).rows[0].data;
 assert.equal(offer.listing_pending,true);assert.equal(offer.placement.status,'pending_approval');
 await assert.rejects(request(selected,buyer),e=>e.code==='42501');
 await assert.rejects(as(owner,'select private.activate_city_premium_for_owner($1,$2)',[selected,owner]),e=>e.code==='42501');
 await assert.rejects(as(owner,"update public.city_premium_placements set status='active',starts_at=now(),ends_at=now()+interval '100 days' where id=$1",[first]),e=>e.code==='42501');
 await moderate(rejected,'reject');assert.equal((await placement(rejected)).status,'cancelled');assert.equal((await placement(rejected)).failure_reason,'moderation_rejected');
 await db.query("update public.city_premium_placements set created_at=now()-interval '10 days' where id=$1",[first]);
 const before=(await db.query('select clock_timestamp() instant')).rows[0].instant;
 await moderate(selected);const active=await placement(selected);
 assert.equal(active.id,first);assert.equal(active.status,'active');assert.ok(new Date(active.starts_at)>=new Date(before));
 assert.equal(new Date(active.ends_at)-new Date(active.starts_at),604800000);assert.equal(await available(),14);
 assert.equal((await request(selected)).rows[0].id,first);
 for(let n=0;n<13;n++)await request(await make('active'));
 assert.equal(await available(),1);
 // Independent real moderation transactions race for the final slot.
 if(connect) {const a=await connect(),b=await connect();let settled=false;
 try{
  for(const c of [a,b]){await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);}
  await a.query("select public.moderate_listing($1,'approve',null,null)",[racerA]);
  const competing=b.query("select public.moderate_listing($1,'approve',null,null)",[racerB]).then(()=>{settled=true});
  await new Promise(r=>setTimeout(r,100));assert.equal(settled,false);
  await a.query('commit');await competing;await b.query('commit');
 }finally{await a.end();await b.end();}
 } else {await moderate(racerA);await moderate(racerB);}
 assert.equal((await placement(racerA)).status,'active');assert.equal((await placement(racerB)).status,'cancelled');assert.equal((await placement(racerB)).failure_reason,'capacity_full');
 for(const id of [racerA,racerB])assert.equal((await db.query('select status from public.listings where id=$1',[id])).rows[0].status,'active');
 assert.equal(await available(),0);
 assert.equal((await db.query("select count(*)::int n from public.city_premium_placements where settlement_id=$1 and status='active'",[city])).rows[0].n,15);
 const fullNow=await make();await assert.rejects(request(fullNow),e=>e.code==='23514');assert.equal(await placement(fullNow),undefined);
 await moderate(laterFull);assert.equal((await placement(laterFull)).failure_reason,'capacity_full');assert.equal((await placement(laterFull)).starts_at,null);
 assert.equal((await as(owner,'select public.get_city_premium_offer($1) data',[laterFull])).rows[0].data.placement.failure_reason,'capacity_full');
 await db.query("update public.city_premium_placements set status='cancelled' where id=$1",[first]);
 await db.query("update public.listings set status='active' where id=$1",[laterFull]);await db.query('select public.expire_listing_promotions()');
 assert.equal((await placement(laterFull)).status,'cancelled','No automatic queue');
 // Concurrent owner retries retain one intent.
 const duplicate=await make('pending',otherCity);
 if(connect) {const c=await connect(),d=await connect();
 try{
  for(const conn of [c,d]){await conn.query('begin');await conn.query('set local role authenticated');await conn.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);}
  const chosen=(await c.query('select public.activate_city_premium($1) id',[duplicate])).rows[0].id;
  const repeated=d.query('select public.activate_city_premium($1) id',[duplicate]);
  await c.query('commit');assert.equal((await repeated).rows[0].id,chosen);await d.query('commit');
 }finally{await c.end();await d.end();}
 } else {assert.equal((await request(duplicate)).rows[0].id,(await request(duplicate)).rows[0].id);}
 assert.equal((await db.query('select count(*)::int n from public.city_premium_placements where listing_id=$1',[duplicate])).rows[0].n,1);
 assert.equal(await available(otherCity),15);
 await db.exec("update public.promotion_products set price_amount=1000 where code='CITY_PREMIUM'");await moderate(duplicate);
 assert.equal((await placement(duplicate)).status,'cancelled');assert.equal((await placement(duplicate)).failure_reason,'activation_failed');assert.equal(Number((await placement(duplicate)).price_amount),0);
 assert.equal((await db.query('select status from public.listings where id=$1',[duplicate])).rows[0].status,'active');
 await db.exec("update public.promotion_products set price_amount=0 where code='CITY_PREMIUM'");
 return {selection:true,noTermBeforeApproval:true,noCapacityBeforeApproval:true,approvalActivates:true,exactTermFromActivation:true,concurrentApprovalsSafe:!!connect,publicationPreserved:true,fullAtSelectionDenied:true,noQueueAfterRefusal:true,duplicateSelectionSafe:true,rejectionCancels:true,ownerOnly:true,noDirectWrites:true,privateHelperDenied:true,paymentGatePreserved:true};
}
