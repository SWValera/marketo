import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = new URL("../", import.meta.url);

async function createDatabase() {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
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
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create publication supabase_realtime;
  `);
  return db;
}

async function applyMigrations(db) {
  const names = (await readdir(new URL("supabase/migrations/", root))).filter((name) => name.endsWith(".sql")).sort();
  for (const name of names) await db.exec(await readFile(new URL(`supabase/migrations/${name}`, root), "utf8"));
  return names;
}

test("all Supabase migrations and the reference seed run on a clean PostgreSQL-compatible database", async () => {
  const db = await createDatabase();
  try {
    const names = await applyMigrations(db);
    assert.equal(names.length, 12);
    const rlsCoverage = await db.query(`
      select count(*)::int as total,
             count(*) filter (where relation.relrowsecurity)::int as rls
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relkind = 'r'
    `);
    assert.deepEqual(rlsCoverage.rows[0], { total: 23, rls: 23 });
    const elevatedFunctions = await db.query(`
      select procedure.proname, procedure.proconfig
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where procedure.prosecdef
        and namespace.nspname in ('public', 'private')
    `);
    assert.equal(elevatedFunctions.rows.length, 14);
    assert.ok(elevatedFunctions.rows.every((row) => row.proconfig?.includes('search_path=""')));
    const realtimeTables = await db.query(`
      select tablename
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
      order by tablename
    `);
    assert.deepEqual(realtimeTables.rows, [{ tablename: "messages" }, { tablename: "notifications" }]);
    await db.exec(await readFile(new URL("supabase/seeds/001_marketo_reference.sql", root), "utf8"));
    const result = await db.query(`
      select
        (select count(*) from public.countries)::int as countries,
        (select count(*) from public.regions)::int as regions,
        (select count(*) from public.settlements)::int as settlements,
        (select count(*) from public.categories)::int as categories,
        (select count(*) from public.category_attributes)::int as attributes,
        (select count(*) from public.category_attribute_options)::int as options
    `);
    assert.deepEqual(result.rows[0], {
      countries: 1,
      regions: 20,
      settlements: 90,
      categories: 228,
      attributes: 712,
      options: 1519,
    });

    const userId = "10000000-0000-4000-8000-000000000001";
    await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2::jsonb)", [userId, JSON.stringify({ display_name: "Test User", language: "ru" })]);
    const profile = await db.query("select display_name, language_code from public.profiles where id = $1", [userId]);
    assert.deepEqual(profile.rows[0], { display_name: "Test User", language_code: "ru" });

    const ids = await db.query(`
      select
        (select id from public.categories where slug = 'free-other') as category_id,
        (select id from public.settlements where slug = 'astana') as settlement_id
    `);
    const { category_id: categoryId, settlement_id: settlementId } = ids.rows[0];
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
    const inserted = await db.query(`
      insert into public.listings (
        owner_id, category_id, settlement_id, slug, title, description, price_minor, currency_code
      ) values ($1, $2, $3, 'reference-seed-test-listing', 'Проверочное объявление', 'Описание проверочного объявления', 0, 'KZT')
      returning id, status
    `, [userId, categoryId, settlementId]);
    const listingId = inserted.rows[0].id;
    assert.equal(inserted.rows[0].status, "draft");
    await assert.rejects(
      db.query("update public.listings set status = 'active' where id = $1", [listingId]),
      /permission denied/i,
    );

    await db.query("insert into public.listing_contacts (listing_id, contact_name) values ($1, 'Test User')", [listingId]);
    await assert.rejects(
      db.query("insert into public.listing_images (listing_id, storage_key) values ($1, 'tests/unverified.webp')", [listingId]),
      /permission denied/i,
    );
    await db.exec("reset role;");
    await db.query("insert into public.listing_images (listing_id, storage_key) values ($1, 'tests/reference-seed.webp')", [listingId]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
    await db.query("select public.submit_listing($1)", [listingId]);
    await db.exec("reset role;");
    const state = await db.query("select status from public.listings where id = $1", [listingId]);
    assert.equal(state.rows[0].status, "pending");

    await db.exec("set role anon;");
    const anonListings = await db.query("select count(*)::int as count from public.listings");
    assert.equal(anonListings.rows[0].count, 0);
    const publicProfile = await db.query("select id, display_name from public.profiles");
    assert.equal(publicProfile.rows.length, 1);
    await assert.rejects(db.query("select last_seen_at from public.profiles"), /permission denied/i);
    await db.exec("reset role;");
  } finally {
    await db.close();
  }
});
