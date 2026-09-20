import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPGliteTestDatabase, closePGliteTestDatabase } from "./pglite-test-database.mjs";

test("promotion preference: owner boundary, persistence, no activation and atomic submit", async () => {
  const db = await createPGliteTestDatabase();
  const owner = "10000000-0000-4000-8000-000000000001", other = "20000000-0000-4000-8000-000000000002";
  const listing = "30000000-0000-4000-8000-000000000003";
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create schema private;");
    await db.exec("create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
    await db.exec("create table public.profiles(id uuid primary key,status text not null); create table public.listings(id uuid primary key,owner_id uuid,status text,deleted_at timestamptz,promoted_until timestamptz);");
    await db.exec("create function private.current_profile_is_active() returns boolean language sql security definer as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='active') $$;");
    // The existing moderation function is a boundary fixture. Its real route is
    // exercised in the browser suite; this test proves the new transaction contract.
    await db.exec("create function public.submit_listing(target_listing_id uuid) returns void language plpgsql security definer as $$ begin if not exists(select 1 from public.listings where id=target_listing_id and owner_id=auth.uid() and status in ('draft','rejected') and deleted_at is null) then raise exception 'not submittable' using errcode='42501'; end if; update public.listings set status='pending' where id=target_listing_id; end $$;");
    await db.exec("grant usage on schema auth,private to authenticated; grant select on public.listings to authenticated;");
    await db.query("insert into public.profiles values ($1,'active'),($2,'active')",[owner,other]);
    await db.query("insert into public.listings values ($1,$2,'draft',null,null)",[listing,owner]);
    await db.exec(await readFile("supabase/migrations/0037_listing_promotion_choices.sql","utf8"));
    const actor = async(id,role="authenticated") => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec("set role "+role); };
    const saved = async() => (await db.query("select promotion_type from public.listing_promotion_choices")).rows;
    await actor(owner);
    for(const choice of ["basic","accelerated","maximum","city_premium"]) {
      await db.query("select public.set_listing_promotion_choice($1,$2)",[listing,choice]);
      assert.deepEqual(await saved(),[{promotion_type:choice}]);
    }
    await db.query("select public.set_listing_promotion_choice($1,'city_premium')",[listing]);
    assert.equal((await saved()).length,1);
    assert.deepEqual((await db.query("select status,promoted_until from public.listings")).rows,[{status:"draft",promoted_until:null}]);
    await assert.rejects(db.query("insert into public.listing_promotion_choices(listing_id,promotion_type) values($1,'basic')",[listing]),{code:"42501"});
    await assert.rejects(db.query("select public.set_listing_promotion_choice($1,'invalid')",[listing]),{code:"22023"});
    await assert.rejects(db.query("select public.submit_listing_with_promotion_choice($1,'invalid')",[listing]),{code:"22023"});
    assert.equal((await db.query("select status from public.listings")).rows[0].status,"draft");
    assert.deepEqual(await saved(),[{promotion_type:"city_premium"}]);
    await actor(other);
    assert.deepEqual(await saved(),[]);
    await assert.rejects(db.query("select public.set_listing_promotion_choice($1,'basic')",[listing]),{code:"42501"});
    await actor("", "anon");
    await assert.rejects(db.query("select public.set_listing_promotion_choice($1,'basic')",[listing]),{code:"42501"});
    await actor(owner);
    await db.query("select public.submit_listing_with_promotion_choice($1,'accelerated')",[listing]);
    assert.equal((await db.query("select status from public.listings")).rows[0].status,"pending");
    assert.deepEqual(await saved(),[{promotion_type:"accelerated"}]);
    await db.exec("reset role");
    await db.query("update public.listings set status='active' where id=$1",[listing]);
    await actor(owner);
    await db.query("select public.set_listing_promotion_choice($1,'maximum')",[listing]);
    assert.equal((await db.query("select status from public.listings")).rows[0].status,"active");
    await db.query("select public.set_listing_promotion_choice($1,null)",[listing]);
    assert.deepEqual(await saved(),[]);
    await db.exec("reset role");await db.query("update public.listings set status='draft' where id=$1",[listing]);
    await actor(owner);await db.query("select public.submit_listing_with_promotion_choice($1,null)",[listing]);
    assert.equal((await db.query("select status from public.listings")).rows[0].status,"pending");assert.deepEqual(await saved(),[]);
    for(const state of ["suspended","deleted"]) {
      await db.exec("reset role");await db.query("update public.profiles set status=$1 where id=$2",[state,owner]);await actor(owner);
      await assert.rejects(db.query("select public.set_listing_promotion_choice($1,'basic')",[listing]),{code:"42501"});
    }
    await db.exec("reset role");await db.query("update public.profiles set status='active' where id=$1",[owner]);
    for(const state of ["archived","sold","expired"]) {
      await db.query("update public.listings set status=$1 where id=$2",[state,listing]);await actor(owner);
      await assert.rejects(db.query("select public.set_listing_promotion_choice($1,'basic')",[listing]),{code:"42501"});await db.exec("reset role");
    }
    await db.query("update public.listings set status='active',deleted_at=now() where id=$1",[listing]);await actor(owner);
    await assert.rejects(db.query("select public.set_listing_promotion_choice($1,'basic')",[listing]),{code:"42501"});
  } finally { await closePGliteTestDatabase(db); }
});
