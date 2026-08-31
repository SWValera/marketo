# Supabase reference-data integration

> Historical Phase A snapshot. The current 2026-08-28 runtime also includes
> Auth/profile, real listing/R2 and City Premium cutovers; see
> `docs/MOCK_TO_SUPABASE_PLAN.md` and `docs/SUPABASE_ARCHITECTURE.md`.

## Scope

This phase connects only public reference data. Auth, profiles, listings,
favorites, chat, notifications and moderation keep their previous safe empty or
disabled adapters.

Runtime tables:

- `countries`
- `regions`
- `settlements` (`is_active` + `is_selectable`)
- `categories`
- `category_attributes`
- `category_attribute_options`

All reads use the project URL and publishable/anon key. RLS remains the security
boundary. No service/secret key is imported by the reference layer.

## Request flow

1. `app/layout.tsx` calls `getGeographyReferences()` and supplies the resulting
   RU/KK geography snapshot to the header and every city selector.
2. Home, categories, search, category, publish and sitemap call
   `getCategoryReferences()` on the server.
3. The mobile selector receives the flat parent-child rows but renders only the
   current level. Search builds paths from those same Supabase rows.
4. Catalog and publish load attributes/options only for the selected category.
   Initial catalog attributes are server-rendered; later category changes call
   `GET /api/reference/categories/:id/attributes`.
5. Public reference results are cached for five minutes in a warm Worker
   isolate. The attribute endpoint also emits short shared-cache headers.

The complete option set is therefore not serialized into every page or rendered
in the mobile DOM. Passenger-car brand options are maintained by the reference
seed/migration and only the chosen category is fetched.

## Environment

Required in ignored `.env.local`, Cloudflare Preview, and Cloudflare Production:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

For a legacy project, `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a temporary
fallback. `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`
are not required for this phase.

If the two public values are absent or a read fails, the Worker still builds and
returns a localized unavailable state. It never silently falls back to seed or
mock data.

## Read-only live verification

After setting the two public variables locally:

```bash
npm run verify:reference
```

The script counts the six public tables through RLS and checks a RU/KK category
sample. It performs no INSERT, UPDATE, DELETE, RPC or SQL migration.

## Seed source boundary

`lib/geography.ts`, `lib/catalog-config.ts` and
`lib/reference-data/vehicle-brands.ts` remain only because
`scripts/generate-reference-seeds.mjs` uses them to regenerate the reviewed SQL
seed deterministically. A project-integrity test rejects any import of those
files from application routes and UI components.
