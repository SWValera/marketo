# JEVU Supabase foundation

This directory is a forward-only, locally verified database contract. Nothing
in the build or test chain connects to or mutates production Supabase.

## Review boundary

- 0001–0026 are released, checksum-pinned and immutable. Never regenerate or
  overwrite an applied migration to change catalog reference data.
- 0017 expands the Master Catalog and adds database-backed buyer filtering.
- 0018 adds authenticated self-profile read/update RPCs.
- 0019 adds per-city Premium Showcase settings, placements, capacity guard,
  active-only RLS and a deterministic public read RPC.
- 0020 adds targeted catalog metadata and payment-neutral Premium foundations.
- 0021 revokes implicit RPC execution and restores an explicit public/account/
  staff allowlist; anonymous access is limited to reviewed read RPCs.
- 0022 requires an active profile for every staff capability, removes support
  from pending-listing RLS, and bounds moderation reasons and notes.
- 0023 adds an owner-only atomic draft/rejected update and a deliberately
  narrow rejection-feedback RPC without moderator identity or internal notes.
- 0024 synchronizes the expanded category-specific seller fields and buyer
  filters without replacing stable row UUIDs, and rejects non-leaf listing
  categories at the database boundary.
- 0025 is the forward repair for the detected production RPC/RLS drift. When
  applied, it removes global and schema-specific default API-role function
  execution, restores the complete reviewed 19-policy boundary, reenables RLS
  on the affected tables and restores the active-staff/owner RPC contracts.
- 0026 updates the construction-goods root presentation while preserving the
  released category tree, identifiers and listing relationships.
- 0027 keeps the hardened submission RPC and enforces generic catalog
  `requiredWhen` rules in PostgreSQL, including rejection of blank text values.
- seeds/001_marketo_reference.sql contains only RU/KK reference data.
- Remote application status is not inferred from local files. No migration was
  applied remotely during recovery.

The exact ordered list, dependencies and purpose are in
MIGRATION_MANIFEST.md. CHECKSUMS.sha256 covers all 27 migrations and the
reference seed.

## Clean local verification

    npm run validate:db
    npm run validate:catalog
    node --test tests/supabase-migrations.test.mjs
    node --test tests/supabase-security.test.mjs
    npm run typecheck

The migration test creates an isolated PostgreSQL-compatible PGlite database,
stubs only Supabase-managed Auth roles/table, applies all migrations and the
seed, and exercises profile creation, listing roundtrip, filters, RLS and the
15-placement premium capacity. This does not replace a disposable Supabase
branch, Database Linter or Security Advisor.

## Deterministic reference state

- locales: RU/KK;
- Kazakhstan administrative bootstrap: 20 top-level units and 90 selectable
  settlements;
- Master Catalog: 1,358 categories, 1,139 leaves, 16 roots;
- 14,345 category-attribute assignments;
- 116,412 localized option assignments;
- no users, listings, favorites, chats, messages, notifications or credentials.

Regenerate the clean-database reference seed only when the reviewed typed
source changes:

    npm run seed:reference
    npm run db:checksums

## Versioned catalog data releases

Changes to the category tree, category attributes and option dictionaries
after migration 0024 are data releases, not schema migrations. Generate each
reviewed snapshot with an explicit immutable release id:

    npm run catalog:release -- --release-id <CATEGORY_REFERENCE_VERSION>

Use the exact value from `lib/reference-data/release.ts`; the generator rejects
any mismatch so the SQL snapshot and immutable browser/PWA cache key cannot drift.

The default output is
`artifacts/catalog/releases/<CATEGORY_REFERENCE_VERSION>.sql`. The generator refuses
every destination inside `supabase/migrations`; running it never modifies the
released 0024 file. Generate the same release twice during review to verify
byte reproducibility. Existing release files are never overwritten: any changed
snapshot receives a new release id. Record its checksum, rehearse it on a
disposable clone, then apply that exact reviewed artifact under the normal
backup/preflight/postflight authorization boundary. See
`docs/CATALOG_DATA_POLICY.md`.

Schema migrations always precede catalog data releases. In particular, apply
`0027_conditional_required_attributes.sql` before any release containing
`requiredWhen`; the generated artifact verifies the reviewed RPC fingerprint
and aborts if that contract is missing. Deploy the matching app only after the
database postflight succeeds.

The geography seed is not the complete KATO hierarchy. A future official KATO
import must be normalized and independently reviewed before a new forward-only
migration/seed release.

## Safe rollout rule

First determine the target's last verified migration from schema evidence.
On a disposable Supabase branch cloned from that exact target, apply only the
consecutive missing forward migrations in order (for example, a target verified
through 0023 receives 0024, 0025, 0026 and then 0027). Never replay migrations already
represented by the target schema. Compare the result with a clean
migrations-plus-seed database, run Database Linter/Security Advisor and exercise
real Auth/R2 with non-production credentials. Production requires a separate
explicit approval.
