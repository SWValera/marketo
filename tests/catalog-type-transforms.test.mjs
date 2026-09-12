import assert from "node:assert/strict";
import test, {after, before} from "node:test";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {catalogTypeTransformSql} from "../scripts/lib/catalog-type-transforms.mjs";

const db = new PGlite();
const categoryId = "00000000-0000-0000-0000-000000000001";
const attributeId = "00000000-0000-0000-0000-000000000002";
const listingId = "00000000-0000-0000-0000-000000000003";
const optionId = "00000000-0000-0000-0000-000000000004";
const target = [{categorySlug: "fixture", key: "brand", dataType: "select", dependsOnKey: null}];
const choices = [{categorySlug: "fixture", attributeKey: "brand", value: "known", parentValue: null}];
const mapping = [{category: "fixture", key: "brand", from: "text", to: "select", values: [{text: "Legacy brand", option: "known", expectedRows: 1}]}];
const sql = catalogTypeTransformSql(mapping, target, choices);

before(async () => {
  await db.exec(`
    create schema private;
    create table categories(id uuid primary key, slug text unique);
    create table category_attributes(id uuid primary key, category_id uuid references categories, key text, data_type text,
      is_active boolean default true, inherits_to_children boolean default false, validation jsonb default '{}', depends_on_key text,
      unique(category_id, key));
    create table listings(id uuid primary key, category_id uuid references categories);
    create table category_attribute_options(id uuid primary key, attribute_id uuid references category_attributes,
      value text, is_active boolean default true, parent_option_id uuid, unique(attribute_id, id), unique(attribute_id, value));
    create table listing_attribute_values(listing_id uuid references listings, attribute_id uuid references category_attributes,
      text_value text, number_value numeric, boolean_value boolean, date_value date, number_min_value numeric, number_max_value numeric,
      created_at timestamptz default '2026-09-01T10:00:00Z', updated_at timestamptz default '2026-09-02T11:00:00Z',
      primary key(listing_id, attribute_id));
    create table listing_attribute_option_values(listing_id uuid references listings, attribute_id uuid references category_attributes,
      option_id uuid, created_at timestamptz default now(), primary key(listing_id, attribute_id, option_id),
      foreign key(attribute_id, option_id) references category_attribute_options(attribute_id, id));
    create function private.attribute_applies_to_listing(l uuid, a uuid) returns boolean language sql as $$
      select exists(select 1 from public.listings l1 join public.category_attributes a1 on a1.category_id=l1.category_id where l1.id=l and a1.id=a)
    $$;
    create function private.category_is_ancestor(a uuid, b uuid) returns boolean language sql as $$select false$$;
    insert into categories values ('${categoryId}', 'fixture');
    insert into category_attributes(id, category_id, key, data_type) values ('${attributeId}', '${categoryId}', 'brand', 'text');
    insert into listings values ('${listingId}', '${categoryId}');
    insert into category_attribute_options(id, attribute_id, value) values ('${optionId}', '${attributeId}', 'known');
    insert into listing_attribute_values(listing_id, attribute_id, text_value) values ('${listingId}', '${attributeId}', 'Legacy brand');
  `);
  const migration = await readFile(new URL("../supabase/migrations/0032_catalog_reference_metadata.sql", import.meta.url), "utf8");
  const start = migration.indexOf("create or replace function private.validate_listing_option_attribute()");
  await db.exec(migration.slice(start, migration.indexOf("\n$$;", start) + 4));
  await db.exec(`create trigger fixture_option_validation before insert or update on listing_attribute_option_values
    for each row execute function private.validate_listing_option_attribute();`);
});
after(async () => {await db.close();});

async function transaction(run) {
  await db.exec(`begin;
    create temporary table marketo_catalog_0024_attributes(category_slug text, key text, data_type text) on commit drop;
    insert into marketo_catalog_0024_attributes values ('fixture', 'brand', 'select');`);
  try {await run();} finally {await db.exec("rollback;");}
}
async function unchanged() {
  const result = await db.query("select a.data_type, v.text_value from category_attributes a join listing_attribute_values v on v.attribute_id=a.id");
  assert.deepEqual(result.rows, [{data_type: "text", text_value: "Legacy brand"}]);
  assert.equal((await db.query("select count(*)::int as count from listing_attribute_option_values")).rows[0].count, 0);
}

test("no plan refuses a type change and leaves the baseline intact", async () => {
  const closed = catalogTypeTransformSql([], target, choices);
  await transaction(async () => {await db.exec(closed.setup); await assert.rejects(db.exec(closed.preflight), /not in the reviewed plan/);});
  await unchanged();
});

test("exact mapping preserves IDs and creation time, passes the real option trigger, and is repeatable", async () => {
  await transaction(async () => {
    await db.exec(sql.setup + sql.preflight);
    await db.exec("update category_attributes set data_type='select';");
    await db.exec(sql.backfill + sql.postflight);
    const rows = await db.query("select listing_id, attribute_id, option_id, created_at = '2026-09-01T10:00:00Z'::timestamptz as created_at_preserved from listing_attribute_option_values");
    assert.deepEqual(rows.rows, [{listing_id: listingId, attribute_id: attributeId, option_id: optionId, created_at_preserved: true}]);
    assert.equal((await db.query("select count(*)::int as count from listing_attribute_values")).rows[0].count, 0);
    await db.exec("drop table marketo_catalog_scalar_backfill;");
    await db.exec(sql.preflight + sql.backfill + sql.postflight);
    assert.equal((await db.query("select count(*)::int as count from listing_attribute_option_values")).rows[0].count, 1);
  });
  await unchanged();
});

test("unexpected text, extra typed payload, changed count and changed baseline all abort", async () => {
  for (const [change, expected] of [
    ["update listing_attribute_values set text_value='Different brand'", /unreviewed scalar/],
    ["update listing_attribute_values set number_value=42", /unreviewed scalar/],
    ["delete from listing_attribute_values", /row count changed/],
    ["update category_attributes set data_type='boolean'", /not in the reviewed plan/],
  ]) {
    await transaction(async () => {await db.exec(change);await db.exec(sql.setup);await assert.rejects(db.exec(sql.preflight), expected);});
    await unchanged();
  }
});

test("a failure after insertion rolls back the equivalent option and the type update together", async () => {
  await transaction(async () => {
    await db.exec(sql.setup + sql.preflight);
    await db.exec(`update category_attributes set data_type='select';
      create function pg_temp.reject_fixture_delete() returns trigger language plpgsql as $$begin raise exception 'simulated write failure'; end$$;
      create trigger fixture_reject_delete before delete on listing_attribute_values for each row execute function pg_temp.reject_fixture_delete();`);
    await assert.rejects(db.exec(sql.backfill), /simulated write failure/);
  });
  await unchanged();
});

test("the plan rejects duplicate identities, unknown target choices, missing counts and dependent aliases", () => {
  assert.throws(() => catalogTypeTransformSql([...mapping, ...mapping], target, choices), /Duplicate type transform/);
  assert.throws(() => catalogTypeTransformSql(mapping, target, []), /mapping target/);
  assert.throws(() => catalogTypeTransformSql([{...mapping[0], values: [{text: "Legacy brand", option: "known"}]}], target, choices), /row count/);
  assert.throws(() => catalogTypeTransformSql(mapping, [{...target[0], dependsOnKey: "parent"}], choices), /dependent mapping/);
});
