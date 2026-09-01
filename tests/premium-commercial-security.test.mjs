import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { closePGliteTestDatabase, createPGliteTestDatabase } from "./pglite-test-database.mjs";

const root = new URL("../", import.meta.url);
const ownerId = "61000000-0000-4000-8000-000000000001";
const buyerId = "62000000-0000-4000-8000-000000000002";

async function asAuthenticated(db, userId, operation) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await operation();
  } finally {
    await db.exec("reset role;");
  }
}

test("Premium commercial accounts, orders and analytics are owner-scoped by RLS", async () => {
  const db = await createPGliteTestDatabase({ extensions: { pg_trgm, pgcrypto } });
  try {
    await db.exec(`
      create schema auth;
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      grant usage on schema auth to anon, authenticated, service_role;
      create table auth.users (
        id uuid primary key,
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );
      create function auth.uid()
      returns uuid
      language sql
      stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create publication supabase_realtime;
    `);
    const migrations = (await readdir(new URL("supabase/migrations/", root)))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const migration of migrations) {
      await db.exec(await readFile(new URL(`supabase/migrations/${migration}`, root), "utf8"));
    }
    await db.exec(await readFile(new URL("supabase/seeds/001_marketo_reference.sql", root), "utf8"));
    await db.query(
      "insert into auth.users (id, raw_user_meta_data) values ($1, '{\"display_name\":\"Owner\"}'::jsonb), ($2, '{\"display_name\":\"Buyer\"}'::jsonb)",
      [ownerId, buyerId],
    );

    const reference = await db.query(`
      select
        (select id from public.categories where slug = 'free-other') as category_id,
        (select id from public.settlements where slug = 'astana') as settlement_id
    `);
    const { category_id: categoryId, settlement_id: settlementId } = reference.rows[0];
    const listing = await db.query(`
      insert into public.listings (
        owner_id, category_id, settlement_id, slug, title, description,
        price_minor, currency_code, status, published_at
      ) values ($1, $2, $3, 'commercial-rls-fixture', 'Commercial RLS fixture',
        'Commercial Premium foundation security fixture', 1000, 'KZT', 'active', current_timestamp)
      returning id
    `, [ownerId, categoryId, settlementId]);
    const account = await db.query(`
      insert into public.city_premium_accounts (owner_id, display_name)
      values ($1, 'Owner account') returning id
    `, [ownerId]);
    const accountId = account.rows[0].id;
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 86_400_000).toISOString();
    const order = await db.query(`
      insert into public.city_premium_orders (
        account_id, settlement_id, status, payment_status, starts_at, ends_at
      ) values ($1, $2, 'confirmed', 'unbilled', $3, $4) returning id
    `, [accountId, settlementId, startsAt, endsAt]);
    const placement = await db.query(`
      insert into public.city_premium_placements (
        settlement_id, listing_id, account_id, order_id, status, starts_at, ends_at,
        priority, rotation_weight, rotation_metadata
      ) values ($1, $2, $3, $4, 'paused', $5, $6, 5, 1.5000, '{"cohort":"fixture"}'::jsonb)
      returning id
    `, [settlementId, listing.rows[0].id, accountId, order.rows[0].id, startsAt, endsAt]);
    const placementId = placement.rows[0].id;
    await db.query(`
      insert into public.city_premium_events (placement_id, event_type, deduplication_key)
      values ($1, 'impression', 'impression-fixture-1'), ($1, 'click', 'click-fixture-0001')
    `, [placementId]);
    await db.query(`
      insert into public.city_premium_daily_metrics (
        placement_id, metric_date, impressions, clicks, last_event_at
      ) values ($1, current_date, 1, 1, current_timestamp)
    `, [placementId]);

    await asAuthenticated(db, ownerId, async () => {
      assert.equal((await db.query("select count(*)::int as count from public.city_premium_accounts")).rows[0].count, 1);
      assert.equal((await db.query("select count(*)::int as count from public.city_premium_orders")).rows[0].count, 1);
      assert.equal((await db.query("select count(*)::int as count from public.city_premium_placements where status = 'paused'")).rows[0].count, 1);
      assert.deepEqual((await db.query("select impressions, clicks from public.city_premium_daily_metrics")).rows, [{ impressions: 1, clicks: 1 }]);
      assert.deepEqual((await db.query("select event_type from public.city_premium_events order by event_type")).rows, [{ event_type: "click" }, { event_type: "impression" }]);
      await assert.rejects(
        db.query("insert into public.city_premium_events (placement_id, event_type) values ($1, 'click')", [placementId]),
        /permission denied/i,
      );
    });

    await asAuthenticated(db, buyerId, async () => {
      assert.equal((await db.query("select count(*)::int as count from public.city_premium_accounts")).rows[0].count, 0);
      assert.equal((await db.query("select count(*)::int as count from public.city_premium_orders")).rows[0].count, 0);
      assert.equal((await db.query("select count(*)::int as count from public.city_premium_placements where status = 'paused'")).rows[0].count, 0);
      assert.equal((await db.query("select count(*)::int as count from public.city_premium_events")).rows[0].count, 0);
      assert.equal((await db.query("select count(*)::int as count from public.city_premium_daily_metrics")).rows[0].count, 0);
    });

    await db.exec("set role anon;");
    await assert.rejects(db.query("select id from public.city_premium_accounts"), /permission denied/i);
    const publicPlacements = await db.query("select id from public.city_premium_placements where id = $1", [placementId]);
    assert.deepEqual(publicPlacements.rows, []);
    await db.exec("reset role;");
  } finally {
    await closePGliteTestDatabase(db);
  }
});
