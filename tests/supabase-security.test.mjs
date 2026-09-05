import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { closePGliteTestDatabase, createPGliteTestDatabase } from "./pglite-test-database.mjs";

const root = new URL("../", import.meta.url);
const users = {
  owner: "10000000-0000-4000-8000-000000000001",
  buyer: "20000000-0000-4000-8000-000000000002",
  moderator: "30000000-0000-4000-8000-000000000003",
  admin: "40000000-0000-4000-8000-000000000004",
  suspended: "50000000-0000-4000-8000-000000000005",
  support: "60000000-0000-4000-8000-000000000006",
  suspendedModerator: "70000000-0000-4000-8000-000000000007",
  bannedAdmin: "80000000-0000-4000-8000-000000000008",
};

async function applyMigrations(db) {
  const names = (await readdir(new URL("supabase/migrations/", root)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of names) {
    if (name === "0025_security_boundary_repair.sql") {
      await db.exec(`
        alter default privileges grant execute on functions
        to public, anon, authenticated, service_role;
        alter default privileges in schema public, private grant execute on functions
        to public, anon, authenticated, service_role;
        grant execute on all functions in schema public, private
        to public, anon, authenticated, service_role;
        alter table public.profiles disable row level security;
        alter table public.listings disable row level security;
        alter table public.listing_attribute_values disable row level security;
        alter table public.listing_attribute_option_values disable row level security;
        alter table public.listing_images disable row level security;
        alter function public.update_listing_draft(
          uuid, uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb
        ) security definer;
        alter function public.get_my_listing_moderation_feedback(uuid)
          security invoker;
        alter function public.get_my_listing_moderation_feedback(uuid)
          volatile;

        create or replace function private.has_any_role(required_roles text[])
        returns boolean
        language sql
        stable
        security definer
        set search_path = ''
        as $$
          select coalesce(
            exists (
              select 1
              from public.user_roles as role_row
              where role_row.user_id = (select auth.uid())
                and role_row.role = any(required_roles)
            ),
            false
          )
        $$;

        create or replace function public.moderate_listing(
          target_listing_id uuid,
          decision text,
          reason_code text default null,
          note text default null
        )
        returns void
        language plpgsql
        security definer
        set search_path = ''
        as $$
        begin
          return;
        end
        $$;

        drop policy if exists listings_authenticated_read on public.listings;
        create policy listings_authenticated_read
        on public.listings for select to authenticated
        using (
          (status = 'active' and published_at is not null and deleted_at is null)
          or owner_id = (select auth.uid())
          or (select private.has_any_role(array['support', 'moderator', 'admin']))
        );

        drop policy if exists profiles_moderation_staff_read on public.profiles;

        drop policy if exists listing_attribute_values_authenticated_read
          on public.listing_attribute_values;
        create policy listing_attribute_values_authenticated_read
          on public.listing_attribute_values for select to authenticated
          using (true);

        drop policy if exists listing_attribute_options_authenticated_read
          on public.listing_attribute_option_values;
        create policy listing_attribute_options_authenticated_read
          on public.listing_attribute_option_values for select to authenticated
          using (true);

        drop policy if exists listing_images_authenticated_read
          on public.listing_images;
        create policy listing_images_authenticated_read
          on public.listing_images for select to authenticated
          using (true);
      `);
    }
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

async function buildRequiredAttributePayload(db, categoryId, overrides = {}) {
  const required = await db.query(`
    select id, key, data_type, validation, depends_on_key
    from public.category_attributes
    where category_id = $1
      and is_active
      and is_visible
      and (is_required or key = any($2::text[]))
    order by sort_order, id
  `, [categoryId, Object.keys(overrides)]);
  const selectedOptionValues = new Map();
  const payload = [];

  for (const attribute of required.rows) {
    const override = overrides[attribute.key];
    if (override) {
      const { selectedValue, ...fields } = override;
      payload.push({ attribute_id: attribute.id, data_type: attribute.data_type, ...fields });
      if (selectedValue !== undefined) selectedOptionValues.set(attribute.key, selectedValue);
      continue;
    }

    if (attribute.data_type === "select" || attribute.data_type === "multiselect") {
      const parentValue = attribute.depends_on_key
        ? selectedOptionValues.get(attribute.depends_on_key) ?? null
        : null;
      const selected = await db.query(`
        select option.id, option.value
        from public.category_attribute_options as option
        left join public.category_attribute_options as parent on parent.id = option.parent_option_id
        where option.attribute_id = $1
          and option.is_active
          and (
            $2::text is null
            or parent.value = $2
            or option.parent_option_id is null
          )
        order by
          case
            when $2::text is not null and parent.value = $2 then 0
            when option.parent_option_id is null then 1
            else 2
          end,
          option.sort_order,
          option.id
        limit 1
      `, [attribute.id, parentValue]);
      assert.equal(selected.rows.length, 1, `required option is missing for ${attribute.key}`);
      selectedOptionValues.set(attribute.key, selected.rows[0].value);
      payload.push({
        attribute_id: attribute.id,
        data_type: attribute.data_type,
        option_ids: [selected.rows[0].id],
      });
      continue;
    }

    const validation = attribute.validation ?? {};
    const minimum = Number.isFinite(Number(validation.min)) ? Number(validation.min) : 1;
    if (attribute.data_type === "range") {
      payload.push({
        attribute_id: attribute.id,
        data_type: attribute.data_type,
        min: minimum,
        max: minimum,
      });
    } else {
      const value = attribute.data_type === "number"
        ? minimum
        : attribute.data_type === "boolean"
          ? true
          : attribute.data_type === "date"
            ? "2026-01-01"
            : "fixture";
      payload.push({ attribute_id: attribute.id, data_type: attribute.data_type, value });
    }
  }

  return payload;
}

async function createFixtureDatabase() {
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
  await applyMigrations(db);

  for (const [name, id] of Object.entries(users)) {
    await db.query(
      "insert into auth.users (id, raw_user_meta_data) values ($1, $2::jsonb)",
      [id, JSON.stringify({ display_name: name, language: "ru", status: "admin", role: "admin", verified_at: new Date().toISOString() })],
    );
  }
  await db.query("update public.profiles set status = 'suspended' where id = $1", [users.suspended]);
  await db.query("update public.profiles set status = 'suspended' where id = $1", [users.suspendedModerator]);
  await db.query("update public.profiles set status = 'banned' where id = $1", [users.bannedAdmin]);
  await db.query(`
    insert into public.user_roles (user_id, role) values
      ($1, 'moderator'),
      ($2, 'admin'),
      ($3, 'support'),
      ($4, 'moderator'),
      ($5, 'admin')
  `, [users.moderator, users.admin, users.support, users.suspendedModerator, users.bannedAdmin]);

  const references = await db.query(`
    select
      (select id from public.settlements where slug = 'astana') as settlement_id,
      (select id from public.categories where slug = 'free-other') as free_category_id,
      (select id from public.categories where slug = 'cars') as cars_group_category_id,
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
        where category.slug = 'cars-suv' and attribute.key = 'model'
      ) as car_model_attribute_id,
      (
        select attribute_option.id
        from public.category_attribute_options as attribute_option
        join public.category_attributes as attribute on attribute.id = attribute_option.attribute_id
        join public.categories as category on category.id = attribute.category_id
        where category.slug = 'cars-suv' and attribute.key = 'model' and attribute_option.value = 'toyota:rav4'
      ) as car_model_option_id,
      (
        select attribute.id
        from public.category_attributes as attribute
        join public.categories as category on category.id = attribute.category_id
        where category.slug = 'cars-suv' and attribute.key = 'condition'
      ) as car_condition_attribute_id,
      (
        select attribute_option.id
        from public.category_attribute_options as attribute_option
        join public.category_attributes as attribute on attribute.id = attribute_option.attribute_id
        join public.categories as category on category.id = attribute.category_id
        where category.slug = 'cars-suv' and attribute.key = 'condition' and attribute_option.value = 'used'
      ) as car_condition_option_id,
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
    pendingApprove: await createListing("pending-approve", "pending", users.owner, refs.car_category_id),
    pendingReject: await createListing("pending-reject", "pending", users.owner, refs.car_category_id),
    activeOwner: await createListing("active-owner", "active"),
    archivedOwner: await createListing("archived-owner", "archived"),
    soldOwner: await createListing("sold-owner", "sold"),
    expiredOwner: await createListing("expired-owner", "expired"),
    rejectedOwner: await createListing("rejected-owner", "rejected"),
    deletedOwner: await createListing("deleted-owner", "deleted"),
    activeBuyer: await createListing("active-buyer", "active", users.buyer),
  };

  await db.query(
    `insert into public.listing_attribute_values (listing_id, attribute_id, number_value)
     values ($1, $2, 2024), ($3, $2, 2023)`,
    [listings.draftCar, refs.car_year_attribute_id, listings.pendingApprove],
  );
  await db.query(
    `insert into public.listing_attribute_option_values (listing_id, attribute_id, option_id)
     values ($1, $2, $3), ($4, $5, $6)`,
    [
      listings.activeOwner,
      refs.free_condition_attribute_id,
      refs.free_condition_option_id,
      listings.pendingApprove,
      refs.car_brand_attribute_id,
      refs.car_brand_option_id,
    ],
  );
  await db.query(
    "insert into public.listing_images (listing_id, storage_key) values ($1, 'security/draft-owner.webp'), ($2, 'security/active-owner.webp'), ($3, 'security/pending-owner.webp')",
    [listings.draftCar, listings.activeOwner, listings.pendingApprove],
  );
  await db.query(
    "insert into public.notifications (user_id, type, payload) values ($1, 'listing.test', '{}'::jsonb)",
    [users.buyer],
  );

    return { db, refs, listings };
  } catch (error) {
    await closePGliteTestDatabase(db);
    throw error;
  }
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
        total: 1356,
        reachable: 1356,
        cycles: 0,
        max_depth: 4,
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
          (select count(*) from public.category_attributes where is_active)::int as attributes,
          (select count(*) from public.category_attribute_options where is_active)::int as options,
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
        attributes: 14310,
        options: 84490,
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

    await t.test("listing writes reject parent and inactive categories on insert and update", async () => {
      const inactiveLeaf = await db.query("select id from public.categories where slug = 'other-transport-unlisted'");
      await db.query("update public.categories set is_active = false where id = $1", [inactiveLeaf.rows[0].id]);
      // Use the privileged test connection so table grants/RLS do not mask the
      // trigger under test. Product roles still reach listing creation via RPC.
      await assert.rejects(
        db.query(
          `insert into public.listings (
            owner_id, category_id, settlement_id, slug, title, description,
            price_minor, currency_code, status
          ) values ($1, $2, $3, 'security-parent-category', 'Parent category', 'Parent category must be rejected', 1000, 'KZT', 'draft')`,
          [users.owner, refs.cars_group_category_id, refs.settlement_id],
        ),
        /active leaf category/i,
      );
      await assert.rejects(
        db.query(
          `insert into public.listings (
            owner_id, category_id, settlement_id, slug, title, description,
            price_minor, currency_code, status
          ) values ($1, $2, $3, 'security-inactive-category', 'Inactive category', 'Inactive leaf category must be rejected', 1000, 'KZT', 'draft')`,
          [users.owner, inactiveLeaf.rows[0].id, refs.settlement_id],
        ),
        /active leaf category/i,
      );
      await assert.rejects(
        db.query("update public.listings set category_id = $1 where id = $2", [refs.cars_group_category_id, listings.draftFree]),
        /active leaf category/i,
      );
      const unchanged = await db.query("select category_id from public.listings where id = $1", [listings.draftFree]);
      assert.equal(unchanged.rows[0].category_id, refs.free_category_id);
    });

    await t.test("pending queue and staff helpers require an active moderator or admin", async () => {
      for (const [userId, expectedCount, expectedRole] of [
        [users.moderator, 2, true],
        [users.admin, 2, true],
        [users.buyer, 0, false],
        [users.support, 0, false],
        [users.suspendedModerator, 0, false],
        [users.bannedAdmin, 0, false],
      ]) {
        await asAuthenticated(db, userId, async () => {
          const queue = await db.query("select id from public.listings where status = 'pending' order by created_at, id");
          assert.equal(queue.rows.length, expectedCount, userId);
          const role = await db.query("select private.has_any_role(array['moderator', 'admin']) as allowed");
          assert.equal(role.rows[0].allowed, expectedRole, userId);
        });
      }
      await asAuthenticated(db, users.support, async () => {
        await assert.rejects(
          db.query("select * from public.get_profile_for_staff($1)", [users.owner]),
          /moderator role required/i,
        );
      });
      await asAuthenticated(db, users.suspendedModerator, async () => {
        await assert.rejects(
          db.query("select public.moderate_listing($1, 'approve')", [listings.pendingApprove]),
          /moderator role required/i,
        );
      });
      await asAuthenticated(db, users.bannedAdmin, async () => {
        await assert.rejects(
          db.query("select public.assign_user_role($1, 'support', true)", [users.buyer]),
          /admin role required/i,
        );
      });
    });

    await t.test("pending child data follows listing RLS for anon, owner, staff and inactive roles", async () => {
      const pendingChildren = async () => db.query(`
        select
          (select count(*)::int from public.listing_images where listing_id = $1) as images,
          (select count(*)::int from public.listing_attribute_values where listing_id = $1) as scalar_values,
          (select count(*)::int from public.listing_attribute_option_values where listing_id = $1) as option_values
      `, [listings.pendingApprove]);
      const expectedVisible = { images: 1, scalar_values: 1, option_values: 1 };
      const expectedHidden = { images: 0, scalar_values: 0, option_values: 0 };
      await asAnon(db, async () => {
        assert.deepEqual((await pendingChildren()).rows[0], expectedHidden);
        const active = await db.query("select storage_key from public.listing_images where listing_id = $1", [listings.activeOwner]);
        assert.equal(active.rows.length, 1);
      });
      await asAuthenticated(db, users.owner, async () => assert.deepEqual((await pendingChildren()).rows[0], expectedVisible));
      await asAuthenticated(db, users.buyer, async () => assert.deepEqual((await pendingChildren()).rows[0], expectedHidden));
      await asAuthenticated(db, users.moderator, async () => assert.deepEqual((await pendingChildren()).rows[0], expectedVisible));
      await asAuthenticated(db, users.admin, async () => assert.deepEqual((await pendingChildren()).rows[0], expectedVisible));
      await asAuthenticated(db, users.support, async () => assert.deepEqual((await pendingChildren()).rows[0], expectedHidden));
      await asAuthenticated(db, users.suspendedModerator, async () => assert.deepEqual((await pendingChildren()).rows[0], expectedHidden));
      await asAuthenticated(db, users.bannedAdmin, async () => assert.deepEqual((await pendingChildren()).rows[0], expectedHidden));
    });

    await t.test("moderation input rejects missing or invalid reasons and oversized notes", async () => {
      await asAuthenticated(db, users.moderator, async () => {
        await assert.rejects(
          db.query("select public.moderate_listing($1, 'reject')", [listings.pendingReject]),
          /reason_code is required/i,
        );
        await assert.rejects(
          db.query("select public.moderate_listing($1, 'reject', 'free.form')", [listings.pendingReject]),
          /invalid moderation reason_code/i,
        );
        await assert.rejects(
          db.query("select public.moderate_listing($1, 'reject', 'other', $2)", [listings.pendingReject, "x".repeat(2001)]),
          /moderation note is too long/i,
        );
      });
      const unchanged = await db.query("select status from public.listings where id = $1", [listings.pendingReject]);
      assert.equal(unchanged.rows[0].status, "pending");
    });

    await t.test("moderation state machine permits only the reviewed transitions", async () => {
      await asAuthenticated(db, users.moderator, async () => {
        await db.query("select public.moderate_listing($1, 'approve', null, 'approved after review')", [listings.pendingApprove]);
        await db.query("select public.moderate_listing($1, 'hide', 'policy_violation', 'hidden after review')", [listings.pendingApprove]);
        await db.query("select public.moderate_listing($1, 'restore', null, 'restored after review')", [listings.pendingApprove]);
        await db.query("select public.moderate_listing($1, 'reject', 'wrong_category', 'move to another category')", [listings.pendingReject]);
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
      const rejection = await db.query(
        "select moderator_id, previous_status, new_status, action, reason_code, note from public.moderation_actions where listing_id = $1",
        [listings.pendingReject],
      );
      assert.deepEqual(rejection.rows[0], {
        moderator_id: users.moderator,
        previous_status: "pending",
        new_status: "rejected",
        action: "reject",
        reason_code: "wrong_category",
        note: "move to another category",
      });
      const rejectionAudit = await db.query(
        "select actor_id, action, entity_type, entity_id, metadata from public.admin_audit_log where action = 'listing.reject' and entity_id = $1",
        [listings.pendingReject],
      );
      assert.equal(rejectionAudit.rows[0].actor_id, users.moderator);
      assert.equal(rejectionAudit.rows[0].entity_type, "listing");
      assert.equal(rejectionAudit.rows[0].metadata.reason_code, "wrong_category");
      assert.equal(rejectionAudit.rows[0].metadata.note, "move to another category");
      await asAuthenticated(db, users.admin, async () => {
        await assert.rejects(
          db.query("select public.moderate_listing($1, 'approve')", [listings.pendingApprove]),
          /transition .* not allowed/i,
        );
      });
    });

    await t.test("moderation rejects draft, rejected, sold, expired and deleted revival", async () => {
      await asAuthenticated(db, users.moderator, async () => {
        for (const [listingId, decision, reason] of [
          [listings.draftFree, "approve", null],
          [listings.rejectedOwner, "restore", null],
          [listings.soldOwner, "hide", "policy_violation"],
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

    await t.test("account profile RPC updates only the authenticated active owner", async () => {
      await asAnon(db, async () => {
        await assert.rejects(
          db.query("select * from public.get_my_account_profile()"),
          /permission denied/i,
        );
        await assert.rejects(
          db.query("select * from public.update_my_account_profile($1,$2,$3,$4,$5)", ["Anonymous", null, "ru", refs.settlement_id, null]),
          /permission denied/i,
        );
      });
      await asAuthenticated(db, users.buyer, async () => {
        const updated = await db.query(
          "select display_name, language_code, settlement_id, contact_phone_e164 from public.update_my_account_profile($1,$2,$3,$4,$5)",
          ["Buyer Updated", "Buyer bio", "kk", refs.settlement_id, "+77005550102"],
        );
        assert.deepEqual(updated.rows[0], {
          display_name: "Buyer Updated",
          language_code: "kk",
          settlement_id: refs.settlement_id,
          contact_phone_e164: "+77005550102",
        });
        const own = await db.query("select display_name, contact_phone_e164 from public.get_my_account_profile()");
        assert.deepEqual(own.rows[0], { display_name: "Buyer Updated", contact_phone_e164: "+77005550102" });
      });
      const owner = await db.query("select display_name from public.profiles where id = $1", [users.owner]);
      assert.notEqual(owner.rows[0].display_name, "Buyer Updated");
      await asAuthenticated(db, users.suspended, async () => {
        await assert.rejects(
          db.query("select * from public.update_my_account_profile($1,$2,$3,$4,$5)", ["Suspended", null, "ru", refs.settlement_id, null]),
          /active profile required/i,
        );
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

    await t.test("owner draft update atomically replaces the aggregate and enforces owner/state boundaries", async () => {
      const original = await db.query("select slug from public.listings where id = $1", [listings.draftCar]);
      const freeAttributes = JSON.stringify([
        {
          attribute_id: refs.free_condition_attribute_id,
          data_type: "select",
          option_ids: [refs.free_condition_option_id],
        },
      ]);

      await asAuthenticated(db, users.owner, async () => {
        const updated = await db.query(
          "select * from public.update_listing_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
          [
            listings.draftCar,
            refs.free_category_id,
            refs.settlement_id,
            "Обновлённый черновик",
            "Полное описание после атомарного обновления",
            250000,
            "KZT",
            "Owner Updated",
            "+77005550101",
            false,
            freeAttributes,
          ],
        );
        assert.deepEqual(updated.rows, [{
          listing_id: listings.draftCar,
          listing_slug: original.rows[0].slug,
          listing_status: "draft",
        }]);
      });

      const aggregate = await db.query(`
        select
          listing.slug,
          listing.status,
          listing.category_id,
          listing.title,
          listing.price_minor,
          contact.contact_name,
          contact.contact_phone_e164,
          contact.allow_messages,
          (select count(*)::int from public.listing_attribute_values where listing_id = listing.id) as scalar_count,
          (select count(*)::int from public.listing_attribute_option_values where listing_id = listing.id) as option_count
        from public.listings as listing
        join public.listing_contacts as contact on contact.listing_id = listing.id
        where listing.id = $1
      `, [listings.draftCar]);
      assert.deepEqual(aggregate.rows[0], {
        slug: original.rows[0].slug,
        status: "draft",
        category_id: refs.free_category_id,
        title: "Обновлённый черновик",
        price_minor: 250000,
        contact_name: "Owner Updated",
        contact_phone_e164: "+77005550101",
        allow_messages: false,
        scalar_count: 0,
        option_count: 1,
      });

      await asAuthenticated(db, users.owner, async () => {
        const invalidAttributes = JSON.stringify([
          {
            attribute_id: refs.free_condition_attribute_id,
            data_type: "select",
            option_ids: [refs.car_brand_option_id],
          },
        ]);
        await assert.rejects(
          db.query(
            "select * from public.update_listing_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
            [
              listings.draftCar,
              refs.free_category_id,
              refs.settlement_id,
              "Не должно сохраниться",
              "Эта попытка обязана полностью откатиться",
              10,
              "KZT",
              "Owner",
              "+77005550101",
              true,
              invalidAttributes,
            ],
          ),
          /inactive or unavailable|foreign key|violates/i,
        );
      });
      const afterRollback = await db.query(`
        select listing.title, option_value.option_id
        from public.listings as listing
        join public.listing_attribute_option_values as option_value on option_value.listing_id = listing.id
        where listing.id = $1
      `, [listings.draftCar]);
      assert.deepEqual(afterRollback.rows, [{
        title: "Обновлённый черновик",
        option_id: refs.free_condition_option_id,
      }]);

      await asAuthenticated(db, users.buyer, async () => {
        await assert.rejects(
          db.query(
            "select * from public.update_listing_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
            [
              listings.draftCar,
              refs.free_category_id,
              refs.settlement_id,
              "Попытка захвата",
              "Покупатель не может изменить чужой черновик",
              100,
              "KZT",
              "Buyer",
              "+77005550102",
              true,
              freeAttributes,
            ],
          ),
          /listing is not editable|permission denied/i,
        );
      });

      for (const target of [listings.pendingApprove, listings.activeOwner]) {
        await asAuthenticated(db, users.owner, async () => {
          await assert.rejects(
            db.query(
              "select * from public.update_listing_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
              [
                target,
                refs.free_category_id,
                refs.settlement_id,
                "Недопустимый статус",
                "Pending и active нельзя менять как черновик",
                100,
                "KZT",
                "Owner",
                "+77005550101",
                true,
                freeAttributes,
              ],
            ),
            /listing is not editable|permission denied/i,
          );
        });
      }

      await asAuthenticated(db, users.owner, async () => {
        const updated = await db.query(
          "select * from public.update_listing_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
          [
            listings.rejectedOwner,
            refs.free_category_id,
            refs.settlement_id,
            "Исправленное объявление",
            "Владелец исправил отклонённое объявление",
            5000,
            "KZT",
            "Owner",
            "+77005550101",
            true,
            freeAttributes,
          ],
        );
        assert.equal(updated.rows[0].listing_status, "rejected");
      });
      await db.query(
        "insert into public.listing_images (listing_id, storage_key) values ($1, 'security/rejected-resubmit.webp')",
        [listings.rejectedOwner],
      );
      await asAuthenticated(db, users.owner, async () => {
        await db.query("select public.submit_listing($1)", [listings.rejectedOwner]);
      });
      const resubmitted = await db.query("select status from public.listings where id = $1", [listings.rejectedOwner]);
      assert.deepEqual(resubmitted.rows, [{ status: "pending" }]);
    });

    await t.test("owner archive and sold RPCs enforce the complete state matrix", async () => {
      const created = {};
      for (const status of ["draft", "pending", "active", "rejected"]) {
        const publishedAt = status === "active" ? new Date().toISOString() : null;
        const row = await db.query(`
          insert into public.listings (
            owner_id, category_id, settlement_id, slug, title, description,
            price_minor, currency_code, status, published_at
          ) values ($1,$2,$3,$4,$5,$6,1000,'KZT',$7,$8)
          returning id
        `, [
          users.owner,
          refs.free_category_id,
          refs.settlement_id,
          `security-archive-${status}`,
          `Archive ${status}`,
          `Lifecycle archive fixture for ${status}`,
          status,
          publishedAt,
        ]);
        created[status] = row.rows[0].id;
      }
      const soldCandidate = await db.query(`
        insert into public.listings (
          owner_id, category_id, settlement_id, slug, title, description,
          price_minor, currency_code, status, published_at
        ) values ($1,$2,$3,'security-sold-active','Sold active','Lifecycle sold fixture',1000,'KZT','active',now())
        returning id
      `, [users.owner, refs.free_category_id, refs.settlement_id]);
      created.sold = soldCandidate.rows[0].id;

      await asAuthenticated(db, users.buyer, async () => {
        await assert.rejects(db.query("select public.archive_own_listing($1)", [created.pending]), /cannot be archived|permission denied/i);
        await assert.rejects(db.query("select public.mark_own_listing_sold($1)", [created.sold]), /cannot be marked sold|permission denied/i);
      });
      await asAuthenticated(db, users.owner, async () => {
        for (const status of ["draft", "pending", "active", "rejected"]) {
          await db.query("select public.archive_own_listing($1)", [created[status]]);
        }
        await db.query("select public.mark_own_listing_sold($1)", [created.sold]);
        await assert.rejects(db.query("select public.archive_own_listing($1)", [created.draft]), /cannot be archived/i);
        await assert.rejects(db.query("select public.mark_own_listing_sold($1)", [created.sold]), /cannot be marked sold/i);
      });
      const states = await db.query(
        "select id, status from public.listings where id = any($1::uuid[]) order by id",
        [Object.values(created)],
      );
      const byId = new Map(states.rows.map((row) => [row.id, row.status]));
      for (const status of ["draft", "pending", "active", "rejected"]) assert.equal(byId.get(created[status]), "archived");
      assert.equal(byId.get(created.sold), "sold");
    });

    await t.test("owner listing query is scoped, bounded, stable and excludes deleted rows", async () => {
      await asAuthenticated(db, users.owner, async () => {
        const own = await db.query(`
          select id, status, updated_at
          from public.listings
          where owner_id = (select auth.uid())
            and status <> 'deleted'
            and deleted_at is null
          order by updated_at desc, id desc
          limit 50 offset 0
        `);
        assert.ok(own.rows.some((row) => row.id === listings.draftFree && row.status === "draft"));
        assert.ok(own.rows.some((row) => row.id === listings.activeOwner && row.status === "active"));
        assert.ok(own.rows.some((row) => row.id === listings.pendingReject && row.status === "rejected"));
        assert.ok(own.rows.some((row) => row.id === listings.rejectedOwner && row.status === "pending"));
        assert.equal(own.rows.some((row) => row.id === listings.deletedOwner), false);
        for (let index = 1; index < own.rows.length; index += 1) {
          const previous = own.rows[index - 1];
          const current = own.rows[index];
          const timeOrder = new Date(previous.updated_at).getTime() - new Date(current.updated_at).getTime();
          assert.ok(timeOrder > 0 || (timeOrder === 0 && previous.id.localeCompare(current.id) >= 0));
        }
      });
      await asAuthenticated(db, users.buyer, async () => {
        const own = await db.query(`
          select id, status
          from public.listings
          where owner_id = (select auth.uid())
            and status <> 'deleted'
            and deleted_at is null
          order by updated_at desc, id desc
          limit 50
        `);
        assert.deepEqual(own.rows, [{ id: listings.activeBuyer, status: "active" }]);
        const ownerPrivate = await db.query(`
          select id
          from public.listings
          where owner_id = $1
            and status <> 'active'
            and status <> 'deleted'
            and deleted_at is null
        `, [users.owner]);
        assert.deepEqual(ownerPrivate.rows, []);
      });
    });

    await t.test("owner rejection feedback exposes only the latest safe fields", async () => {
      await asAuthenticated(db, users.owner, async () => {
        const feedback = await db.query(
          "select * from public.get_my_listing_moderation_feedback($1)",
          [listings.pendingReject],
        );
        assert.deepEqual(Object.keys(feedback.rows[0]).sort(), ["listing_id", "reason_code", "rejected_at"]);
        assert.equal(feedback.rows[0].listing_id, listings.pendingReject);
        assert.equal(feedback.rows[0].reason_code, "wrong_category");
        assert.ok(feedback.rows[0].rejected_at instanceof Date || typeof feedback.rows[0].rejected_at === "string");
      });
      for (const userId of [users.buyer, users.moderator]) {
        await asAuthenticated(db, userId, async () => {
          const feedback = await db.query(
            "select * from public.get_my_listing_moderation_feedback($1)",
            [listings.pendingReject],
          );
          assert.deepEqual(feedback.rows, []);
        });
      }
      await asAnon(db, async () => {
        await assert.rejects(
          db.query("select * from public.get_my_listing_moderation_feedback($1)", [listings.pendingReject]),
          /permission denied/i,
        );
      });
    });

    await t.test("User A listing roundtrip is discoverable by User B after moderation", async () => {
      const attributes = JSON.stringify(await buildRequiredAttributePayload(db, refs.car_category_id, {
        brand: { option_ids: [refs.car_brand_option_id], selectedValue: "toyota" },
        model: { option_ids: [refs.car_model_option_id], selectedValue: "toyota:rav4" },
        condition: { option_ids: [refs.car_condition_option_id], selectedValue: "used" },
        year: { value: 2025 },
      }));
      let listingId;
      let listingSlug;
      await asAuthenticated(db, users.owner, async () => {
        const created = await db.query(
          "select * from public.create_listing_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",
          [refs.car_category_id, refs.settlement_id, "Toyota RAV4 roundtrip", "Полное объявление пользователя A для проверки поиска", 18500000, "KZT", "Owner", "+77005550101", true, attributes],
        );
        listingId = created.rows[0].listing_id;
        listingSlug = created.rows[0].listing_slug;
      });
      await db.query(
        "insert into public.listing_images (listing_id, storage_key, sort_order, width, height, byte_size, mime_type) values ($1,$2,0,1200,900,320000,'image/webp')",
        [listingId, `listings/${users.owner}/${listingId}/00-roundtrip.webp`],
      );
      await asAuthenticated(db, users.owner, async () => {
        await db.query("select public.submit_listing($1)", [listingId]);
      });
      await asAuthenticated(db, users.moderator, async () => {
        await db.query("select public.moderate_listing($1, 'approve')", [listingId]);
      });
      await asAuthenticated(db, users.buyer, async () => {
        const found = await db.query(
          "select id, slug, title, price_minor, settlement_id, primary_image_storage_key from public.search_catalog_listing_cards(array[$1]::uuid[],$2,$3,$4,$5,$6::jsonb)",
          [refs.car_category_id, refs.settlement_id, "RAV4", 18000000, 19000000, JSON.stringify({ brand: "toyota", year_min: "2024", year_max: "2026" })],
        );
        assert.deepEqual(found.rows, [{
          id: listingId,
          slug: listingSlug,
          title: "Toyota RAV4 roundtrip",
          price_minor: 18500000,
          settlement_id: refs.settlement_id,
          primary_image_storage_key: `listings/${users.owner}/${listingId}/00-roundtrip.webp`,
        }]);
        const seller = await db.query("select id, display_name from public.seller_profiles where id = $1", [users.owner]);
        assert.deepEqual(seller.rows, [{ id: users.owner, display_name: "Updated Owner" }]);
        const takeover = await db.query(
          "update public.listings set title = 'Buyer takeover' where id = $1 returning id",
          [listingId],
        );
        // PostgreSQL RLS can safely hide a disallowed UPDATE target instead of
        // raising an exception. Verify the security outcome, not one error mode.
        assert.equal(takeover.rowCount, 0);
        const unchanged = await db.query("select title from public.listings where id = $1", [listingId]);
        assert.deepEqual(unchanged.rows, [{ title: "Toyota RAV4 roundtrip" }]);
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

    await t.test("City Premium exposes only active placements and keeps capacity server-owned", async () => {
      const activeStartsAt = new Date(Date.now() - 60_000).toISOString();
      const activeEndsAt = new Date(Date.now() + 86_400_000).toISOString();
      const futureStartsAt = new Date(Date.now() + 172_800_000).toISOString();
      const futureEndsAt = new Date(Date.now() + 259_200_000).toISOString();
      await db.query(
        "insert into public.city_premium_placements (settlement_id, listing_id, starts_at, ends_at) values ($1,$2,$3,$4),($1,$5,$6,$7)",
        [refs.settlement_id, listings.activeOwner, activeStartsAt, activeEndsAt, listings.activeBuyer, futureStartsAt, futureEndsAt],
      );
      await asAnon(db, async () => {
        const settings = await db.query("select capacity from public.city_premium_settings where settlement_id = $1", [refs.settlement_id]);
        assert.deepEqual(settings.rows, [{ capacity: 15 }]);
        const rows = await db.query("select listing_id from public.get_city_premium_placements($1, 15)", [refs.settlement_id]);
        assert.deepEqual(rows.rows, [{ listing_id: listings.activeOwner }]);
        const visiblePlacements = await db.query("select listing_id from public.city_premium_placements where settlement_id = $1", [refs.settlement_id]);
        assert.deepEqual(visiblePlacements.rows, [{ listing_id: listings.activeOwner }]);
      });
      await asAuthenticated(db, users.buyer, async () => {
        await assert.rejects(
          db.query(
            "insert into public.city_premium_placements (settlement_id, listing_id, starts_at, ends_at) values ($1,$2,$3,$4)",
            [refs.settlement_id, listings.pendingApprove, activeStartsAt, activeEndsAt],
          ),
          /permission denied/i,
        );
        await assert.rejects(
          db.query("update public.city_premium_settings set capacity = 50 where settlement_id = $1", [refs.settlement_id]),
          /permission denied/i,
        );
      });
    });

    await t.test("0025 refuses unknown policies before changing RPC grants", async () => {
      const migration = await readFile(
        new URL("supabase/migrations/0025_security_boundary_repair.sql", root),
        "utf8",
      );
      await db.exec(`
        grant execute on function public.moderate_listing(uuid, text, text, text) to anon;
        create policy marketo_0025_unreviewed_profile_read
        on public.profiles for select to anon
        using (id = (select auth.uid()));
      `);

      await assert.rejects(
        db.exec(migration),
        /0025 refuses unreviewed RLS policy/i,
      );
      await db.exec("rollback;");
      const unchangedGrant = await db.query(`
        select has_function_privilege(
          'anon',
          'public.moderate_listing(uuid,text,text,text)',
          'EXECUTE'
        ) as anon_execute
      `);
      assert.equal(unchangedGrant.rows[0].anon_execute, true);

      await db.exec(`
        drop policy marketo_0025_unreviewed_profile_read on public.profiles;
        revoke execute on function public.moderate_listing(uuid, text, text, text) from anon;
      `);
      await db.exec(migration);
      const repairedGrant = await db.query(`
        select has_function_privilege(
          'anon',
          'public.moderate_listing(uuid,text,text,text)',
          'EXECUTE'
        ) as anon_execute
      `);
      assert.equal(repairedGrant.rows[0].anon_execute, false);
    });

    await t.test("0025 refuses a same-signature callable function with a drifted body", async () => {
      const migration = await readFile(
        new URL("supabase/migrations/0025_security_boundary_repair.sql", root),
        "utf8",
      );
      const baseline = await readFile(
        new URL("supabase/migrations/0010_rls_and_grants.sql", root),
        "utf8",
      );
      const canonicalFunction = baseline.match(
        /create or replace function private\.current_profile_is_active\(\)[\s\S]*?\$\$;/i,
      )?.[0];
      assert.ok(canonicalFunction);

      await db.exec(`
        create or replace function private.current_profile_is_active()
        returns boolean
        language sql
        stable
        security definer
        set search_path = ''
        as $$ select true; $$;
      `);

      await assert.rejects(
        db.exec(migration),
        /0025 refuses drifted reviewed callable function contract.*current_profile_is_active/is,
      );
      await db.exec("rollback;");
      assert.equal((await db.query("select private.current_profile_is_active() as active")).rows[0].active, true);

      await db.exec(canonicalFunction);
      await db.exec(migration);
      const restoredDefinition = await db.query(`
        select pg_get_functiondef(
          'private.current_profile_is_active()'::regprocedure
        ) as definition
      `);
      assert.match(restoredDefinition.rows[0].definition, /public\.profiles/i);
      assert.match(restoredDefinition.rows[0].definition, /status\s*=\s*'active'/i);
      assert.doesNotMatch(restoredDefinition.rows[0].definition, /select\s+true\s*;/i);
    });

    await t.test("0025 refuses a same-signature callable function with a drifted default", async () => {
      const migration = await readFile(
        new URL("supabase/migrations/0025_security_boundary_repair.sql", root),
        "utf8",
      );
      const baseline = await readFile(
        new URL("supabase/migrations/0019_city_premium_showcase.sql", root),
        "utf8",
      );
      const canonicalFunction = baseline.match(
        /create or replace function public\.get_city_premium_placements\([\s\S]*?\$\$;/i,
      )?.[0];
      assert.ok(canonicalFunction);
      const driftedFunction = canonicalFunction.replace(
        "p_limit integer default 15",
        "p_limit integer default 50",
      );
      assert.notEqual(driftedFunction, canonicalFunction);
      await db.exec(driftedFunction);

      await assert.rejects(
        db.exec(migration),
        /0025 refuses drifted reviewed callable function contract.*get_city_premium_placements/is,
      );
      await db.exec("rollback;");
      const driftedDefault = await db.query(`
        select pg_get_expr(procedure.proargdefaults, 0, false) as expression
        from pg_proc as procedure
        where procedure.oid = to_regprocedure('public.get_city_premium_placements(uuid,integer)')
      `);
      assert.equal(driftedDefault.rows[0].expression, "50");

      await db.exec(canonicalFunction);
      await db.exec(migration);
      const repairedDefault = await db.query(`
        select pg_get_expr(procedure.proargdefaults, 0, false) as expression
        from pg_proc as procedure
        where procedure.oid = to_regprocedure('public.get_city_premium_placements(uuid,integer)')
      `);
      assert.equal(repairedDefault.rows[0].expression, "15");
    });

    await t.test("0025 rolls back every repair when a late postflight contract fails", async () => {
      const migration = await readFile(
        new URL("supabase/migrations/0025_security_boundary_repair.sql", root),
        "utf8",
      );
      const brokenMigration = migration.replace(
        /('private\.has_any_role\(text\[\]\)', 'boolean', ')[0-9a-f]{32}(', true)/,
        `$1${"0".repeat(32)}$2`,
      );
      assert.notEqual(brokenMigration, migration);
      await db.exec(`
        grant execute on function public.moderate_listing(uuid, text, text, text) to anon;
        alter table public.listing_images disable row level security;
      `);

      await assert.rejects(
        db.exec(brokenMigration),
        /0025 postflight callable function contract mismatch.*has_any_role/is,
      );
      await db.exec("rollback;");
      const rolledBack = await db.query(`
        select
          has_function_privilege(
            'anon', 'public.moderate_listing(uuid,text,text,text)', 'EXECUTE'
          ) as anon_execute,
          not relation.relrowsecurity as rls_disabled
        from pg_class as relation
        join pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public' and relation.relname = 'listing_images'
      `);
      assert.deepEqual(rolledBack.rows[0], { anon_execute: true, rls_disabled: true });

      await db.exec(migration);
      const repaired = await db.query(`
        select
          has_function_privilege(
            'anon', 'public.moderate_listing(uuid,text,text,text)', 'EXECUTE'
          ) as anon_execute,
          relation.relrowsecurity as rls_enabled
        from pg_class as relation
        join pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public' and relation.relname = 'listing_images'
      `);
      assert.deepEqual(repaired.rows[0], { anon_execute: false, rls_enabled: true });
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
      assert.equal(functions.rows.length, 17);
      assert.ok(functions.rows.every((row) => row.proconfig?.includes('search_path=""')));
      assert.ok(functions.rows.every((row) => row.anon_execute === false));
      const notClientCallable = functions.rows.filter((row) => !row.authenticated_execute).map((row) => row.proname);
      assert.deepEqual(notClientCallable, ["handle_new_auth_user", "touch_conversation_after_message"]);
    });
  } finally {
    await closePGliteTestDatabase(db);
  }
});
