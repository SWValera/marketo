# JEVU moderation foundation — engine jevu-moderation-1

## Baseline / integration

Baseline: `968257e`, branch `stage3-staging`. Submission already validates a leaf
category, required attributes, images, contacts and active owner in PostgreSQL.
`submit_listing[_with_promotion_choice]` changes draft/rejected to pending.
`moderate_listing` was manual-only. Existing `reports`, staff roles, protected
media routes and admin queue are reused. Auth remains email-based.

The publication-period trigger from 0038 owns the initial published_at and 720-hour
term. Existing promotion/showcase triggers own entitlements. They are not replaced.
A shared private approval primitive now serves authorized human decisions and
validated automatic results. Promotion-only fields are absent from revision hashes.

## Flow

Submit → durable immutable content revision → queued run → claimed lease → rules /
text / category / privacy / fraud → per-image technical/hash/semantic/OCR → decision
→ atomic revision comparison and publication OR fix/reject/manual → audit.

Listing statuses stay compatible: pending covers submitted/automatic/manual;
active means approved; rejected covers rejected/needs_fix. Detailed moderation
status is a separate owner-safe RPC. SYSTEM_ERROR becomes HUMAN_REVIEW after
bounded retries; the browser is only a status observer. No simulated progress.

Canonical PostgreSQL jsonb SHA-256 includes title, description, category/path,
settlement, attributes, price/currency, immutable R2 keys, image metadata/order.
The snapshot excludes account/session/contact records and all promotion fields.
Photo SHA-256 is computed from R2 bytes separately; unsupported/corrupt images
cannot pass. Perceptual hashes remain null: no unsupported decoder is invented
for the Worker. Approved stored photographs are reused, not uploaded again.

Parent-row locks serialize edits, submission and result application. Callback
claim tokens and leases prevent concurrent/replayed completion. New content or
active ruleset creates a new run; compatible duplicates reuse the existing run.
A completed decision is never silently replayed to republish a resubmission.
Human overrides invalidate in-flight jobs and append separate history.

## Data / permissions

Migration 0040 creates only private, RLS-enabled tables: moderation_settings,
moderation_rulesets, moderation_rules, listing_content_revisions, moderation_runs,
moderation_findings, moderation_image_hashes, moderation_overrides,
moderation_appeals, seller_phone_verifications, seller_phone_challenges.
Existing listing columns and public catalog queries are unchanged.
Browser/service roles have no direct privileges on these tables. Narrow RPCs
validate active owner/staff/admin independently of UI. Only service_role can
claim/finish jobs or persist successful SMS verification. A moderator cannot
change global rules. Owners cannot set status, dates, results, risk or roles.

Rule rows have bilingual descriptions, jurisdiction, type/scope/category matcher,
severity/action/priority/config, legal status/basis/source, effective dates, version
and timestamps. Rules are copied into each run; later policy edits cannot rewrite
past decisions. Initial ruleset: `kz-policy-2026-09-26.1`.

## Rules / decisions

Initial JEVU_POLICY rules: drugs, illegal_precursors, vape, tobacco, nicotine,
weapon, ammunition, explosive, forged_document, stolen_payment_data,
illegal_service and adult_content (review). `regulated` is LEGAL_REVIEW_REQUIRED.
No initial automated rule claims LAW/REGULATION authority. Sources are context
for legal review, not an assertion that every matching item is illegal.

Unicode NFKC, invisible characters, separators, common lookalikes/leetspeak and
compact matching identify candidates in RU/KK/Latin text. A keyword is only a
candidate. Explicit unambiguous sale phrases under policy may reject; accessories,
books, toys, negation and uncertainty require review. Provider observations are
strict enums/confidence/subject, not provider-authored legal decisions.

Precedence: confirmed policy hard-block → reject; incomplete stages/conflicts →
human; fixable privacy/category problem → needs_fix; elevated measured fraud →
human; only all required checks + two enabled rollout controls → approve.
Required checks include semantic text and semantic/OCR for every image. A low
risk score cannot bypass missing checks. There is no invented market-price model.
Fraud uses recent submissions, prior rejections, confirmed reports, exact content
fingerprints and repeated SHA-256 photo use; these are signals, not accusations.

## Providers / flags

Actual AI: unavailable. Actual OCR: unavailable. Actual SMS: unavailable.
Unavailable adapters throw explicit errors; they never return fabricated PASS.
Current Cloudflare Images binding normalizes photos; it is NOT an AI/OCR service.

- `MODERATION_FRAMEWORK_ENABLED=true`: enable Worker processing AFTER DB postflight.
- `MODERATION_AI_ENABLED`: false/absent by default; cannot create an adapter.
- `MODERATION_AI_PROVIDER`, `MODERATION_OCR_PROVIDER`: reserved adapter selection.
- `MODERATION_EXTERNAL_PROCESSING_BASIS`: reserved documented processing basis;
  setting it alone does not allow an external transfer.
- `MODERATION_SMS_ENABLED`, `MODERATION_SMS_PROVIDER`: readiness points only until
  a real reviewed adapter is installed. The current phone POST returns 503.
- Private DB `auto_approve=false`: second independent publication rollout gate.
- Private DB `require_verified_kz_phone=false`: no disruption from missing SMS.

Implement ModerationAIProvider / ModerationOCRProvider in server-only modules.
Use fixed system instructions and send listing fields exclusively as DATA; never
interpolate them into instructions. Adapters must support RU and KK, abort signals,
strict schemas and versioned identities. Text minimizes/redacts contacts/IDs. No
user ID/email/password/session/token/IP/account-history object is passed.
External image/OCR transfer is currently denied even if text transfer is enabled;
use a reviewed KZ provider or design and validate an image-redaction step first.
No prompts or raw model responses are persisted or logged.

For SMS, implement SMSVerificationProvider, authenticated same-origin send/verify
routes with server-only provider calls, and the existing service-role challenge RPC.
Challenge references, five attempts, five-minute expiry and hourly rate limit are
DB-owned. Never treat a submitted number or a local stub as verified. Validate
actual KZ allocation/provider support before enabling public-launch enforcement.
Email authentication remains intact. A real provider and legal review are external
launch dependencies.

## Queue / operational recovery

Worker scheduled handler runs one bounded job each minute; successful submit also
kicks a job with waitUntil. It does not depend on an open browser. Jobs lease for
180 seconds, retry at 30*2^attempt seconds, at most three attempts. Every provider
call has a 3-second runtime timeout; an aborted callback cannot publish later.
The existing Supabase minute `archive_expired_listings` scheduler still handles
promotions and now also requeues expired leases and sends stuck jobs (>15 minutes)
to human review. No paid queue service is added.

Check `/admin/moderation` for appeals, reports, metrics and admin-only rules.
`get_listing_moderation(id,true)` returns run history/findings/overrides for staff.
Metrics contain counts, duration, retries and codes, not raw PII. Cron health and
oldest queued age must be monitored by the operator; no automatic legal updates.

## Human review / complaints / appeals

Existing `/admin` queue and photo detail remain. Staff approve/reject/needs_fix
with reasons; an override requires a reason and retains automatic history.
Reports reuse the existing table and are idempotent per account/listing/reason,
with an hourly cap. Only confirmed serious reports hide an active listing into
manual review; unverified complaints never auto-punish a seller.
Appeals are unique per owner/run and resolved only by humans. Overturning the
current rejection reopens human review; it does not auto-publish the listing.

## Rule changes

Admin: clone active version → edit draft config/action/enabled/effective dates →
review → activate. Each step requires a reason and records actor/time/change.
Never edit an active row or reuse a released version. A new rule code is introduced
by a forward migration into a draft ruleset, with RU/KK reasons, deterministic
and semantic tests and precise official legal metadata. LAW/REGULATION activation
requires separate legal validation. LEGAL_REVIEW_REQUIRED must not hard-block.

## Privacy / retention

OCR text exists only in memory; evidence uses fixed codes and bilingual templates.
Content snapshots are private, retained 30 days, then cleared by the watchdog
while hashes, rules and sanitized findings preserve the decision history. Exact
raw text cannot be reconstructed after retention expiry. Original photographs
remain under existing listing/R2 lifecycle, not copied to moderation storage.
Resolved appeal text is cleared after 90 days; expired SMS challenges after one
day. Retention periods and regional hosting require operator/legal approval.
Hashes/history persist until listing deletion under existing FK/account deletion.
New phone records are cleared when the existing erasure flow marks a profile
deleted; appeal FKs cannot block listing erasure. Existing moderation_actions
history keeps the existing SET NULL behavior.

## Release / rollback

First verify target schema is exactly through 0039, existing scheduler is healthy,
backup/PITR availability and all local gates. Save a fresh scoped schema snapshot
of the replaced functions and report ACLs, hash it and rehearse restoration on a
disposable database before applying 0040. This snapshot contains no user rows and
does not replace full database backups/PITR; those remain operator responsibilities.
Apply the exact checksum-pinned migration in a transaction, postflight,
then deploy matching Worker/UI. Do not deploy new RPC callers before the migration.
Enable framework processing; leave automatic publication and SMS enforcement off.
Only activate auto-approval after real RU/KK providers and quality review.

Emergency rollback: disable MODERATION_FRAMEWORK_ENABLED and DB auto_approve,
keep the migration/history and current manual UI. The watchdog moves pending
jobs to humans. Never drop moderation tables or reset listing dates. Rolling back
the entire app to pre-0040 requires a reviewed compatibility release because
report writes now use a protected RPC rather than direct table INSERT.

Read-only release queries: `supabase/operations/0040_moderation_preflight.sql` and
`0040_moderation_postflight.sql`. Compare normalized function hashes before release,
11 private RLS tables, RPC/column ACLs, 12 policy + 1 legal-review rule, disabled
approval/phone enforcement, unchanged listing aggregates and the existing DB cron.
No production fixtures or public listings are needed for these checks.

The regression fixtures now reflect the already released 0032 catalog counts and
conditional required attributes, and 0038's retained 720-hour publication dates.
Only test expectations/fixtures changed; category data and lifecycle code did not.
