# City Premium promotion foundation

Migration 0034 adds promotion_products: CITY_PREMIUM is enabled, lasts 604800 seconds, has 15 places per city, and costs 0 KZT. VIP, TOP, BUMP and HIGHLIGHT are reserved product codes without implementation or UI.

The existing city_premium_placements ledger is extended rather than duplicated, preserving orders, analytics and IDs. Each activation records owner, type, status, start/end, price snapshot, currency, payment state and nullable reference. The historical table name and settlement_id city key remain. Historical erased owners can be NULL; new activations always derive the authenticated owner. Expired records remain; renewal creates a new record.

Reserved placements have reservation_expires_at and nullable activation dates. Leases consume capacity until expiration. No checkout/webhook/paid activation exists. Changing the product price to a nonzero value prevents use of the free RPC. Future trusted payment code must validate payment and an unexpired lease before activating that same reservation, using actual activation time and the captured price.

## Capacity and security

The RPC accepts only listing ID, locks the listing and city, validates ownership and listing availability, and derives all critical fields server-side. Repeated activation returns the same current placement without extending it. The trigger also checks trusted writes, denies overlapping placements for a listing, and counts eligible live placements plus unexpired reservations.

The existing city settings row is an MVCC synchronization point: a stale Repeatable Read transaction fails instead of allocating beyond capacity. Product configuration is read from promotion_products, not legacy city capacity settings. See PostgreSQL transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html

No client write grants are added. New owner/payment columns are excluded from public table SELECT. Owner information is returned by an owner-checked RPC.

## Expiry and UI

Showcase reads require active listing, correct city, CITY_PREMIUM, active status and a current time window. Expired placements and leases free capacity immediately, independently of cron. The existing minute archive_expired_listings job additionally calls expire_listing_promotions; its ordinary listing behavior and return value are preserved. Promotion expiry never changes a listing.

The publication wizard still submits for moderation. Its success screen accepts an optional pending approval intent; moderation activates it automatically if a place is available. Active listings can also be promoted from the owner's profile card. The profile panel loads only when expanded, without adding work to server account-page rendering. RU/KK shows configured price, duration, availability, full/error/pending states and current/expired status. Promotion errors do not undo publication.

## Verification and release

Targeted RPC/localization tests, the existing publication/showcase regression, and the reusable city-premium-db-audit cover ownership, capacity, lease expiry, renewal, price snapshots and listing lifecycle independence. The existing premium commercial security suite calls that audit. Native PostgreSQL uses isolated synthetic data and two separate connections to additionally prove Read Committed and Repeatable Read races.

The browser suite checks the actual offer/adapter with isolated transport fixtures across RU/KK and mobile/desktop. Typecheck and lint run before release. The existing Cloudflare workflow builds the production bundle. Apply 0034 before activating client code; confirm the predecessor functions and the existing cron job. No production sample listings are created.


## Selection before moderation (0035)

The existing activation RPC also accepts an owner's pending listing. It stores one
pending_approval intent with null starts_at, ends_at and reservation_expires_at.
The intent does not reserve capacity. Selection is refused if the city is already
full. Repeated requests return the same intent under a listing row lock plus a
partial unique index.

On leaving moderation, an AFTER status trigger makes one attempt to activate the
intent using the same private allocation path as active-listing owner activation.
The unchanged placement trigger enforces atomic city capacity. Only activation
starts the configured duration. The private helper cannot be called by API roles
and never substitutes the moderator's identity for the owner.

A full city cancels the intent with capacity_full; rejection cancels it with
moderation_rejected. Other activation failures cancel it with activation_failed.
Only optional promotion work is inside the exception subtransaction: ordinary
moderation still succeeds. There is no automatic retry queue. The owner offer
displays selection, the active end date, or a clear terminal outcome in RU/KK.
