# Marketo: controlled transition from local/empty data to Supabase

User-data repositories still return designed empty states; this is deliberate
and honest. Phase A reference data is now active through
`lib/reference-data/server.ts`, while Auth/listings/chat/favorites remain behind
their existing boundaries. This is a controlled domain cutover, not a
half-mock implementation of one domain.

## Current source map

| Current source | Current consumers | Real source | Transition rule |
| --- | --- | --- | --- |
| seed-only `lib/geography.ts` | SQL seed generator only | `countries`, `regions`, `settlements` | **Phase A complete:** every runtime consumer uses the Supabase adapter/provider. |
| seed-only `lib/catalog-config.ts` | SQL seed generator only | `categories`, `category_attributes`, `category_attribute_options` | **Phase A complete:** names/tree come from Supabase; attributes/options load only for the selected category. |
| `lib/data/repositories.ts` empty listing adapter | home/search/category/listing/mine/favorites | `listings`, values, images, `catalog_listing_cards` | Replace the repository implementation atomically after reference and Auth phases. |
| `lib/data/repositories.ts` empty profile adapter | profile, seller, edit | `profiles`, `profile_private`, Auth | Activate only after phone OTP and profile-trigger tests. |
| `lib/data/repositories.ts` empty chat adapter | messages and conversation pages | conversations, participants, messages | Activate list/detail/send together; subscribe only after RLS tests. |
| `lib/data/repositories.ts` empty notification adapter | notifications | `notifications` | Render `type + payload` through RU/KK dictionaries. |
| `lib/data/repositories.ts` empty moderation adapter | admin queue/detail | listings, reports, moderation actions, audit log | Require a real moderator session and RPC authorization before enabling buttons. |
| `localStorage` listing draft in `components/publish-form.tsx` | four-step publish flow | draft listing aggregate + R2 metadata | Keep local recovery only as an offline draft cache; database save becomes authoritative in one later publish integration. |
| `localStorage` favorites in `components/listing-actions.tsx` and local card state | listing/card actions | `favorites` | Migrate only for authenticated users; anonymous device favorites may remain a separate explicitly local feature or be merged after sign-in. |
| disabled phone Auth UI | login | Supabase phone OTP | Implement request/verify states together; do not claim an SMS was sent until Supabase confirms it. |
| local photo object URLs | publish preview | Cloudflare R2 + `listing_images` | Upload through an authenticated server-signed flow; write metadata only after R2 confirms the object. |
| disabled chat/profile/admin actions | corresponding internal pages | domain queries/RPCs | Enable each action only when success/error/loading and authorization paths are complete. |

No fake users, listings, reviews, chats, messages or notifications are required
for the transition. Integration tests create ephemeral records only inside the
isolated test database.

## Phased cutover

### A. Reference data

- Status: implemented; activation requires the two public environment values.
- Old runtime: `lib/geography.ts`, `lib/catalog-config.ts`.
- New: countries/regions/settlements/categories/attributes/options.
- Pages: home, categories, search, filters, publish, profile location.
- Risk: incomplete KATO import or a mismatch in category slugs breaks URLs and
  saved filters.
- Tests: exact counts, RU/KK non-empty, parent chains, leaf selection, dynamic
  filter parity, 320–430 px selector performance.

### B. Auth and profiles

- Old: disabled phone form and empty profile adapter.
- New: Supabase phone OTP, `profiles`, `profile_private`.
- Pages: login, profile, edit, seller, protected navigation.
- Risk: a broken Auth trigger blocks signup; cookies may not refresh correctly
  on Cloudflare.
- Tests: request/verify OTP in a non-production project, duplicate signup,
  trigger idempotence, owner-only update, suspended user, SSR cookie refresh.

### C. Listings and R2

- Old: empty listing adapter, browser-only draft, local object URLs.
- New: listings/contacts/typed values/R2 metadata and owner RPCs.
- Pages: home, catalog, category, listing, publish, my listings.
- Risk: orphan R2 objects, non-atomic attribute updates, mutable route keys,
  accidental owner approval.
- Tests: draft/edit/submit/moderate/archive/sold; required attributes; upload
  compensation; SSR listing; keyset pagination; non-owner denial.

### D. Favorites

- Old: device `localStorage` state.
- New: `favorites` composite key.
- Pages: cards, listing detail, favorites.
- Risk: double actions and confusing anonymous-to-account merge.
- Tests: idempotent add/remove, own rows only, deleted listing cascade, optimistic
  rollback.

### E. Chat and Realtime

- Old: empty chat adapter and disabled composer.
- New: conversation RPC, participants, messages, Realtime on messages only.
- Pages: new conversation, messages, conversation detail.
- Risk: duplicate buyer/seller conversations, cross-conversation reads, spam.
- Tests: unique listing/pair, participant-only select/insert, system-message
  denial, read marker, reconnect, message rate limit at the server edge.

### F. Notifications

- Old: empty adapter.
- New: type/payload notifications and optional Realtime subscription.
- Pages: notifications and badges.
- Risk: trusting arbitrary payload URLs or leaking another user's events.
- Tests: owner-only read/update, no client insert, payload schema validation,
  localized rendering and safe internal links.

### G. Reports and moderation

- Old: disabled report/moderation actions.
- New: reports, moderation RPCs/actions.
- Pages: listing report, admin queue/detail.
- Risk: client-side role assumptions or silent audit gaps.
- Tests: reporter ownership, moderator-only decisions, reason requirement,
  immutable history, suspended moderator denial after role removal.

### H. Admin

- Old: empty admin adapter.
- New: `user_roles`, controlled RPCs and `admin_audit_log`.
- Pages: admin lists/details and future user management.
- Risk: initial role bootstrap and misuse of an elevated key.
- Tests: one reviewed bootstrap, admin-only role assignment, column grants,
  service-secret bundle scan, Security Advisor.

Each phase replaces its boundary in one reviewed change. Do not merge a phase
that leaves success writes in Supabase while reads still come from a different
source, or vice versa.
