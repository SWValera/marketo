# Marketo Supabase foundation

This directory is a reviewed, forward-only database foundation. Nothing here
connects to or mutates the remote Supabase project automatically.

## Status — read before SQL review

- **DATABASE STATUS:** Foundation prepared; production Supabase migrations have not been applied.
- **GEOGRAPHY STATUS:** Region + major-city bootstrap seed; full official Kazakhstan KATO import is pending.
- **CATEGORY STATUS:** Initial Marketo reference taxonomy; final business taxonomy remains reviewable.
- **PRODUCTION SQL STATUS:** Do not run migrations until an independent review is complete.

## Reviewed order

1. `migrations/0001_extensions_and_helpers.sql`
2. `migrations/0002_geography.sql`
3. `migrations/0003_profiles_and_roles.sql`
4. `migrations/0004_categories_and_attributes.sql`
5. `migrations/0005_listings.sql`
6. `migrations/0006_favorites.sql`
7. `migrations/0007_chat.sql`
8. `migrations/0008_notifications.sql`
9. `migrations/0009_reports_moderation_and_audit.sql`
10. `migrations/0010_rls_and_grants.sql`
11. `migrations/0011_indexes_and_search.sql`
12. `migrations/0012_realtime.sql`
13. `seeds/001_marketo_reference.sql`

Apply them in that exact order to a clean local Supabase database or a database
branch first. Do not concatenate them into an opaque one-off script. Every file
is transactional and reviewable.

## Local verification

```bash
npm run seed:reference
npm run validate:db
node --test tests/supabase-migrations.test.mjs
node --test tests/supabase-security.test.mjs
npm run typecheck
```

The migration test creates an in-memory PostgreSQL-compatible PGlite database,
loads `pgcrypto` and `pg_trgm`, stubs only the Supabase-managed Auth roles/table,
applies all migrations and the reference seed, and exercises profile creation,
RLS grants and the draft-to-pending RPC. This is a deterministic preflight, not
a replacement for a Supabase branch, Database Linter or Security Advisor.

## Reference data

`001_marketo_reference.sql` is generated from the current typed frontend
contracts and contains only:

- `ru` and `kk` locales;
- Kazakhstan and all 20 top-level administrative units used by Marketo;
- a reviewed 90-city baseline;
- 228 categories with RU/KK presentation data;
- effective category attributes and their localized options.

The 228-node category seed is the **initial Marketo reference taxonomy**, not a
claim that the final production business taxonomy has been approved.

It intentionally contains no users, listings, reviews, favorites, chats,
messages, notifications or admin records.

Regenerate it with:

```bash
npm run seed:reference
```

The baseline is not presented as the complete KATO settlement hierarchy. The
authoritative source is the Kazakhstan Bureau of National Statistics,
[KATO NK RK 11-2025](https://stat.gov.kz/ru/classifiers/statistical/21/),
actualized 2026-07-17. Normalize and manually review the official export using
the contract in `seeds/kato-normalized.example.json`, then generate a separate
seed:

```bash
node scripts/generate-kato-seed.mjs reviewed-kato.json
```

Do not apply that output until node counts, parent links, region mapping, stable
slugs, and RU/KK names have been checked independently.

`MIGRATION_MANIFEST.md` documents the ordered review boundary. Run
`npm run db:checksums` after any reviewed SQL/seed change; `CHECKSUMS.sha256`
must match before an archive is accepted.

## Recovery strategy

- Use a Supabase database branch or disposable development project for the
  first application.
- Capture a schema dump and backup before applying to any non-empty project.
- A failure inside one migration rolls that migration back; do not manually
  delete partially understood objects afterward.
- This project uses forward-only fixes. Add a new migration after deployment;
  do not edit an already-applied migration.
- For an unrecoverable branch test, discard the branch. For production, restore
  the pre-migration backup/PITR under an explicit recovery plan.

## First manual step after review

In the empty Supabase project's SQL Editor, run **only**
`migrations/0001_extensions_and_helpers.sql`, verify that it commits without a
warning, and stop. Do not run the remaining files until that result and the
Security Advisor baseline have been reviewed.
