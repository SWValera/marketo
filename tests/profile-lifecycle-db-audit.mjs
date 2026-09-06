import assert from "node:assert/strict";

export async function auditProfileLifecycle(db, users, sourceId) {
  const inserted = await db.query(`insert into public.listings
    (owner_id,category_id,settlement_id,slug,title,description,currency_code,status)
    select owner_id,category_id,settlement_id,'profile-month-test',title,description,currency_code,'pending'
    from public.listings where id=$1 returning id`, [sourceId]);
  const id = inserted.rows[0].id;
  await db.query("insert into public.listing_images(listing_id,storage_key) values($1,'profile-preserved-image.jpg')", [id]);
  const asRole = async (role, user, query, args = []) => {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
      return await db.query(query, args);
    } finally { await db.exec("reset role"); }
  };
  const owner = (action) => asRole("authenticated", users.owner, "select public.owner_listing_transition($1,$2) as status", [id,action]);
  await asRole("authenticated", users.moderator, "select public.moderate_listing($1,'approve',null,null)", [id]);
  let row = (await db.query("select status,published_at,expires_at from public.listings where id=$1", [id])).rows[0];
  assert.equal(row.status, "active");
  assert.ok(Date.parse(row.published_at) <= Date.now());
  const calendar = await db.query(`select expires_at =
    ((published_at at time zone 'Asia/Almaty') + interval '1 month') at time zone 'Asia/Almaty' as correct
    from public.listings where id=$1`, [id]);
  assert.equal(calendar.rows[0].correct, true);
  const monthEnds = await db.query(`select
    ('2028-01-31 14:00'::timestamp + interval '1 month')::text as leap,
    ('2027-01-31 14:00'::timestamp + interval '1 month')::text as normal`);
  assert.equal(monthEnds.rows[0].leap, "2028-02-29 14:00:00");
  assert.equal(monthEnds.rows[0].normal, "2027-02-28 14:00:00");
  await assert.rejects(asRole("authenticated", users.buyer, "select public.owner_listing_transition($1,'delete')", [id]), /unavailable/);
  await assert.rejects(asRole("authenticated", users.suspended, "select public.owner_listing_transition($1,'edit')", [id]), /active profile/);
  await assert.rejects(asRole("anon", null, "select public.owner_listing_transition($1,'delete')", [id]), /permission denied/);
  assert.equal((await owner("edit")).rows[0].status, "draft");
  row = (await db.query("select published_at,expires_at from public.listings where id=$1", [id])).rows[0];
  assert.deepEqual(row, { published_at: null, expires_at: null });
  assert.equal((await owner("archive")).rows[0].status, "archived");
  assert.equal((await owner("restore")).rows[0].status, "draft");
  assert.equal((await db.query("select count(*)::int as n from public.listing_images where listing_id=$1", [id])).rows[0].n, 1);
  await db.query("update public.listings set status='pending' where id=$1", [id]);
  await asRole("authenticated", users.moderator, "select public.moderate_listing($1,'approve',null,null)", [id]);
  // Only the test administrator can move the clock/term. Owner timestamp updates
  // are denied, and normal active updates preserve the original deadline.
  await db.exec("alter table public.listings disable trigger listings_publication_period");
  try { await db.query(`update public.listings set published_at=statement_timestamp()-interval '2 months',
    expires_at=statement_timestamp()-interval '1 second' where id=$1`, [id]); }
  finally { await db.exec("alter table public.listings enable trigger listings_publication_period"); }
  assert.equal((await asRole("anon", null, "select id from public.listings where id=$1", [id])).rows.length, 0);
  assert.equal((await asRole("anon", null, "select id from public.listing_images where listing_id=$1", [id])).rows.length, 0);
  assert.equal((await asRole("authenticated", users.owner, "select id from public.listings where id=$1", [id])).rows.length, 1);
  assert.equal((await asRole("authenticated", users.owner, "select id from public.catalog_listing_cards where id=$1", [id])).rows.length, 0);
  await assert.rejects(asRole("authenticated", users.buyer, "select public.get_or_create_listing_conversation($1)", [id]), /unavailable/);
  await assert.rejects(asRole("authenticated", users.owner, "select public.archive_expired_listings()"), /permission denied/);
  await asRole("service_role", null, "select public.archive_expired_listings()");
  assert.equal((await db.query("select status from public.listings where id=$1", [id])).rows[0].status, "archived");
  assert.equal((await owner("restore")).rows[0].status, "draft");
  assert.equal((await owner("delete")).rows[0].status, "deleted");
  row = (await db.query("select status,deleted_at from public.listings where id=$1", [id])).rows[0];
  assert.ok(row.deleted_at);
  assert.equal((await db.query("select count(*)::int as n from public.listing_images where listing_id=$1", [id])).rows[0].n, 1);
  await assert.rejects(owner("restore"), /unavailable/);
}

export async function auditRegistrationHandoff(db, userId) {
  const signature = "public.registration_handoff(text,text,text,text,text,text)";
  const acl = await db.query(`select has_function_privilege('anon',$1,'execute') as anon,
    has_function_privilege('authenticated',$1,'execute') as authenticated,
    has_function_privilege('service_role',$1,'execute') as service`, [signature]);
  assert.deepEqual(acl.rows[0], { anon:false, authenticated:false, service:true });
  const r = "a".repeat(64), w = "b".repeat(64), ip = "c".repeat(64), lease = "d".repeat(64);
  async function call(op, read = r, write = w, code = null, ticket = null, client = ip) {
    await db.exec("set role service_role");
    try { return (await db.query("select public.registration_handoff($1,$2,$3,$4,$5,$6) as result", [op,read,write,code,ticket,client])).rows[0].result; }
    finally { await db.exec("reset role"); }
  }
  assert.equal((await call("start")).state, "waiting");
  assert.equal((await call("claim", w, null, null, lease)).state, "missing", "write capability cannot read");
  assert.equal((await call("claim", r, null, null, lease)).state, "waiting");
  assert.equal((await call("deposit", null, w, "short-lived-code")).state, "received");
  assert.equal((await call("deposit", null, w, "another-code")).state, "invalid");
  assert.equal((await call("claim", r, null, null, lease)).code, "short-lived-code");
  assert.equal((await call("claim", r, null, null, "e".repeat(64))).state, "waiting", "concurrent lease denied");
  assert.equal((await call("finish", r, null, userId, "e".repeat(64))).state, "invalid");
  assert.equal((await call("release", r, null, null, lease)).state, "waiting");
  assert.equal((await call("claim", r, null, null, lease)).state, "ready");
  assert.equal((await call("finish", r, null, userId, lease)).state, "complete");
  assert.equal((await call("finish", r, null, userId, lease)).state, "complete", "retry finalization is idempotent");
  assert.deepEqual(await call("claim", r, null, null, lease), { state:"complete", user_id:userId });
  assert.equal((await call("deposit", null, w, "short-lived-code")).state, "invalid");
  await call("cancel");
  assert.equal((await call("claim", r, null, null, lease)).state, "expired");
  assert.equal((await call("deposit", null, w, "short-lived-code")).state, "invalid");
  assert.equal((await call("start", "1".repeat(64), "2".repeat(64))).state, "waiting");
  await call("deposit", null, "2".repeat(64), "other-email-code");
  await call("claim", "1".repeat(64), null, null, lease);
  await call("cancel", "1".repeat(64));
  assert.equal((await call("finish", "1".repeat(64), null, userId, lease)).state, "invalid", "cancel wins over in-flight exchange");
  for (const n of [3,4,5]) await call("start", String(n).repeat(64), (n+5).toString(16).repeat(64));
  assert.equal((await call("start", "f".repeat(64), "e".repeat(64), null, "5".repeat(64))).state, "limited");
  assert.equal((await call("claim", "5".repeat(64), null, null, lease)).state, "waiting", "failed start does not cancel previous");
}
