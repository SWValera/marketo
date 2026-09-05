# Marketo Supabase migration manifest

Status: local source contains 25 ordered migrations. 0001–0022 are the
immutable baseline; 0023–0025 are forward-only owner-lifecycle, catalog
completeness and security-boundary repair migrations. This workspace did not
apply SQL to production.

| Order | File | Depends on | Purpose |
|---:|---|---|---|
| 1 | migrations/0001_extensions_and_helpers.sql | Supabase Auth roles/schema | helper schemas, extensions and timestamps |
| 2 | migrations/0002_geography.sql | 0001 | locales and Kazakhstan geography |
| 3 | migrations/0003_profiles_and_roles.sql | 0001–0002, auth.users | public/private profiles, roles and safe Auth trigger |
| 4 | migrations/0004_categories_and_attributes.sql | 0001 | taxonomy, seller attributes and options |
| 5 | migrations/0005_listings.sql | 0002–0004 | listings, contacts, typed values and R2 metadata |
| 6 | migrations/0006_favorites.sql | 0003, 0005 | owner-scoped favorites |
| 7 | migrations/0007_chat.sql | 0003, 0005 | conversations, participants and messages |
| 8 | migrations/0008_notifications.sql | 0003 | localized-at-render notifications |
| 9 | migrations/0009_reports_moderation_and_audit.sql | 0003, 0005 | reports, moderation state machine and audit |
| 10 | migrations/0010_rls_and_grants.sql | 0001–0009 | RLS, grants and RPC execution boundaries |
| 11 | migrations/0011_indexes_and_search.sql | 0001–0010 | indexes and security-invoker catalog/seller views |
| 12 | migrations/0012_realtime.sql | 0007–0008 | Realtime for messages and notifications only |
| 13 | migrations/0013_passenger_vehicle_reference.sql | 0004 + reference rows | passenger-car fields and vehicle brands |
| 14 | migrations/0014_category_attribute_metadata.sql | 0004, 0013 | filter modes, deferred options and dependencies |
| 15 | migrations/0015_category_attribute_normalization.sql | 0014 + reference rows | normalized attribute/option upserts |
| 16 | migrations/0016_listing_attribute_roundtrip.sql | 0005, 0014–0015 | dependency enforcement and atomic listing draft RPC |
| 17 | migrations/0017_master_catalog.sql | 0004–0016 | 1,356-node catalog, scoped dictionaries and buyer-filter RPC |
| 18 | migrations/0018_auth_profile_flow.sql | 0003, 0010 | authenticated account-profile read/update RPCs |
| 19 | migrations/0019_city_premium_showcase.sql | 0002, 0005, 0010 | city capacity 15, active placements, RLS and deterministic read RPC |
| 20 | migrations/0020_targeted_catalog_and_premium_foundation.sql | 0002, 0005, 0017, 0019 | targeted RU/KK catalog metadata and payment-neutral Premium foundation |
| 21 | migrations/0021_auth_role_rpc_hardening.sql | 0003, 0005, 0007, 0009–0010, 0016–0019 | explicit anonymous/account/staff RPC execution allowlist |
| 22 | migrations/0022_active_staff_moderation_hardening.sql | 0003, 0005, 0009–0010, 0021 | active-profile staff roles, moderation-only pending RLS and bounded decision input |
| 23 | migrations/0023_owner_listing_draft_lifecycle.sql | 0003–0005, 0010, 0016, 0022 | atomic owner draft/rejected replacement and safe rejection feedback |
| 24 | migrations/0024_catalog_completeness.sql | 0004–0005, 0014–0017, 0023 | forward-only category field synchronization, integrity pre/postflight and active-leaf listing guard |
| 25 | migrations/0025_security_boundary_repair.sql | 0021–0024 | fail-closed function/schema ACL repair, canonical 19-policy RLS rebuild and restoration of active-staff/owner RPC contracts |
| Seed | seeds/001_marketo_reference.sql | 0001–0025 | RU/KK geography/catalog bootstrap; no user/product records |

## Integrity boundary

CHECKSUMS.sha256 records every migration and seed. validate:db also pins the
reviewed SHA-256 values of immutable migrations 0001–0022, requires RLS on all
29 public tables and rejects credential-like source values.

## Execution rules

1. Never edit 0001–0022; use a new numbered forward migration.
2. Review and apply files in order—never as an opaque concatenated script.
3. Rehearse first on a disposable branch and run Linter/Security Advisor.
4. Verify backups/PITR and actual production migration history independently.
5. Production application requires separate explicit authorization.
