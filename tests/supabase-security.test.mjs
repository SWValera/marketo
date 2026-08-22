import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = new URL("../", import.meta.url);
const users = {
  owner: "10000000-0000-4000-8000-000000000001",
  buyer: "20000000-0000-4000-8000-000000000002",
  moderator: "30000000-0000-4000-8000-000000000003",
  admin: "40000000-0000-4000-8000-000000000004",
  suspended: "50000000-0000-4000-8000-000000000005",
};

async function applyMigrations(db) {
  const names = (await readdir(new URL("supabase/migrations/", root)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of names) {
    await db.exec(await readFile(new URL(`supabase/migrations/${name}`, root), "utf8"));
  }
  await db.exec(await readFile(new URL("supabase/seeds/001_marketo_reference.sql", root), "utf8"));
}

async function asAuthenticated(db, userId, operation) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await operation();
  } finally {
    await db.exec("reset role;");
  }
}

async function asAnon(db, operation) {
  await db.exec("set role anon; select set_config('request.jwt.claim.sub', '', false);");
  try {
    return await operation();
  } finally {
    await db.exec("reset role;");
  }
}

async function createFixtureDatabase() {
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
  await applyMigrations(db);

  for (const [name, id] of Object.entries(users)) {
    await db.query(
      "insert into auth.users (id, raw_user_meta_data) values ($1, $2::jsonb)",
      [id, JSON.stringify({ display_name: name, language: "ru", status: "admin", role: "admin", verified_at: new Date().toISOString() })],
    );
  }
  await db.query("update public.profiles set status = 'suspended' where id = $1", [users.suspended]);
  await db.query("insert into public.user_roles (user_id, role) values ($1, 'moderator'), ($2, 'admin')", [users.moderator, users.admin]);

  const references = await db.query(`
    select
      (select id from public.settlements where slug = 'astana') as settlement_id,
      (select id from public.categories where slug = 'free-other') as free_category_id,
      (select id from public.categories where slug = 'cars-suv') as car_category_id,
      (
        select attribute.id
        from public.category_attributes as attribute
        join public.categories as category on category.id = attribute.category_id
        where category.slug = 'free-other' and attribute.key = 'condition'
      ) as free_condition_attribute_id,
      (
        select attribute_option.id
        from public.category_attribute_options as attribute_option
        join public.category_attributes as attribute on attribute.id = attribute_option.attribute_id
        join public.categories as category on category.id = attribute.category_id
        where category.slug = 'free-other' and attribute.key = 'condition' and attribute_option.value = 'good'
      ) as free_condition_option_id,
      (
        select attribute.id
        from public.category_attributes as attribute
        join public.categories as category on category.id = attribute.category_id
        where category.slug = 'cars-suv' and attribute.key = 'brand'
      ) as car_brand_attribute_id,
      (
        select attribute_option.id
        from public.category_attribute_options as attribute_option
        join public.category_attributes as attribute on attribute.id = attribute_option.attribute_id
        join public.categories as category on category.id = attribute.category_id
        where category.slug = 'cars-suv' and attribute.key = 'brand' and attribute_option.value = 'toyota'
      ) as car_brand_option_id,
      (
        select attribute.id
        from public.category_attributes as attribute
        join public.categories as category on category.id = attribute.category_id
        where category.slug = 'cars-suv' and attribute.key = 'year'
      ) as car_year_attribute_id
  `);
  const refs = references.rows[0];

  async function createListing(name, status, ownerId = users.owner, categoryId = refs.free_category_id) {
    const publishedAt = status === "active" || status === "archived" || status === "sold" || status === "expired"
      ? new Date().toISOString()
      : null;
    const deletedAt = status === "deleted" ? new Date().toISOString() : null;
    const inserted = await db.query(`
      insert into public.listings (
        owner_id, category_id, settlement_id, slug, title, description,
        price_minor, currency_code, status, published_at, deleted_at
      ) values ($1, $2, $3, $4, $5, $6, 1000, 'KZT', $7, $8, $9)
      returning id
    `, [
      ownerId,
      categoryId,
      refs.settlement_id,
      `security-${name}`,
      `Listing ${name}`,
      `Security fixture description for ${name}`,
      status,
      publishedAt,
      deletedAt,
    ]);
    return inserted.rows[0].id;
  }

  const listings = {
    draftFree: await createListing("draft-free", "draft"),
    draftCar: await createListing("draft-car", "draft", users.owner, refs.car_category_id),
    pendingApprove: await createListing("pending-approve", "pending"),
    pendingReject: await createListing("pending-reject", "pending"),
    activeOwner: await createListing("active-owner", "active"),
    archivedOwner: await createListing("archived-owner", "archived"),
    soldOwner: await createListing("sold-owner", "sold"),
    expiredOwner: await createListing("expired-owner", "expired"),
    rejectedOwner: await createListing("rejected-owner", "rejected"),
    deletedOwner: await createListing("deleted-owner", "deleted"),
    activeBuyer: await createListing("active-buyer", "active", users.buyer),
  };

  await db.query(
    "insert into public.listing_attribute_values (listing_id, attribute_id, number_value) values ($1, $2, 2024)",
    [listings.draftCar, refs.car_year_attribute_id],
  );
  await db.query(
    "insert into public.listing_attribute_option_values (listing_id, attribute_id, option_id) values ($1, $2, $3)",
    [listings.activeOwner, refs.free_condition_attribute_id, refs.free_condition_option_id],
  );
  await db.query(
    "insert into public.listing_images (listing_id, storage_key) values ($1, 'security/draft-owner.webp'), ($2, 'security/active-owner.webp')",
    [listings.draftCar, listings.activeOwner],
  );
  await db.query(
    "insert into public.notifications (user_id, type, payload) values ($1, 'listing.test', '{}'::jsonb)",
    [users.buyer],
  );

  return { db, refs, listings };
}

test("Supabase v2 security and reference-data audit", async (t) => {
  const { db, refs, listings } = await createFixtureDatabase();
  try {
    await t.test("category tree has no cycles, orphans, localization gaps or ordering collisions", async () => {
      const result = await db.query(`
        with recursive category_walk as (
          select category.id, category.parent_id, array[category.id] as path, false as cycle, 0 as depth
          from public.categories as category
          where category.parent_id is null
          union all
          select child.id, child.parent_id, parent.path || child.id,
                 child.id = any(parent.path), parent.depth + 1
          from public.categories as child
          join category_walk as parent on child.parent_id = parent.id
          where not parent.cycle
        )
        select
          (select count(*) from public.categories)::int as total,
          (select count(*) from category_walk)::int as reachable,
          (select count(*) from category_walk where cycle)::int as cycles,
          (select max(depth) from category_walk)::int as max_depth,
          (
            select count(*) from (
              select parent_id, lower(btrim(name_ru))
              from public.categories
              group by parent_id, lower(btrim(name_ru))
              having count(*) > 1
            ) as duplicate_ru
          )::int as duplicate_sibling_ru,
          (
            select count(*) from (
              select parent_id, lower(btrim(name_kk))
              from public.categories
              group by parent_id, lower(btrim(name_kk))
              having count(*) > 1
            ) as duplicate_kk
          )::int as duplicate_sibling_kk,
          (
            select count(*) from (
              select parent_id, sort_order
              from public.categories
              group by parent_id, sort_order
              having count(*) > 1
            ) as duplicate_sort
          )::int as duplicate_sort,
          (select count(*) from public.categories where btrim(name_ru) = '' or btrim(name_kk) = '')::int as empty_names,
          (
            select count(*)
            from public.categories as child
            join public.categories as parent on parent.id = child.parent_id
            where child.is_active and not parent.is_active
          )::int as active_under_inactive
      `);
      assert.deepEqual(result.rows[0], {
        total: 228,
        reachable: 228,
        cycles: 0,
        max_depth: 2,
        duplicate_sibling_ru: 0,
        duplicate_sibling_kk: 0,
        duplicate_sort: 0,
        empty_names: 0,
        active_under_inactive: 0,
      });
      const semanticPaths = await db.query(`
        select child.slug, parent.slug as parent_slug
        from public.categories as child
        left join public.categories as parent on parent.id = child.parent_id
        where child.slug in ('cars', 'cars-suv', 'phones-accessories', 'smartphones')
        order by child.slug
      `);
      assert.deepEqual(semanticPaths.rows, [
        { slug: "cars", parent_slug: "transport" },
        { slug: "cars-suv", parent_slug: "cars" },
        { slug: "phones-accessories", parent_slug: "electronics" },
        { slug: "smartphones", parent_slug: "phones-accessories" },
      ]);
    });

    await t.test("category attributes and options have valid ownership, labels, types and ordering", async () => {
      const result = await db.query(`
        select
          (select count(*) from public.category_attributes)::int as attributes,
          (select count(*) from public.category_attribute_options)::int as options,
          (
            select count(*)
            from public.category_attributes as attribute
            left join public.categories as category on category.id = attribute.category_id
            where category.id is null
          )::int as orphan_attributes,
          (
            select count(*)
            from public.category_attribute_options as attribute_option
            left join public.category_attributes as attribute on attribute.id = attribute_option.attribute_id
            where attribute.id is null
          )::int as orphan_options,
          (
            select count(*) from public.category_attributes
            where btrim(key) = '' or btrim(label_ru) = '' or btrim(label_kk) = ''
              or data_type not in ('text', 'number', 'boolean', 'select', 'multiselect', 'range', 'date')
              or ((unit_ru is null) <> (unit_kk is null))
          )::int as invalid_attributes,
          (
            select count(*) from public.category_attribute_options
            where btrim(value) = '' or btrim(label_ru) = '' or btrim(label_kk) = ''
          )::int as invalid_options
      `);
      assert.deepEqual(result.rows[0], {
        attributes: 712,
        options: 1519,
        orphan_attributes: 0,
        orphan_options: 0,
        invalid_attributes: 0,
        invalid_options: 0,
      });
    });

    await t.test("listing attributes reject a foreign category and a mismatched option", async () => {
      await asAuthenticated(db, users.owner, async () => {
        await assert.rejects(
          db.query(
            "insert into public.listing_attribute_option_values (listing_id, attribute_id, option_id) values ($1, $2, $3)",
            [listings.draftCar, refs.free_condition_attribute_id, refs.free_condition_option_id],
          ),
          /attribute does not apply/i,
        );
        await assert.rejects(
          db.query(
            "insert into public.listing_attribute_option_values (listing_id, attribute_id, option_id) values ($1, $2, $3)",
            [listings.draftCar, refs.car_brand_attribute_id, refs.free_condition_option_id],
          ),
          /attribute option is inactive|foreign key|violates/i,
        );
      });
    });

    await t.test("moderation state machine permits only the reviewed transitions", async () => {
      await asAuthenticated(db, users.moderator, async () => {
        await db.query("select public.moderate_listing($1, 'approve')", [listings.pendingApprove]);
        await db.query("select public.moderate_listing($1, 'hide', 'policy.hidden')", [listings.pendingApprove]);
        await db.query("select public.moderate_listing($1, 'restore')", [listings.pendingApprove]);
        await db.query("select public.moderate_listing($1, 'reject', 'policy.rejected')", [listings.pendingReject]);
      });
      const state = await db.query(
        "select id, status from public.listings where id = any($1::uuid[]) order by id",
        [[listings.pendingApprove, listings.pendingReject]],
      );
      assert.deepEqual(new Set(state.rows.map((row) => row.status)), new Set(["active", "rejected"]));
      const actions = await db.query(
        "select action, previous_status, new_status from public.moderation_actions where listing_id = $1 order by created_at, id",
        [listings.pendingApprove],
      );
      assert.deepEqual(actions.rows.map((row) => [row.action, row.previous_status, row.new_status]), [
        ["approve", "pending", "active"],
        ["hide", "active", "archived"],
        ["restore", "archived", "active"],
      ]);
      const auditCount = await db.query("select count(*)::int as count from public.admin_audit_log where actor_id = $1", [users.moderator]);
      assert.equal(auditCount.rows[0].count, 4);
    });

    await t.test("moderation rejects draft, rejected, sold, expired and deleted revival", async () => {
      await asAuthenticated(db, users.moderator, async () => {
        for (const [listingId, decision, reason] of [
          [listings.draftFree, "approve", null],
          [listings.rejectedOwner, "restore", null],
          [listings.soldOwner, "hide", "policy.invalid"],
          [listings.expiredOwner, "restore", null],
          [listings.deletedOwner, "approve", null],
        ]) {
          await assert.rejects(
            db.query("select public.moderate_listing($1, $2, $3)", [listingId, decision, reason]),
            /not allowed|unavailable/i,
          );
        }
      });
    });

    await t.test("profile reads expose seller fields publicly and protected fields only to self or staff", async () => {
      await asAnon(db, async () => {
        const seller = await db.query("select * from public.seller_profiles where id = $1", [users.owner]);
        assert.equal(seller.rows.length, 1);
        const hidden = await db.query("select * from public.seller_profiles where id = $1", [users.suspended]);
        assert.equal(hidden.rows.length, 0);
        await assert.rejects(db.query("select last_seen_at from public.profiles"), /permission denied/i);
      });
      await asAuthenticated(db, users.buyer, async () => {
        const seller = await db.query("select * from public.seller_profiles where id = $1", [users.owner]);
        assert.equal(seller.rows.length, 1);
        await assert.rejects(db.query("select language_code from public.profiles where id = $1", [users.owner]), /permission denied/i);
        const own = await db.query("select * from public.get_my_profile()");
        assert.equal(own.rows[0].id, users.buyer);
        assert.equal(own.rows[0].status, "active");
      });
      await asAuthenticated(db, users.moderator, async () => {
        const protectedProfile = await db.query("select * from public.get_profile_for_staff($1)", [users.suspended]);
        assert.equal(protectedProfile.rows[0].status, "suspended");
      });
    });

    await t.test("profile creation ignores privileged signup metadata and protected updates are denied", async () => {
      const profile = await db.query("select status, verified_at from public.profiles where id = $1", [users.owner]);
      assert.deepEqual(profile.rows[0], { status: "active", verified_at: null });
      const roles = await db.query("select count(*)::int as count from public.user_roles where user_id = $1", [users.owner]);
      assert.equal(roles.rows[0].count, 0);
      await asAuthenticated(db, users.owner, async () => {
        await db.query("update public.profiles set display_name = 'Updated Owner' where id = $1", [users.owner]);
        await assert.rejects(db.query("update public.profiles set status = 'active' where id = $1", [users.owner]), /permission denied/i);
        await assert.rejects(db.query("update public.profiles set verified_at = now() where id = $1", [users.owner]), /permission denied/i);
        await assert.rejects(db.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [users.owner]), /permission denied/i);
      });
    });

    await t.test("listing child-table reads are state-aware and mutations cannot target another owner", async () => {
      await asAuthenticated(db, users.owner, async () => {
        const ownImages = await db.query("select * from public.listing_images where listing_id = $1", [listings.draftCar]);
        assert.equal(ownImages.rows.length, 1);
        const ownAttributes = await db.query("select * from public.listing_attribute_values where listing_id = $1", [listings.draftCar]);
        assert.equal(ownAttributes.rows.length, 1);
        await assert.rejects(
          db.query("update public.listing_images set sort_order = 10 where listing_id = $1", [listings.draftCar]),
          /permission denied/i,
        );
        await assert.rejects(
          db.query("delete from public.listing_images where listing_id = $1", [listings.draftCar]),
          /permission denied/i,
        );
      });
      await asAuthenticated(db, users.buyer, async () => {
        const hiddenImages = await db.query("select * from public.listing_images where listing_id = $1", [listings.draftCar]);
        assert.equal(hiddenImages.rows.length, 0);
        await assert.rejects(
          db.query(
            "insert into public.listing_attribute_values (listing_id, attribute_id, number_value) values ($1, $2, 2025)",
            [listings.draftCar, refs.car_year_attribute_id],
          ),
          /attribute does not apply|row-level security|violates/i,
        );
        await assert.rejects(
          db.query("insert into public.listing_images (listing_id, storage_key) values ($1, 'security/spoof.webp')", [listings.draftCar]),
          /permission denied/i,
        );
      });
      await asAnon(db, async () => {
        const draftImages = await db.query("select * from public.listing_images where listing_id = $1", [listings.draftCar]);
        const activeImages = await db.query("select * from public.listing_images where listing_id = $1", [listings.activeOwner]);
        const activeOptions = await db.query("select * from public.listing_attribute_option_values where listing_id = $1", [listings.activeOwner]);
        assert.equal(draftImages.rows.length, 0);
        assert.equal(activeImages.rows.length, 1);
        assert.equal(activeOptions.rows.length, 1);
      });
    });

    let conversationId;
    await t.test("conversation RPC returns one buyer-seller-listing conversation", async () => {
      await asAuthenticated(db, users.buyer, async () => {
        const first = await db.query("select public.get_or_create_listing_conversation($1) as id", [listings.activeOwner]);
        const second = await db.query("select public.get_or_create_listing_conversation($1) as id", [listings.activeOwner]);
        conversationId = first.rows[0].id;
        assert.equal(second.rows[0].id, conversationId);
      });
      const count = await db.query("select count(*)::int as count from public.conversations where listing_id = $1", [listings.activeOwner]);
      assert.equal(count.rows[0].count, 1);
    });

    await t.test("message sender spoofing is denied even for another conversation participant", async () => {
      await asAuthenticated(db, users.buyer, async () => {
        await assert.rejects(
          db.query(
            "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'spoof')",
            [conversationId, users.owner],
          ),
          /row-level security|violates/i,
        );
        await db.query(
          "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'valid message')",
          [conversationId, users.buyer],
        );
      });
    });

    await t.test("favorites, reports and notifications remain owner-scoped", async () => {
      await asAuthenticated(db, users.buyer, async () => {
        await db.query("insert into public.favorites (user_id, listing_id) values ($1, $2)", [users.buyer, listings.activeOwner]);
        await assert.rejects(
          db.query("insert into public.favorites (user_id, listing_id) values ($1, $2)", [users.buyer, listings.activeOwner]),
          /unique|duplicate/i,
        );
        await assert.rejects(
          db.query("insert into public.favorites (user_id, listing_id) values ($1, $2)", [users.buyer, listings.archivedOwner]),
          /row-level security|violates/i,
        );
        await db.query(
          "insert into public.reports (reporter_id, listing_id, reason_code) values ($1, $2, 'listing.spam')",
          [users.buyer, listings.activeOwner],
        );
        await assert.rejects(db.query("update public.reports set status = 'resolved' where reporter_id = $1", [users.buyer]), /permission denied/i);
        const notifications = await db.query("select id from public.notifications where user_id = $1", [users.buyer]);
        assert.equal(notifications.rows.length, 1);
        await db.query("update public.notifications set read_at = now() where id = $1", [notifications.rows[0].id]);
        await assert.rejects(
          db.query("insert into public.notifications (user_id, type) values ($1, 'forged')", [users.owner]),
          /permission denied/i,
        );
      });
      await asAuthenticated(db, users.owner, async () => {
        const foreignFavorites = await db.query("select * from public.favorites where user_id = $1", [users.buyer]);
        const foreignReports = await db.query("select * from public.reports where reporter_id = $1", [users.buyer]);
        const foreignNotifications = await db.query("select * from public.notifications where user_id = $1", [users.buyer]);
        assert.equal(foreignFavorites.rows.length, 0);
        assert.equal(foreignReports.rows.length, 0);
        assert.equal(foreignNotifications.rows.length, 0);
      });
    });

    await t.test("ordinary authenticated users cannot escalate roles or invoke moderation", async () => {
      await asAuthenticated(db, users.buyer, async () => {
        await assert.rejects(
          db.query("select public.assign_user_role($1, 'admin', true)", [users.buyer]),
          /admin role required/i,
        );
        await assert.rejects(
          db.query("select public.moderate_listing($1, 'hide', 'forged')", [listings.activeOwner]),
          /moderator role required/i,
        );
        await assert.rejects(
          db.query("select * from public.get_profile_for_staff($1)", [users.owner]),
          /moderator role required/i,
        );
      });
    });

    await t.test("SECURITY DEFINER functions have fixed search paths and no anonymous EXECUTE", async () => {
      const functions = await db.query(`
        select
          namespace.nspname,
          procedure.proname,
          procedure.proconfig,
          has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
          has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute
        from pg_proc as procedure
        join pg_namespace as namespace on namespace.oid = procedure.pronamespace
        where procedure.prosecdef
          and namespace.nspname in ('public', 'private')
        order by namespace.nspname, procedure.proname
      `);
      assert.equal(functions.rows.length, 14);
      assert.ok(functions.rows.every((row) => row.proconfig?.includes('search_path=""')));
      assert.ok(functions.rows.every((row) => row.anon_execute === false));
      const notClientCallable = functions.rows.filter((row) => !row.authenticated_execute).map((row) => row.proname);
      assert.deepEqual(notClientCallable, ["handle_new_auth_user", "touch_conversation_after_message"]);
    });
  } finally {
    await db.close();
  }
});
