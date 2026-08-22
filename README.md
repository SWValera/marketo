# Marketo

Marketo is a mobile-first marketplace for Kazakhstan built with Next.js, React, TypeScript and Vinext for Cloudflare Workers. The repository keeps the existing modular-monolith structure and is prepared for Supabase PostgreSQL/Auth/Realtime and Cloudflare R2 bindings.

## Current database status

- **DATABASE STATUS:** migrations `0001`–`0012`, RLS and the reference seed are reported as applied in the target Supabase project. This checkout performs no remote SQL mutation.
- **REFERENCE RUNTIME:** countries, regions, selectable settlements and the category tree are read from Supabase with the publishable key; category attributes/options are loaded on demand.
- **GEOGRAPHY STATUS:** 90-city bootstrap is active; full official Kazakhstan KATO import remains a separate reviewed data task.
- **CATEGORY STATUS:** initial Marketo reference taxonomy is active and remains reviewable through reference data, not JSX.

## Runtime

- Node.js `>=22.13.0`
- npm with the committed `package-lock.json`
- Cloudflare Workers + static assets from `dist/client`
- Worker entry point: `dist/server/index.js`

## Local verification

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm run validate:db
npm test
```

The complete npm chain is native to Node.js and works in Windows
`cmd.exe`/PowerShell, Linux and macOS. `dev`/`start` use `cross-env`; build,
install, tests, lint, typecheck, artifact validation and database tooling use
the `.mjs` runners in `scripts/`. No npm command requires Bash, GNU `timeout`,
`flock`, `curl`, `sha256sum` or shell glob expansion.

`npm test` performs the production build, validates the Worker artifact and runs route, PWA, geography, category-tree, empty-repository, CSS, shell-safety and Cloudflare-configuration checks.

`npm run install:ci` is the hardened cross-platform equivalent of `npm ci`. It
creates only ignored, project-local runtime/cache directories, serializes
installs, validates the integrity-pinned Vinext tarball, applies a bounded
timeout and verifies the installed CLI.

## GitHub → Cloudflare

Use the committed configuration without duplicating its settings in the Cloudflare dashboard:

- install: `npm ci` (or the platform default lockfile install);
- build command: `npm run build`;
- deploy command: `npx wrangler deploy` when a separate deploy command is requested;
- Worker config: `wrangler.jsonc`;
- Worker main: `dist/server/index.js`;
- assets directory: `dist/client`;
- required Node compatibility flag: `nodejs_compat`, defined once in `wrangler.jsonc`.

`vite.config.ts` intentionally does not pass `compatibility_flags` through `localBindingConfig`. Adding `nodejs_compat` there would duplicate the Wrangler flag and reproduce Cloudflare error 10021.

## Cross-platform script safety

No npm command references a `.sh` file, so Git executable bits cannot produce
`Permission denied` anywhere in the Windows → GitHub → Cloudflare Linux path.
The original `.sh` helpers remain only as optional legacy Linux entry points;
the Node `.mjs` implementations are the authoritative npm/build chain.

## Product data

- `lib/reference-data/` is the runtime RU/KK contract and Supabase adapter for geography, category hierarchy and dynamic attributes.
- `lib/geography.ts` and `lib/catalog-config.ts` are retained only as deterministic source material for regenerating the reviewed SQL seed. Application routes/components no longer import them.
- `lib/data/repositories.ts` defines the frontend data boundary. Its current adapters return honest empty results; they never fabricate users, listings, chats, ratings or counters.
- `supabase/migrations/` contains 12 ordered production PostgreSQL migrations for 23 RLS-protected tables, controlled RPCs, indexes and narrowly scoped Realtime publication. The Cloudflare build does not apply them.
- `supabase/seeds/001_marketo_reference.sql` contains only RU/KK geography/category reference data. `scripts/generate-kato-seed.mjs` is the reviewed import boundary for the full official KATO hierarchy.
- `lib/supabase/` and `lib/data/supabase/` contain typed clients and domain queries. The reference-data phase is active; Auth, listings, favorites, chat and moderation remain intentionally disconnected.
- Draft publication data is stored only in the current browser until Supabase Auth, PostgreSQL and R2 adapters are connected.

Database review and rollout documentation:

- [`docs/SUPABASE_ARCHITECTURE.md`](docs/SUPABASE_ARCHITECTURE.md)
- [`docs/MOCK_TO_SUPABASE_PLAN.md`](docs/MOCK_TO_SUPABASE_PLAN.md)
- [`docs/SUPABASE_PREPARATION_REPORT_2026-08-21.md`](docs/SUPABASE_PREPARATION_REPORT_2026-08-21.md)
- [`docs/SUPABASE_FINAL_AUDIT.md`](docs/SUPABASE_FINAL_AUDIT.md)
- [`docs/SUPABASE_REFERENCE_INTEGRATION.md`](docs/SUPABASE_REFERENCE_INTEGRATION.md)
- [`supabase/README.md`](supabase/README.md)
- [`supabase/MIGRATION_MANIFEST.md`](supabase/MIGRATION_MANIFEST.md)

Runtime secrets belong in Cloudflare/Supabase environment settings. `.env*`, private keys, caches and build artifacts are ignored and must not be committed.

## Russian / Kazakh interface

- `lib/i18n/messages.ts` is the type-aligned RU/KK interface dictionary; `lib/catalog-kk.js` centralizes Kazakh catalog vocabulary.
- `I18nProvider` and the global `LanguageSwitcher` update the visible interface on the current route and store the choice in the `marketo-locale` cookie and browser storage.
- Long client forms (`/publish`, `/profile/edit`, `/login`) and catalog filters keep their current input and step while the language changes.
- The root layout reads the cookie for SSR, sets the correct `<html lang>` and emits localized public metadata. The Supabase profile schema includes a locale FK (`language_code`) for signed-in synchronization.
