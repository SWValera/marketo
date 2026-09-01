import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { categoryOptions, getCategoryPresentation } from "../lib/catalog-config.ts";
import { closePGliteTestDatabase, createPGliteTestDatabase } from "./pglite-test-database.mjs";

const root = new URL("../", import.meta.url);

async function createDatabase() {
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
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create publication supabase_realtime;
    `);
    return db;
  } catch (error) {
    await closePGliteTestDatabase(db);
    throw error;
  }
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
    assert.equal(names.length, 23);
    const rlsCoverage = await db.query(`
      select count(*)::int as total,
             count(*) filter (where relation.relrowsecurity)::int as rls
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relkind = 'r'
    `);
    assert.deepEqual(rlsCoverage.rows[0], { total: 29, rls: 29 });
    const elevatedFunctions = await db.query(`
      select procedure.proname, procedure.proconfig
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where procedure.prosecdef
        and namespace.nspname in ('public', 'private')
    `);
    assert.equal(elevatedFunctions.rows.length, 17);
    assert.ok(elevatedFunctions.rows.every((row) => row.proconfig?.includes('search_path=""')));
    const profileRpcPrivileges = await db.query(`
      select
        has_function_privilege('anon', 'public.get_my_account_profile()', 'EXECUTE') as anon_read,
        has_function_privilege('anon', 'public.update_my_account_profile(text,text,character varying,uuid,text)', 'EXECUTE') as anon_update,
        has_function_privilege('authenticated', 'public.get_my_account_profile()', 'EXECUTE') as authenticated_read,
        has_function_privilege('authenticated', 'public.update_my_account_profile(text,text,character varying,uuid,text)', 'EXECUTE') as authenticated_update
    `);
    assert.deepEqual(profileRpcPrivileges.rows[0], {
      anon_read: false,
      anon_update: false,
      authenticated_read: true,
      authenticated_update: true,
    });
    const ownerLifecycleRpcPrivileges = await db.query(`
      select
        procedure.proname,
        procedure.prosecdef,
        has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_execute
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname in ('get_my_listing_moderation_feedback', 'update_listing_draft')
      order by procedure.proname
    `);
    assert.deepEqual(ownerLifecycleRpcPrivileges.rows, [
      {
        proname: "get_my_listing_moderation_feedback",
        prosecdef: true,
        anon_execute: false,
        authenticated_execute: true,
        service_execute: false,
      },
      {
        proname: "update_listing_draft",
        prosecdef: false,
        anon_execute: false,
        authenticated_execute: true,
        service_execute: false,
      },
    ]);
    const anonymousRpcAllowlist = await db.query(`
      select procedure.proname
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and has_function_privilege('anon', procedure.oid, 'EXECUTE')
      order by procedure.proname
    `);
    assert.deepEqual(anonymousRpcAllowlist.rows, [
      { proname: "get_city_premium_placements" },
      { proname: "search_catalog_listing_cards" },
    ]);
    const anonymousPrivateRpcCount = await db.query(`
      select count(*)::int as count
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'private'
        and has_function_privilege('anon', procedure.oid, 'EXECUTE')
    `);
    assert.equal(anonymousPrivateRpcCount.rows[0].count, 0);
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
        (select count(*) from public.category_attribute_options)::int as options,
        (select count(*) from public.city_premium_settings)::int as premium_settings,
        (select count(*) from public.city_premium_settings where capacity = 15)::int as default_capacity_settings,
        (select count(*) from public.city_premium_accounts)::int as premium_accounts,
        (select count(*) from public.city_premium_orders)::int as premium_orders,
        (select count(*) from public.city_premium_placements)::int as premium_placements,
        (select count(*) from public.city_premium_events)::int as premium_events,
        (select count(*) from public.city_premium_daily_metrics)::int as premium_daily_metrics
    `);
    assert.deepEqual(result.rows[0], {
      countries: 1,
      regions: 20,
      settlements: 90,
      categories: 1356,
      attributes: 9373,
      options: 87150,
      premium_settings: 90,
      default_capacity_settings: 90,
      premium_accounts: 0,
      premium_orders: 0,
      premium_placements: 0,
      premium_events: 0,
      premium_daily_metrics: 0,
    });

    const contextualMetadata = await db.query(`
      select
        slug,
        search_placeholder_ru,
        search_placeholder_kk,
        title_placeholder_ru,
        title_placeholder_kk,
        description_hint_ru,
        description_hint_kk
      from public.categories
    `);
    assert.equal(contextualMetadata.rows.length, 1_356);
    const contextualBySlug = new Map(contextualMetadata.rows.map((row) => [row.slug, row]));
    for (const category of categoryOptions) {
      const expected = getCategoryPresentation(category.slug);
      assert.deepEqual(contextualBySlug.get(category.slug), {
        slug: category.slug,
        search_placeholder_ru: expected.searchPlaceholder.ru,
        search_placeholder_kk: expected.searchPlaceholder.kk,
        title_placeholder_ru: expected.titlePlaceholder.ru,
        title_placeholder_kk: expected.titlePlaceholder.kk,
        description_hint_ru: expected.descriptionHint.ru,
        description_hint_kk: expected.descriptionHint.kk,
      });
    }

    const categoryQuality = await db.query(`
      with recursive ancestry as (
        select category.id as start_id, category.parent_id as current_id,
               array[category.id]::uuid[] as path, false as cycle
        from public.categories as category
        union all
        select ancestry.start_id, parent.parent_id,
               ancestry.path || parent.id,
               parent.id = any(ancestry.path)
        from ancestry
        join public.categories as parent on parent.id = ancestry.current_id
        where not ancestry.cycle
      )
      select
        (select count(*)::int from public.categories as category left join public.categories as parent on parent.id = category.parent_id where category.parent_id is not null and parent.id is null) as orphan_categories,
        (select count(*)::int from ancestry where cycle) as category_cycles,
        (select count(*)::int from (select slug from public.categories group by slug having count(*) > 1) as duplicates) as duplicate_slugs,
        (select count(*)::int from public.categories as category where category.is_active and not exists (select 1 from public.category_attributes as attribute where attribute.category_id = category.id and attribute.is_active and attribute.is_visible)) as categories_without_attributes,
        (select count(*)::int from public.category_attributes as attribute where attribute.is_active and attribute.data_type in ('select', 'multiselect') and not exists (select 1 from public.category_attribute_options as option where option.attribute_id = attribute.id and option.is_active)) as empty_selects,
        (select count(*)::int from public.category_attributes where is_active and (btrim(label_ru) = '' or btrim(label_kk) = '')) as attribute_locale_gaps,
        (select count(*)::int from public.category_attribute_options where is_active and (btrim(label_ru) = '' or btrim(label_kk) = '')) as option_locale_gaps,
        (select count(*)::int
          from public.category_attribute_options as option
          join public.category_attributes as child_attribute on child_attribute.id = option.attribute_id
          left join public.category_attribute_options as parent_option on parent_option.id = option.parent_option_id
          left join public.category_attributes as parent_attribute on parent_attribute.id = parent_option.attribute_id
          where option.is_active and child_attribute.depends_on_key is not null
            and option.value <> 'other-model'
            and (parent_option.id is null or parent_attribute.category_id <> child_attribute.category_id or parent_attribute.key <> child_attribute.depends_on_key)
        ) as broken_dependencies
    `);
    assert.deepEqual(categoryQuality.rows[0], {
      orphan_categories: 0,
      category_cycles: 0,
      duplicate_slugs: 0,
      categories_without_attributes: 0,
      empty_selects: 0,
      attribute_locale_gaps: 0,
      option_locale_gaps: 0,
      broken_dependencies: 0,
    });

    for (const migrationName of ["0017_master_catalog.sql"]) {
      const migration = await readFile(new URL(`supabase/migrations/${migrationName}`, root), "utf8");
      await db.exec(migration);
      await db.exec(migration);
    }
    await db.query("select private.apply_contextual_catalog_metadata()");
    const repeatedReferenceCounts = await db.query(`
      select
        (select count(*) from public.category_attributes)::int as attributes,
        (select count(*) from public.category_attribute_options)::int as options
    `);
    assert.deepEqual(repeatedReferenceCounts.rows[0], { attributes: 9373, options: 87150 });

    const passengerCars = await db.query(`
      select
        count(*) filter (where attribute.key = 'brand')::int as brand_fields,
        count(*) filter (where attribute.key = 'engine_volume')::int as engine_fields,
        count(*) filter (where attribute.key = 'condition')::int as condition_fields,
        count(*) filter (where attribute.key = 'body' and attribute.is_active)::int as active_body_fields,
        (
          select count(*)::int
          from public.category_attribute_options as option
          join public.category_attributes as brand on brand.id = option.attribute_id
          join public.categories as brand_category on brand_category.id = brand.category_id
          where brand_category.slug = 'cars-suv'
            and brand.key = 'brand'
            and option.is_active
        ) as suv_brands
      from public.category_attributes as attribute
      join public.categories as category on category.id = attribute.category_id
      where category.slug = 'cars' or category.parent_id = (select id from public.categories where slug = 'cars')
    `);
    assert.deepEqual(passengerCars.rows[0], {
      brand_fields: 11,
      engine_fields: 11,
      condition_fields: 11,
      active_body_fields: 0,
      suv_brands: 141,
    });

    const scopedModels = await db.query(`
      select
        count(*) filter (where category.slug = 'cars-suv' and option.value = 'toyota:camry')::int as camry_suv,
        count(*) filter (where category.slug = 'cars-sedan' and option.value = 'toyota:camry')::int as camry_sedan,
        count(*) filter (where category.slug = 'cars-suv' and option.value = 'bmw:x5')::int as x5_suv
      from public.category_attribute_options as option
      join public.category_attributes as attribute on attribute.id = option.attribute_id and attribute.key = 'model'
      join public.categories as category on category.id = attribute.category_id
      where option.is_active
    `);
    assert.deepEqual(scopedModels.rows[0], { camry_suv: 0, camry_sedan: 1, x5_suv: 1 });

    const deviceIsolation = await db.query(`
      select
        count(*) filter (where category.slug = 'tablets' and option.label_ru like 'iPhone%')::int as iphone_tablets,
        count(*) filter (where category.slug = 'smartphones' and option.label_ru like 'iPad%')::int as ipad_smartphones,
        count(*) filter (where category.slug = 'smartphones' and option.value in ('apple:iphone-17', 'apple:iphone-air', 'apple:iphone-17-pro', 'apple:iphone-17-pro-max', 'apple:iphone-17e'))::int as current_apple_phones
      from public.category_attribute_options as option
      join public.category_attributes as attribute on attribute.id = option.attribute_id and attribute.key = 'model'
      join public.categories as category on category.id = attribute.category_id
      where option.is_active
    `);
    assert.deepEqual(deviceIsolation.rows[0], { iphone_tablets: 0, ipad_smartphones: 0, current_apple_phones: 5 });

    const userId = "10000000-0000-4000-8000-000000000001";
    await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2::jsonb)", [userId, JSON.stringify({ display_name: "Test User", language: "ru" })]);
    const profile = await db.query("select display_name, language_code from public.profiles where id = $1", [userId]);
    assert.deepEqual(profile.rows[0], { display_name: "Test User", language_code: "ru" });
    const accountSettlement = await db.query("select id from public.settlements where slug = 'astana'");
    const accountSettlementId = accountSettlement.rows[0].id;
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
    const accountProfile = await db.query(
      "select display_name, language_code, settlement_id, contact_phone_e164 from public.update_my_account_profile($1,$2,$3,$4,$5)",
      ["Updated Test User", "Профиль после регистрации", "kk", accountSettlementId, "+77001234567"],
    );
    assert.deepEqual(accountProfile.rows[0], {
      display_name: "Updated Test User",
      language_code: "kk",
      settlement_id: accountSettlementId,
      contact_phone_e164: "+77001234567",
    });
    await db.exec("reset role;");

    const vehicleReferences = await db.query(`
      select
        category.id as category_id,
        settlement.id as settlement_id,
        brand.id as brand_attribute_id,
        model.id as model_attribute_id,
        year.id as year_attribute_id,
        toyota.id as toyota_option_id,
        bmw.id as bmw_option_id,
        rav4.id as rav4_option_id
      from public.categories as category
      cross join public.settlements as settlement
      join public.category_attributes as brand on brand.category_id = category.id and brand.key = 'brand'
      join public.category_attributes as model on model.category_id = category.id and model.key = 'model'
      join public.category_attributes as year on year.category_id = category.id and year.key = 'year'
      join public.category_attribute_options as toyota on toyota.attribute_id = brand.id and toyota.value = 'toyota'
      join public.category_attribute_options as bmw on bmw.attribute_id = brand.id and bmw.value = 'bmw'
      join public.category_attribute_options as rav4 on rav4.attribute_id = model.id and rav4.value = 'toyota:rav4'
      where category.slug = 'cars-suv' and settlement.slug = 'astana'
    `);
    const vehicle = vehicleReferences.rows[0];
    const validAttributes = JSON.stringify([
      { attribute_id: vehicle.brand_attribute_id, data_type: "select", option_ids: [vehicle.toyota_option_id] },
      { attribute_id: vehicle.model_attribute_id, data_type: "select", option_ids: [vehicle.rav4_option_id] },
      { attribute_id: vehicle.year_attribute_id, data_type: "number", value: 2022 },
    ]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
    const createdVehicle = await db.query(
      "select * from public.create_listing_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",
      [vehicle.category_id, vehicle.settlement_id, "Toyota RAV4 2022", "Проверочное объявление с характеристиками автомобиля", 18500000, "KZT", "Test User", "+77000000000", true, validAttributes],
    );
    const vehicleListingId = createdVehicle.rows[0].listing_id;
    const savedValues = await db.query(`
      select attribute.key, coalesce(option.value, scalar.number_value::text) as value
      from public.category_attributes as attribute
      left join public.listing_attribute_values as scalar
        on scalar.attribute_id = attribute.id and scalar.listing_id = $1
      left join public.listing_attribute_option_values as selected
        on selected.attribute_id = attribute.id and selected.listing_id = $1
      left join public.category_attribute_options as option on option.id = selected.option_id
      where attribute.category_id = $2 and (scalar.listing_id is not null or selected.listing_id is not null)
      order by attribute.sort_order
    `, [vehicleListingId, vehicle.category_id]);
    assert.deepEqual(savedValues.rows, [
      { key: "brand", value: "toyota" },
      { key: "model", value: "toyota:rav4" },
      { key: "year", value: "2022" },
    ]);

    const invalidAttributes = JSON.stringify([
      { attribute_id: vehicle.brand_attribute_id, data_type: "select", option_ids: [vehicle.bmw_option_id] },
      { attribute_id: vehicle.model_attribute_id, data_type: "select", option_ids: [vehicle.rav4_option_id] },
    ]);
    await assert.rejects(
      db.query(
        "select * from public.create_listing_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",
        [vehicle.category_id, vehicle.settlement_id, "Несогласованная модель", "Эта транзакция должна быть полностью отменена", 1000000, "KZT", "Test User", "+77000000000", true, invalidAttributes],
      ),
      /dependent option does not match/i,
    );
    await db.exec("reset role;");
    await db.query("insert into public.listing_images (listing_id, storage_key) values ($1, 'tests/vehicle.webp')", [vehicleListingId]);
    await db.query("update public.listings set status = 'active', published_at = now() where id = $1", [vehicleListingId]);
    await db.exec("set role anon;");
    const filteredVehicle = await db.query(`
      select id
      from public.search_catalog_listing_cards(
        array[$1]::uuid[], null, 'RAV4', null, null,
        '{"brand":"toyota","year_min":"2020","year_max":"2024"}'::jsonb
      )
    `, [vehicle.category_id]);
    assert.deepEqual(filteredVehicle.rows, [{ id: vehicleListingId }]);
    const rejectedByDynamicFilter = await db.query(`
      select id
      from public.search_catalog_listing_cards(
        array[$1]::uuid[], null, null, null, null,
        '{"brand":"bmw","year_max":"2020"}'::jsonb
      )
    `, [vehicle.category_id]);
    assert.deepEqual(rejectedByDynamicFilter.rows, []);
    await db.exec("reset role;");

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
    assert.equal(anonListings.rows[0].count, 1);
    const publicProfile = await db.query("select id, display_name from public.profiles");
    assert.equal(publicProfile.rows.length, 1);
    await assert.rejects(db.query("select last_seen_at from public.profiles"), /permission denied/i);
    await db.exec("reset role;");

    const premiumListings = await db.query(`
      insert into public.listings (
        owner_id, category_id, settlement_id, slug, title, description,
        price_minor, currency_code, status, published_at
      )
      select
        $1, $2, $3, 'premium-capacity-' || series,
        'Premium capacity ' || series,
        'Premium Showcase capacity regression fixture ' || series,
        series * 1000, 'KZT', 'active', current_timestamp
      from generate_series(1, 16) as series
      returning id
    `, [userId, categoryId, settlementId]);
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 86_400_000).toISOString();
    for (const row of premiumListings.rows.slice(0, 15)) {
      await db.query(
        "insert into public.city_premium_placements (settlement_id, listing_id, starts_at, ends_at) values ($1,$2,$3,$4)",
        [settlementId, row.id, startsAt, endsAt],
      );
    }
    await assert.rejects(
      db.query(
        "insert into public.city_premium_placements (settlement_id, listing_id, starts_at, ends_at) values ($1,$2,$3,$4)",
        [settlementId, premiumListings.rows[15].id, startsAt, endsAt],
      ),
      /city premium capacity exceeded/i,
    );
    await db.query(
      "update public.city_premium_placements set status = 'cancelled' where settlement_id = $1 and listing_id = $2",
      [settlementId, premiumListings.rows[0].id],
    );
    await db.query(
      "insert into public.city_premium_placements (settlement_id, listing_id, starts_at, ends_at) values ($1,$2,$3,$4)",
      [settlementId, premiumListings.rows[15].id, startsAt, endsAt],
    );
    await db.exec("set role anon;");
    const publicPremium = await db.query(
      "select listing_id from public.get_city_premium_placements($1, 50)",
      [settlementId],
    );
    assert.equal(publicPremium.rows.length, 15);
    assert.ok(publicPremium.rows.every((row) => row.listing_id !== premiumListings.rows[0].id));
    await db.exec("reset role;");
  } finally {
    await closePGliteTestDatabase(db);
  }
});
