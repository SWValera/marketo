import assert from "node:assert/strict";

// OFFLINE fixture only. No production identities, numbers or network clients.
export async function auditListingPhones(db, users, listingId) {
  const as = async (role, id, sql, args=[]) => {
    await db.exec("set role " + role);
    try { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id ?? ""]); return await db.query(sql,args); }
    finally { await db.exec("reset role"); }
  };
  const guest = "a".repeat(64), otherGuest = "b".repeat(64);
  const reveal = async (sessionKey=guest, listing=listingId) =>
    (await as("service_role",null,"select public.reveal_listing_phone($1,$2) as result",[listing,sessionKey])).rows[0].result;
  const reset = () => db.query("delete from private.listing_phone_reveal_limits where session_key=$1",[guest]);
  const quota = async () => (await db.query("select cardinality(attempts) as n from private.listing_phone_reveal_limits where session_key=$1",[guest])).rows[0]?.n ?? 0;
  const missing = "d9000000-0000-4000-8000-000000000009";
  const fixturePhone = "+77001112233";
  await db.query("update public.listing_contacts set allow_phone=false,contact_phone_e164=$2 where listing_id=$1",[listingId,fixturePhone]);
  assert.deepEqual(await reveal(),{state:"unavailable"},"historical opt-out remains private");
  assert.equal(await quota(),1,"unavailable attempts consume quota");
  await reset();
  await db.query("update public.listing_contacts set allow_phone=true where listing_id=$1",[listingId]);
  for (const role of ["anon","authenticated"]) {
    const row=(await as(role,users.buyer,"select * from public.get_listing_contact_options($1)",[listingId])).rows[0];
    assert.equal(row.allow_phone,true); assert.equal(row.phone,null,"legacy RPC must never reveal a number");
  }
  for (const role of ["anon","authenticated","service_role"]) {
    await assert.rejects(as(role,users.buyer,"select * from private.listing_phone_reveal_limits"),/permission denied/);
    await assert.rejects(as(role,users.buyer,"delete from private.listing_phone_reveal_limits"),/permission denied/);
  }
  for(const role of ["anon","authenticated"]) {
    await assert.rejects(as(role,users.buyer,"select public.reveal_listing_phone($1,$2)",[listingId,guest]),/permission denied/);
  }
  assert.equal((await db.query("select to_regprocedure('public.reveal_listing_phone(uuid)') as old")).rows[0].old,null);
  for(const value of [null,"",users.buyer,"A".repeat(64),"g".repeat(64),"a".repeat(65)]) assert.deepEqual(await reveal(value),{state:"denied"});
  assert.equal(await quota(),0);
  for(const method of ["GET","HEAD"]) {
    await db.query("select set_config('request.method',$1,false)",[method]);
    assert.deepEqual(await reveal(),{state:"denied"});
  }
  await db.exec("select set_config('request.method','POST',false)");
  for(const prefer of ["tx=rollback","return=representation, TX = rollback","tx=commit"]) {
    await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({prefer})]);
    assert.deepEqual(await reveal(),{state:"denied"});
  }
  await db.exec("select set_config('request.headers','{}',false)");
  for(let i=0;i<5;i++) assert.deepEqual(await reveal(),{state:"revealed",phone:fixturePhone});
  assert.equal(await quota(),5);
  const limit=await reveal(guest,missing);
  assert.equal(limit.state,"limited"); assert.ok(limit.retry_after>0 && limit.retry_after<=60);
  assert.equal(await quota(),5);
  assert.equal((await reveal(otherGuest)).state,"revealed","separate session has its own quota");
  await db.query("update private.listing_phone_reveal_limits set attempts=array(select now()-interval '2 minutes' from generate_series(1,39)) where session_key=$1",[guest]);
  assert.equal((await reveal()).state,"revealed"); assert.equal(await quota(),40);
  for(const zone of ["Pacific/Kiritimati","America/Adak","UTC"]) {
    await db.query("select set_config('TimeZone',$1,false)",[zone]);
    const result=await reveal(); assert.equal(result.state,"limited"); assert.ok(result.retry_after>80000);
  }
  await db.query("update private.listing_phone_reveal_limits set attempts=array(select now()-interval '25 hours' from generate_series(1,40)) where session_key=$1",[guest]);
  assert.equal((await reveal()).state,"revealed"); assert.equal(await quota(),1);
  await reset();
  // One statement repeats the function: budget must hold across target IDs/calls.
  const batch=await as("service_role",null,"select public.reveal_listing_phone(case when n%2=0 then $1::uuid else $2::uuid end,$3) result from generate_series(1,12) n",[listingId,missing,guest]);
  assert.equal(batch.rows.filter(row=>row.result.state==="limited").length,7);
  assert.equal(await quota(),5);
  const publicationGuard=(await db.query("select exists(select 1 from pg_trigger where tgrelid='public.listings'::regclass and tgname='listings_publication_period' and tgenabled='O') present")).rows[0].present;
  if(publicationGuard) {
    const original=(await db.query("select published_at::text,expires_at::text from public.listings where id=$1",[listingId])).rows[0];
    await db.query("update public.listings set published_at=null,expires_at=now()-interval '1 second' where id=$1",[listingId]);
    assert.deepEqual((await db.query("select published_at::text,expires_at::text from public.listings where id=$1",[listingId])).rows[0],original,"normal updates cannot change an active publication term");
  }
  const prepareListing = async (change) => {
    // OFFLINE synthetic fixture only: time cannot advance a month in the test.
    // Suspend only the term-writing trigger while arranging old/corrupt dates;
    // restore it before EVERY phone read. RLS and all other triggers stay on.
    if(publicationGuard) await db.exec("alter table public.listings disable trigger listings_publication_period");
    try {
      await db.query("update public.listings set status='active',published_at=now(),expires_at=now()+interval '1 month',deleted_at=null where id=$1",[listingId]);
      if(change) await db.query("update public.listings set "+change+" where id=$1",[listingId]);
    } finally {if(publicationGuard) await db.exec("alter table public.listings enable trigger listings_publication_period");}
  };
  for(const change of ["published_at=now()-interval '2 months',expires_at=now()-interval '1 second'","status='archived'","published_at=null","deleted_at=now()"]) {
    await reset();
    await prepareListing(change);
    const actual=(await db.query("select status='active' and published_at is not null and expires_at>clock_timestamp() and deleted_at is null as visible from public.listings where id=$1",[listingId])).rows[0];
    assert.equal(actual.visible,false,"fixture must actually be unavailable: "+change);
    assert.deepEqual(await reveal(),{state:"unavailable"},change);
  }
  await prepareListing();
  await reset();
  await db.query("update public.profiles set status='suspended' where id=$1",[users.owner]);
  assert.deepEqual(await reveal(),{state:"unavailable"});
  await db.query("update public.profiles set status='active' where id=$1",[users.owner]);
  // No private profile fallback even when the listing phone is absent.
  await db.query("insert into public.profile_private(user_id,contact_phone_e164) values($1,'+77004445566') on conflict(user_id) do update set contact_phone_e164=excluded.contact_phone_e164",[users.owner]);
  await db.query("update public.listing_contacts set allow_phone=false,contact_phone_e164=null where listing_id=$1",[listingId]);
  assert.deepEqual(await reveal(),{state:"unavailable"});
  assert.equal((await as("authenticated",users.buyer,"select * from public.listing_contacts where listing_id=$1",[listingId])).rows.length,0);
  await reset();
  await db.exec("insert into private.listing_phone_reveal_limits(session_key,expires_at) select lpad(to_hex(n),64,'0'),now()-interval '1 minute' from generate_series(1,150) n");
  await reveal();
  assert.equal((await db.query("select count(*)::integer n from private.listing_phone_reveal_limits where expires_at<now()")).rows[0].n,50,"cleanup is bounded at 100 rows");
  await reveal();
  assert.equal((await db.query("select count(*)::integer n from private.listing_phone_reveal_limits where expires_at<now()")).rows[0].n,0);
  console.log("PASS: guest phone privacy, service-only ACLs, rolling session quotas, cleanup and legacy compatibility");
}
