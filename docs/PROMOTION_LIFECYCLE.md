# Listing promotions and lifetime (0038)

The existing chooser, owner action dialog, submit RPC, moderation RPC, catalog
view, CITY_PREMIUM placements and minute archive job remain the integration points.
There is no payment integration or second showcase/queue.

## Server contract

Clients submit only `basic`, `accelerated`, `maximum`, `city_premium`, or null.
`submit_listing_with_promotion_choice` uses the existing validation/moderation path
and stores a pending choice atomically. The existing approval trigger starts it.
`set_listing_promotion_choice` starts a package immediately only for the active,
unexpired listing of an active owner. An active package or waiting/active showcase
blocks replacement and stacking. Editing preserves a running package.

| Package | VIP | X2 | Additional bump offsets |
| --- | --- | --- | --- |
| basic | 72 hours | none | none |
| accelerated | 168 hours | none | 48, 96, 144 hours |
| maximum | 168 hours | 168 hours | every 24 hours through 168 |
| city_premium | 168 hours | 168 hours | every 12 hours through 168 |

The first publication is not a bump. Private bump events have a unique
(run_id, ordinal), and processing locks the listing. A retry cannot apply an event
twice. With 0039, bumped_at uses the actual applied_at. A retry with no new event
does not move it; a later publication can overtake a processed bump.
created_at and published_at never change when a bump runs.

## Publication term

The publication trigger sets the first approved publication to 720 hours exactly.
It preserves dates when legacy draft/submit RPCs try to clear them. Starting a
package or entering the showcase extends expires_at only to the required end.
No edit, repeat approval or promotion grants another 30 days.

Migration backfill recovers the first approval from moderation history (or the
existing published_at if earlier), retaining an existing showcase's complete term.
Previous dates are recorded in the existing restricted admin audit log under
listing.lifetime_normalized for inspection/recovery.

## Existing showcase

Only city_premium writes a pending request to city_premium_placements. The old
standalone activate/connect RPCs lose browser execution privileges; the separate
post-publication offer is removed. Existing historical placements keep their IDs
and original term; they are not silently cancelled or granted new benefits.

On approval/activation the same request enters waiting. A free slot starts its
own full 168 hours and extends the listing if required. A full city leaves VIP,
X2 and bumps running while the showcase waits. The existing city advisory lock,
settings-row serialization write and capacity trigger are retained. A temporary
edit holds its slot until its original end, preventing reapproval over capacity.
The existing minute archive_expired_listings job handles bumps, expiry, queued
placements and ordinary archives. Waiting eligible requests are not archived
before they can receive their promised showcase term.

## Security and presentation

There are no browser write grants for dates, benefits, bump events or placements.
RLS is not loosened. Helpers are private with fixed search_path and revoked EXECUTE.
The existing owner-only selection table remains the package state record.

Catalog freshness is greatest(published_at, bumped_at); price sorting and filters
remain unchanged. VIP changes only the ordinary card's gold 2px border/badge; its info surface stays white.
X2 spans two grid columns with a horizontal photo. Browser deadline hooks only
remove expired presentation using server-issued dates; they never activate or
schedule benefits. Premium showcase components, CSS and carousel are unchanged.

## Targeted checks

- tests/promotion-lifecycle.test.mjs: actual migrations and RPCs on isolated PGlite;
  moderation, first publication, repeat edit, all packages/schedules, days 10/25/29,
  queue/capacity, expiry, retry idempotency, ownership and protected fields.
  The test-only clock is installed after historical security inventory checks.
- tests/promotion-choice-routes.test.mjs: actual route authorization/whitelist/errors.
- tests/publish-promotions.browser.mjs: shared chooser and actual submit/profile routes;
  create retains the chooser, edit submits without a promotion parameter.
- tests/catalog-freshness.browser.mjs: actual CatalogClient keeps server freshness
  order even for legacy promoted rows; explicit ascending/descending price remains primary.
- tests/promotion-cards.browser.mjs: six viewport geometries, white/gold VIP, two-slot
  X2, combined state and visual expiry without removing the still-live listing.

On memory-limited Windows, use Node flags --disable-wasm-trap-handler --liftoff-only
--no-wasm-tier-up --max-old-space-size=256 --max-semi-space-size=4 for the DB test.
Its empty baseline cache is keyed by every historical migration's contents.
