# Marketo

Marketo is a mobile-first marketplace for Kazakhstan built with Next.js, React, TypeScript and Vinext for Cloudflare Workers. The repository keeps the existing modular-monolith structure and is prepared for Supabase PostgreSQL/Auth/Realtime and Cloudflare R2 bindings.

## Runtime

- Node.js `>=22.13.0`
- npm with the committed `package-lock.json`
- Cloudflare Workers + static assets from `dist/client`
- Worker entry point: `dist/server/index.js`

## Local verification

```bash
npm ci
npm run lint
npm test
```

`npm test` performs the production build, validates the Worker artifact and runs route, PWA, geography, category-tree, empty-repository, CSS, shell-safety and Cloudflare-configuration checks.

For the restricted Linux build environment used by this checkout, `npm run install:ci` is the hardened equivalent of `npm ci`. It creates only ignored, project-local runtime/cache directories.

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

## Linux shell safety

Repository shell files do not need the executable bit. npm calls every standalone helper through `bash`; helpers that must export environment variables are loaded with `source`. This makes the Windows → GitHub → Cloudflare Linux path independent of manual `chmod +x`.

## Product data

- `lib/geography.ts` is the single RU/KK-ready Kazakhstan reference: country, 17 regions, three cities of republican significance and 90 cities from the current KATO classifier.
- `lib/catalog-config.ts` is the single RU/KK-ready category tree: localized names, search/title prompts, filters and dynamic publication attributes for more than 200 category nodes.
- `lib/data/repositories.ts` defines the frontend data boundary. Its current adapters return honest empty results; they never fabricate users, listings, chats, ratings or counters.
- `supabase/migrations/0001_marketo_core.sql` documents the future PostgreSQL structure and RLS baseline. It is not executed by the current Cloudflare build.
- Draft publication data is stored only in the current browser until Supabase Auth, PostgreSQL and R2 adapters are connected.

Runtime secrets belong in Cloudflare/Supabase environment settings. `.env*`, private keys, caches and build artifacts are ignored and must not be committed.

## Russian / Kazakh interface

- `lib/i18n/messages.ts` is the type-aligned RU/KK interface dictionary; `lib/catalog-kk.js` centralizes Kazakh catalog vocabulary.
- `I18nProvider` and the global `LanguageSwitcher` update the visible interface on the current route and store the choice in the `marketo-locale` cookie and browser storage.
- Long client forms (`/publish`, `/profile/edit`, `/login`) and catalog filters keep their current input and step while the language changes.
- The root layout reads the cookie for SSR, sets the correct `<html lang>` and emits localized public metadata. The Supabase profile schema includes a validated `language` preference for signed-in synchronization.
