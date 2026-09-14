import assert from "node:assert/strict";
export async function auditCityPremiumActive(db,{owner,buyer,city,otherCity,category,legacyListing}) {
 const as=async(user,sql,args=[])=>{await db.exec("set role authenticated");try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);return await db.query(sql,args)}finally{await db.exec("reset role")}};
 const connect=async(id,user=owner)=>(await as(user,"select public.connect_city_premium($1) data",[id])).rows[0].data;
 const offer=async(id,user=owner)=>{await db.exec("begin read only; set local role authenticated");try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);return (await db.query("select public.get_city_premium_offer($1) data",[id])).rows[0].data}finally{await db.exec("rollback")}};
 const available=async(location=city)=>(await db.query("select available from public.get_city_premium_availability($1)",[location])).rows[0].available;
 let sequence=0;
 const make=async(status="active",location=city)=>(await db.query("insert into public.listings(owner_id,category_id,settlement_id,slug,title,description,status,published_at) values($1,$2,$3,$4,'Synthetic active listing','Isolated active premium test',$5,case when $5='active' then now() else null end) returning id",[owner,category,location,"active-premium-"+sequence++,status])).rows[0].id;
 const listing=legacyListing||await make();
 const lifecycle=(await db.query("select status,published_at,expires_at from public.listings where id=$1",[listing])).rows[0];
 assert.equal((await offer(listing)).listing_active,true,"STABLE offer works in PostgREST READ ONLY transaction");
 await assert.rejects(offer(listing,buyer),e=>e.code==="42501");
 assert.equal(await available(),15);
 const before=(await db.query("select clock_timestamp() instant")).rows[0].instant;
 const activated=await connect(listing);assert.equal(activated.status,"ACTIVE");
 const row=(await db.query("select * from public.city_premium_placements where id=$1",[activated.placement_id])).rows[0];
 assert.equal(row.status,"active");assert.equal(row.settlement_id,city);assert.equal(row.user_id,owner);
 assert.ok(new Date(row.starts_at)>=new Date(before));assert.equal(new Date(row.ends_at)-new Date(row.starts_at),604800000);
 assert.equal(await available(),14);assert.equal(row.payment_status,"not_required");assert.equal(Number(row.price_amount),0);
 const repeated=await connect(listing);assert.equal(repeated.status,"ALREADY_ACTIVE");assert.equal(repeated.placement_id,row.id);
 assert.deepEqual((await db.query("select status,published_at,expires_at from public.listings where id=$1",[listing])).rows[0],lifecycle);
 for(const [status,reason] of [["expired",null],["cancelled",null],["cancelled","activation_failed"],["paused",null],["completed",null]]) {
  const id=await make();
  const old=(await db.query("insert into public.city_premium_placements(listing_id,user_id,settlement_id,status,starts_at,ends_at,failure_reason) values($1,$2,$3,$4,null,null,$5) returning id",[id,owner,city,status,reason])).rows[0].id;
  const next=await connect(id);assert.equal(next.status,"ACTIVE");assert.notEqual(next.placement_id,old);
  assert.equal((await db.query("select count(*)::int n from public.city_premium_placements where listing_id=$1",[id])).rows[0].n,2,"History retained");
 }
 for(const location of [city,otherCity]) {
  const id=await make();
  const old=(await db.query("insert into public.city_premium_placements(listing_id,user_id,settlement_id,status,starts_at,ends_at) values($1,$2,$3,'pending_approval',null,null) returning id",[id,owner,location])).rows[0].id;
  const result=await connect(id);assert.equal(result.status,"ACTIVE");
  const historical=(await db.query("select status from public.city_premium_placements where id=$1",[old])).rows[0].status;
  assert.equal(historical,location===city?"active":"cancelled");
  assert.equal((await offer(id)).placement.status,"active");
 }
 assert.deepEqual(await connect(listing,buyer),{status:"LISTING_NOT_ELIGIBLE",reason:"listing_unavailable"});
 assert.deepEqual(await connect(await make("rejected")),{status:"LISTING_NOT_ELIGIBLE",reason:"listing_status"});
 await assert.rejects(as(owner,"update public.city_premium_placements set ends_at=now()+interval '99 days' where id=$1",[row.id]),e=>e.code==="42501");
 const pending=await make("pending",otherCity);
 assert.equal((await connect(pending)).status,"PENDING_APPROVAL");assert.equal((await connect(pending)).status,"PENDING_APPROVAL");
 assert.equal(await available(otherCity),15);assert.equal((await offer(pending)).placement.ends_at,null);
 await db.query("update public.listings set status='active',published_at=clock_timestamp() where id=$1",[pending]);
 assert.equal((await offer(pending)).placement.status,"active");assert.equal(await available(otherCity),14);
 while(await available()>0) assert.equal((await connect(await make())).status,"ACTIVE");
 const noSlotListing=await make();assert.deepEqual(await connect(noSlotListing),{status:"NO_SLOTS"});
 assert.equal((await db.query("select status from public.listings where id=$1",[noSlotListing])).rows[0].status,"active");
 assert.equal((await db.query("select count(*)::int n from public.city_premium_placements where settlement_id=$1 and status='active'",[city])).rows[0].n,15);
 return {readOnlyOffer:true,pre0035Listing:!!legacyListing,immediateActive:true,exactTerm:true,capacityPlusOne:true,idempotent:true,terminalHistoryRetained:true,legacyPendingHandled:true,noSlotsResult:true,eligibilityReason:true,ownerPermissions:true,pendingApprovalPreserved:true,ordinaryListingUnchanged:true};
}
