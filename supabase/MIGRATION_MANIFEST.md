# Marketo Supabase migration manifest

Status: **review-only foundation**. None of these files has been applied to the
production Supabase project by this work.

| Order | File | Depends on | Purpose |
|---:|---|---|---|
| 1 | `migrations/0001_extensions_and_helpers.sql` | Supabase Auth roles/schema | helper schemas, `pgcrypto`, `pg_trgm`, shared timestamp trigger |
| 2 | `migrations/0002_geography.sql` | 0001 | locales, countries, regions, hierarchical settlements |
| 3 | `migrations/0003_profiles_and_roles.sql` | 0001–0002, `auth.users` | public/private profiles, roles, safe Auth trigger and profile RPCs |
| 4 | `migrations/0004_categories_and_attributes.sql` | 0001 | category tree, dynamic attributes and localized options |
| 5 | `migrations/0005_listings.sql` | 0002–0004 | listings, contacts, typed values, R2 metadata and owner transitions |
| 6 | `migrations/0006_favorites.sql` | 0003, 0005 | unique user/listing favorites |
| 7 | `migrations/0007_chat.sql` | 0003, 0005 | unique listing conversations, participants, messages and read state |
| 8 | `migrations/0008_notifications.sql` | 0003 | localized-at-render notification events |
| 9 | `migrations/0009_reports_moderation_and_audit.sql` | 0003, 0005 | reports, strict moderation state machine, roles and immutable audit trail |
| 10 | `migrations/0010_rls_and_grants.sql` | 0001–0009 | RLS for all 23 tables, column grants and function execution grants |
| 11 | `migrations/0011_indexes_and_search.sql` | 0001–0010 | query indexes, seller/catalog security-invoker views |
| 12 | `migrations/0012_realtime.sql` | 0007–0008 | Realtime publication limited to messages and notifications |
| Seed | `seeds/001_marketo_reference.sql` | 0001–0011 | RU/KK reference bootstrap only; no users or product records |

## Integrity boundary

`CHECKSUMS.sha256` records SHA-256 for the 12 migrations and the generated
reference seed. Regenerate it with `npm run db:checksums` only after an intended
reviewed SQL change. A reviewer should reject an archive when a SQL checksum
does not match.

## Execution rules

1. Review every file and checksum before using any remote database.
2. First execute the sequence on a disposable Supabase branch/development
   project and run Database Linter/Security Advisor.
3. Never concatenate the sequence into an opaque one-off script.
4. Never edit an already-applied migration; add a forward migration instead.
5. The reference seed is separate from schema migrations and is not a complete
   official KATO settlement import.

## One next step after independent review

In an empty Supabase project's SQL Editor, run **only**
`migrations/0001_extensions_and_helpers.sql`, verify the transaction result,
and stop. Do not run 0002–0012 or the seed until the first result has been
reviewed.

