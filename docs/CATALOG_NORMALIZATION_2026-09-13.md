# JEVU catalog normalization — 2026-09-13.1

## Scope and evidence

Existing catalog and database only; branch `stage3-staging`. No changes to
account authentication, photos, R2, Worker performance fix or PWA.

- 1,358 categories, 1,139 leaves, 13,858 leaf attribute assignments audited.
- Release target: 15,784 attributes across all category levels and 172,849 options.
- Compared with the public backup: 1,618 new attribute mappings; 3,055 existing
  mappings change type, labels, dependency, loading mode or validation. JSON key
  order is ignored in this comparison. 745 production fields change scalar type.
- 1,171 new option sets; 13 existing sets expand and 16 change their active key
  set (the latter includes the expansions). Counts include non-leaf levels.
- Brand fields: 633 leaves. Model dictionaries: 44 leaves. Explicit factory
  model/article inputs: 284 leaves, selected by a reviewed domain policy.
- Vehicle generation dictionary: 62 verified records for 9 model families.
  Other models retain an explicit Other/manual path. This is not a claim of
  complete worldwide model/generation coverage.
- 6,123 option sets at leaf level; all selects have choices and RU/KK labels.
- All 61 deferred-parent chains are covered by stable-key reload/reset tests.
- Real read-only REST checks passed for Toyota/Camry, Apple/iPhone and Apple/iPad.
  They identified and fixed an ambiguous PostgREST relationship by specifying
  `category_attribute_options_attribute_id_fkey`.

## Data and runtime changes

Domain profiles separate computing components, consoles, wearables, pets and
agricultural equipment. CPU/GPU dictionaries separate laptop and desktop parts;
tablet SoCs and motherboard chipsets have their own verified choices. Clothing,
shoes, materials, dimensions and sports equipment use appropriate typed fields.
Sources are stored alongside the relevant dictionary entries. Unknown models
are never synthesized from brand/category combinations.

Publication and filters share `ReferenceSelect` and database attributes. Deferred
options use 60-row pages, server search, separate selected-label resolution and
bounded caches. Values and dependencies use stable keys in RU and KK. Parent
changes clear descendants, including conditionally visible multiselect fields.

Migration 0032 adds option metadata and updates the existing option/submission
validators. It retains authentication, ownership, active-profile, leaf-category,
contact/image, select cardinality and RLS checks. Existing drafts use their
server-owned creation timestamp. New requirements start two hours after the
first data-release transaction; reruns retain that exact cutoff.

The release preserves category/attribute/option UUIDs and rejects unreviewed
scalar values, changed row counts and deactivation of referenced data. The only
reviewed user-value conversion is televisions.brand `Самсунг` → option `samsung`
(1 row). Its exact original scalar/timestamps are backed up in an ignored local
file; IDs and user data are excluded from the commit. Legacy unused inactive
model options retain their IDs; only 144 obsolete parent pointers are cleared.
The transform plan also supports the unused intermediate-candidate chipset text
field; this field was absent from the captured production baseline.

## Checks and environment boundaries

The local PGlite rehearsal uses the exact public catalog snapshot, synthetic
listings and the separately authorized single scalar backup. Local results are
not production measurements. It checks ID/value preservation, integrity, old
and new draft requirements, ownership and wrong-parent rejection.

Run the catalog target tests rather than the unrelated full regression suite:

```sh
node --test tests/catalog-audit.test.mjs tests/catalog-normalization.test.mjs tests/catalog-subject-profiles.test.mjs tests/reference-attributes.test.mjs
npm run typecheck
npm run lint
node scripts/audit-catalog.mjs --strict --output artifacts/catalog/final-audit
```

The type-transform tests separately cover allowed exact mappings and transactional
rejection of unknown values. Historical migrations remain byte-identical.
`supabase/CHECKSUMS.sha256` covers 32 migrations and the seed. The seed generator
also preserves generation metadata; the seed is for a clean database, not the
production rollout path.

## Reproducible release

```sh
npm run catalog:release -- --release-id 2026-09-13.1 --type-transforms supabase/catalog-releases/2026-09-13.1-type-transforms.json
```

Generate a second file with `--output` and compare SHA-256. Do not overwrite an
existing reviewed artifact. Record the exact source commit, SQL hash and live
pre/postflight with the rollout artifacts. Raw backups and logs are ignored.

Production sequence: verify branch/HEAD, current Cloudflare deployment and exact
backup match; announce the short catalog maintenance window; apply 0032 once and
the reviewed catalog SQL transaction; read integrity in a new connection; publish
the matching commit; smoke-test public filters and an existing listing. A push
can trigger Cloudflare builds: ensure DB postflight completes before the new
app deployment becomes active. Do not publish against a failed DB preflight.

Before rollout: GitHub/local baseline `b77438298188bca06a6a68bfaae8197265d1d7c5`;
Worker version `809d7442-a863-49e5-9c59-5db1a02aa82b`, deployment
`346b8ac3-18f3-4190-b45d-8c205a58b23e`. Release status belongs to the final rollout
record, not this preparation document.

## Reviewed SQL fingerprint

The final generated artifact (including temporary-table ANALYZE and materialized
per-attribute sort bounds) has SHA-256:
`9e8ca07b886981c1f100abf1519a63ce32868cd8b802476dc7c2cf74def34304`.
A second independent generation produced byte-identical SQL. Materialization
only avoids repeating unchanged aggregate calculations; target rows and order
remain unchanged. Do not substitute the earlier development artifacts.
