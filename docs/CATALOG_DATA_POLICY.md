# Catalog data release policy

Marketo separates immutable database migrations from evolving catalog reference
data. Migration `0024_catalog_completeness.sql` is historical and must remain
byte-for-byte unchanged. A new make, model, attribute label or option does not
justify another migration unless the database schema or contract also changes.

## Release artifact

Generate a reviewed catalog snapshot with an explicit release id:

    npm run catalog:release -- --release-id <CATEGORY_REFERENCE_VERSION>

`CATEGORY_REFERENCE_VERSION` берётся из `lib/reference-data/release.ts` и обязан
совпадать с идентификатором SQL data release. Это гарантирует новый URL кэша при
каждом изменении каталога.

The default artifact is
`artifacts/catalog/releases/<CATEGORY_REFERENCE_VERSION>.sql`. `--output` may be used
for reproducibility checks, but every path under `supabase/migrations` is
rejected. Existing artifact files are opened in create-only mode and cannot be
overwritten. Release ids are immutable: after review, a changed snapshot
receives a new id rather than replacing the previous artifact.

The generated SQL inserts, reactivates and updates category tree rows from the
typed source, then synchronizes their attribute and option reference rows. It
retains stable slugs, keys and UUIDs, refuses incompatible type changes, refuses
to deactivate rows referenced by listings, and runs its checks and updates in
one transaction. Active categories absent from the canonical snapshot are
soft-deactivated only when no listing references them; otherwise the whole
transaction aborts. It never hard-deletes categories. Permanent functions,
triggers, grants and tables remain the responsibility of numbered schema
migrations.
Conditional requirements are promoted only when preflight proves that no
existing listing currently matches the condition without the required value.

## Review and rollout

1. Review the typed catalog source change and generate a new release id.
2. Generate the same id twice from the same commit and require byte-identical
   output.
3. Record the source commit, release file SHA-256 and expected row counts.
4. Take the authorized scoped backup and rehearse the exact artifact on a
   disposable clone. Apply every missing schema migration first, including
   `0027_conditional_required_attributes.sql`, before the catalog artifact.
5. Use a short announced maintenance window. The release fails after five
   seconds if its locks are busy instead of waiting indefinitely.
6. Run production preflight, apply missing schema migrations in order, apply
   the exact reviewed catalog bytes once, then run a new-connection postflight.
7. Deploy the matching app commit only after the database postflight passes,
   so no new immutable cache key can capture the previous catalog.
8. Keep the release artifact and rollout evidence; never edit migration 0024
   or reuse an existing release id for different bytes.

Generation is local and does not connect to Supabase. Production application
always requires its own explicit authorization.
