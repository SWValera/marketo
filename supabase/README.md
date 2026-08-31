# Marketo Supabase foundation

This directory is a forward-only, locally verified database contract. Nothing
in the build or test chain connects to or mutates production Supabase.

## Review boundary

- 0001–0022 are immutable and must never be edited.
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
- seeds/001_marketo_reference.sql contains only RU/KK reference data.
- Remote application status is not inferred from local files. No migration was
  applied remotely during recovery.

The exact ordered list, dependencies and purpose are in
MIGRATION_MANIFEST.md. CHECKSUMS.sha256 covers all 23 migrations and the
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
- Master Catalog: 1,356 categories, 1,137 leaves, 16 roots;
- 9,373 category-attribute assignments;
- 87,150 localized option assignments;
- no users, listings, favorites, chats, messages, notifications or credentials.

Regenerate reference SQL only when the reviewed typed source changes:

    npm run seed:reference
    npm run db:checksums

The geography seed is not the complete KATO hierarchy. A future official KATO
import must be normalized and independently reviewed before a new forward-only
migration/seed release.

## Safe rollout rule

First rehearse 0017–0023 in order on a disposable Supabase branch cloned from
the actual target schema. Compare it with a clean migrations-plus-seed
database, run Database Linter/Security Advisor and exercise real Auth/R2 with
non-production credentials. Production requires a separate explicit approval.
