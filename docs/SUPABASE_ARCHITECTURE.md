# Marketo v1.0 — current Supabase/R2 architecture

State verified from the recovery workspace on 2026-08-29. Production Supabase
and Cloudflare were not changed.

## Runtime boundary

Marketo remains one Next.js/Vinext modular monolith deployed as a Cloudflare
Worker. Server Components and narrow route handlers call Supabase through typed
domain adapters. The browser receives only a publishable Supabase key; elevated
database access is confined to server-only routes that need verified R2
metadata writes.

The schema has 29 public tables and RLS is enabled on all 29. Internal helpers
live in the private schema. Binary media is stored in Cloudflare R2 through the
MARKETO_MEDIA binding; PostgreSQL stores the verified object key, order,
dimensions, size and MIME.

## Main relationships

    auth.users
      └─ profiles ─ profile_private
           ├─ listings ─ contacts / typed attributes / images
           ├─ favorites
           ├─ conversations / messages
           ├─ notifications
           └─ reports / moderation / audit

    countries ─ regions ─ settlements
                              ├─ profiles / listings
                              └─ city_premium_settings / placements

    categories ─ category_attributes ─ category_attribute_options
          └─ listings ─ listing attribute values

## Master Catalog

The reference seed contains 1,356 categories, 1,137 meaningful leaves and 16
root verticals. Stable slugs and values are language-neutral; names, seller
labels, filter labels and options have RU/KK text. Vehicle model options are
scoped by body category, and smartphones/tablets/e-readers use independent
dictionaries. Dependent models point to parent brand options and retain a
separate other-model/manual-value path.

Seller metadata drives both publish fields and the PostgreSQL buyer-filter RPC.
The semantic validator and clean-database tests jointly guard tree structure,
dead ends, localization, dependencies, filter parity, cross-category
dictionaries and reference freshness.

## Auth and profiles

Supabase Auth owns email/password credentials and session cookies. The frontend
implements register, login, callback code exchange, logout, recovery email and
password update. Protected routes redirect through an internal-only next
parameter.

The Auth trigger creates public and private profile rows idempotently.
get_my_account_profile and update_my_account_profile bind reads/writes to
auth.uid(), validate active status, city, language and E.164 phone data, and do
not expose private phone fields publicly.

## Listing lifecycle and media

1. An authenticated owner calls create_listing_draft.
2. One transaction writes listing, private contact and validated typed category
   attributes.
3. The server image route verifies owner/editable status and enforces bounded
   multipart, per-file and total input limits.
4. Cloudflare Images decodes JPEG, PNG, WebP or HEIC/HEIF, verifies the real
   format and dimensions, applies EXIF orientation, scales down to 2560 px and
   emits a metadata-free WebP. Source bytes are never persisted.
5. The route verifies and hashes the normalized output, writes it to R2, then
   inserts image metadata with the server-only Supabase client. Failed batches
   compensate database and R2.
6. The owner calls submit_listing, which validates required data and moves the
   listing to pending.
7. A moderator-only RPC may approve pending → active.
8. Public search and media RLS expose only active, published, non-deleted
   listings.

localStorage contains only an explicit recovery reference. It is removed after
the server flow succeeds and is never the listing source of truth.

## Search and filters

search_catalog_listing_cards is SECURITY INVOKER. It applies category, city,
text, price and dynamic filter metadata in PostgreSQL across all matching public
rows. Typed scalar and option values are hydrated in batches for cards/detail.
A User A → publish/photo → moderation → User B filter/search roundtrip is
covered by the isolated security suite, including seller and ownership checks.

## City Premium Showcase

city_premium_settings has one row for every selectable settlement and default
capacity 15. city_premium_placements requires matching listing/city and uses a
transactional advisory lock to prevent overlapping capacity races. Ordinary
browser roles have read-only grants.

RLS and get_city_premium_placements expose only active placement windows whose
listing is active, published and not deleted. Ordering is deterministic per
city. The frontend displays only returned paid placements; small paid sets are
completed by a bounded set of Marketo brand cards rather than empty inventory
placeholders.

Migration 0020 adds account ownership, payment-neutral orders, priority and
rotation metadata without setting a price or creating placements. Immutable raw
impression/click events and daily aggregate rows retain account attribution;
owners can read only their own commercial records through RLS, while writes
remain server-owned. The frontend rotation uses a 3-second wall-clock timeline,
so time spent away from Home is not frozen; manual offsets persist and reduced
motion disables automatic movement.

## Security boundaries

- Anonymous: active reference data, public seller columns, active published
  listings and currently active premium placements.
- Authenticated: anonymous reads plus protected self-profile RPCs, own listing
  workflow and owner-scoped domains.
- Moderator/admin: role-checked RPCs with immutable audit records.
- Server/service role: verified image metadata and other reviewed system
  operations only.

All SECURITY DEFINER functions revoke default public execution and set an empty
search_path. Browser source is scanned for secret names/credential patterns.
Listing image metadata has no direct authenticated mutation grant.

## Environment

Browser/build safe:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- optional NEXT_PUBLIC_R2_PUBLIC_BASE_URL

Server only:

- SUPABASE_SECRET_KEY (or legacy service-role fallback)
- MARKETO_MEDIA R2 binding
- IMAGES binding for trusted decode, orientation, resizing and WebP normalization

Migration tooling only:

- DATABASE_URL

## Still external/not verified

Local PGlite, build and browser-render checks do not prove real email delivery,
remote callback configuration, Supabase branch Advisor output or live R2
delivery. Those require a disposable non-production Supabase/Cloudflare
environment and separate authorization before any production rollout. Full
official KATO import is also a separate reviewed data task.
