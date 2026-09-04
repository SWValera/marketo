# Marketo v1.0

Kazakhstan-first, mobile-first marketplace built as a Next.js/Vinext modular
monolith for Cloudflare Workers, Supabase PostgreSQL/Auth and Cloudflare R2.
Prices are stored in minor units and the Kazakhstan catalog uses KZT. Public
and account UI is localized in Russian and Kazakh.

## Stage 3 owner listing lifecycle status — 2026-08-31

- Production Supabase was not changed, no deployment was performed and no
  GitHub push was made by this recovery workspace.
- Migrations 0001–0022 are immutable. Owner draft/rejected replacement and
  safe rejection feedback are added by the forward-only migration
  0023_owner_listing_draft_lifecycle.sql.
- Master Catalog contains **1,356 categories**, **1,137 meaningful leaves** and
  **16 root verticals**. The clean seed contains 14,310 seller-attribute
  assignments and 84,490 option assignments.
- The semantic gate checks taxonomy structure, RU/KK, seller/filter parity,
  dependencies, vehicle body scope, device dictionary isolation and reference
  freshness. It also verifies contextual RU/KK helper text for every category.
  See docs/MASTER_CATALOG_VALIDATION.md and docs/CATALOG_BENCHMARK.md.
- Email/password registration, login, same-device callback notification,
  cross-device manual fallback, logout, password recovery/update and profile
  editing use Supabase Auth/Profile RPCs. Supabase Auth remains the only user
  identity source.
- Publish creates an authenticated Supabase draft and stores typed attributes
  and private contact data. The browser decodes JPEG/PNG/WebP/HEIC photos,
  applies orientation, scales them to at most 2560 px and re-encodes them as
  bounded JPEGs. The server validates the JPEG structure, strips application
  metadata again, stores the bytes in MARKETO_MEDIA R2, then submits the listing
  to pending. Browser localStorage is
  user-scoped, consent-based recovery-only storage with a seven-day TTL.
- The authenticated profile reads real owner listings with bounded pagination,
  protected non-public media, localized statuses and owner archive/sold actions.
- Draft and rejected listings reopen in the Publish form, validate through one
  shared client/server contract, update their full aggregate atomically and can
  be submitted or resubmitted to moderation.
- Public search and filters execute against PostgreSQL, not an in-memory slice.
- `/admin` is server-guarded for active moderator/admin accounts. Its real
  pending queue, review detail, private media access and approve/reject actions
  use the session Supabase client, RLS and the audited `moderate_listing` RPC.
- Home order is Header/Search → City Premium Showcase → Catalog/Listings. Each
  selectable city has default premium capacity 15; only currently active paid
  placements are returned. A limited RU/KK Marketo card set fills small paid
  sets without rendering empty placeholders. Rotation follows a persistent
  wall-clock timeline every 3,000 ms; desktop shows three complete cards and
  mobile shows two. Account/order and account-scoped impression/click storage
  are prepared without a payment integration, fixed price or fake placements.

## Runtime

- Node.js >=22.13.0
- Official npm commands enable Node's native TypeScript stripping explicitly;
  no ambient `NODE_OPTIONS` configuration is required.
- npm with committed package-lock.json
- Cloudflare Worker entry: dist/server/index.js
- static assets: dist/client
- R2 binding: MARKETO_MEDIA

Required public Supabase values and server-only secrets are documented in
.env.example. Never expose SUPABASE_SECRET_KEY or a service-role key through a
NEXT_PUBLIC variable.

## Verification

Run, in order:

    npm run install:ci
    npm run validate:db
    npm run validate:catalog
    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm run validate:artifact

npm test performs a production build before running all Node tests. The test
suite includes clean migration/seed execution, immutable migration hashes,
semantic catalog regressions, Auth contracts, verified-image checks, User A →
moderation → User B listing discovery, RLS/security and premium-capacity rules.

Generate the reviewed SQL checksum manifest only after an intentional SQL/seed
change:

    npm run db:checksums

## Source boundaries

- lib/catalog-config.ts, reference dictionaries and generators are the
  maintainable taxonomy source; runtime pages read Supabase adapters.
- supabase/seeds/001_marketo_reference.sql contains reference data only—no
  users, listings, messages or credentials.
- lib/supabase/browser.ts uses only the publishable key.
- elevated R2 metadata writes live in authenticated server routes and happen
  only after object verification.
- db/schema.ts and lib/supabase/database.types.ts mirror the PostgreSQL
  contract.

Current engineering documents:

- docs/MARKETPLACE_CATALOG_BENCHMARK.md
- docs/MASTER_CATALOG_VALIDATION.md
- docs/CATEGORY_COVERAGE_REPORT.md
- docs/RECOVERY_STATE_AUDIT_2026-08-28.md
- docs/SUPABASE_ARCHITECTURE.md
- docs/SUPABASE_AUTH_EMAIL_SETUP.md
- docs/ADMIN_BOOTSTRAP.md
- supabase/MIGRATION_MANIFEST.md

The 90-city geography is a reviewed bootstrap, not the full official KATO
register. A complete KATO import remains a separate reviewed data task.
