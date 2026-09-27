# Automatic moderation (engine 3)

This extends the existing framework; ruleset `kz-policy-2026-09-26.3`, lexical
engine 2, observation schema v1, image pipeline and publication lifecycle remain.
No legal rules were added. This is a technical compliance/moderation framework;
legal validation of applicability/rules remains separate before public launch.

## Flow and gates

Ordinary submit/content edit creates the existing immutable revision and durable
job, irrespective of account identity. The minute scheduler runs local rules,
technical images/SHA/dHash and one multimodal Responses request using the existing
OpenAI adapter. Vision and complete indexed OCR are mandatory. OCR text is consumed
locally for lexical/privacy checks and discarded. No backfill or tester allowlist.

`evaluateAutomatic` maps validated observations to active JEVU_POLICY rules.
Only confirmed offered-item observations >=0.98 can support automatic rejection;
context conflict, unknown/ambiguous items and uncertainty >0.15 hold for a human.
A proven local policy hard block can reject without an AI call. No LAW or
REGULATION automatic blocks are introduced. Approved requires all distinct
mandatory PASS stages, a matching successful call ledger, no unresolved findings,
category match >=0.9, low uncertainty, current revision/ruleset and enabled gates.
A fixable privacy/category problem returns NEEDS_FIX; a proven privacy repair may
also resolve weaker *fixable* doubts by requiring resubmission, never publication.
Technical failure/missing schema/image/OCR/provider/budget yields HUMAN_REVIEW.

DB statuses stay APPROVED / REJECTED / NEEDS_FIX / HUMAN_REVIEW. Staff presentation
uses AUTO_APPROVED / AUTO_REJECTED / AUTO_UNCERTAIN. `decision_source=AUTOMATIC`
and immutable `decision_basis`, sanitized trace and timeline identify the outcome.
The existing private publication primitive and lifecycle triggers alone set dates.
Retries, reapproval and content edits never renew the first publication period.
Promotion-only mutations remain outside the content hash.

## Controls and rollback

Worker emergency controls (server-only string booleans):
- MODERATION_AUTOMATIC_ENABLED
- MODERATION_AUTOMATIC_APPROVAL_ENABLED
- MODERATION_AUTOMATIC_REJECTION_ENABLED
- MODERATION_EXTERNAL_AI_ENABLED
- MODERATION_AI_SHADOW_MODE (true means manual fallback for final decisions)

Provider/model/OCR/hash flags retain their existing conventions. External requests
require a nonempty MODERATION_EXTERNAL_PROCESSING_BASIS and an explicit
MODERATION_AI_ENABLED_SINCE. OPENAI_API_KEY is a Worker secret only.
Private DB settings additionally require automatic_enabled, auto_approve,
auto_reject and automatic_since. Only a currently active admin can change them via
moderation_admin('settings', { reason, ... }). Enabling the master records a new
server timestamp: older jobs cannot enter the automatic provider/publication path.
Activation after release is an explicit audited operation, never a migration
side effect. Worker and DB gates must both allow an action. Disabling the DB master
immediately blocks pending completions; disable external Worker AI to stop spend.
Keep tables/history when rolling back; disable switches and deploy the previous
Worker if necessary. Do not roll back/drop 0042 or erase completed decisions.

Bounds remain 2 reserved calls/run and 50/day, existing 20s provider timeout and
180s job lease. Daily budget exhaustion holds for review. No infinite retries.
Existing SMS gate/readiness is unchanged and not enforced for this closed test.

## Existing owner account and administration

Owner permission is mapped to the **existing active admin role**, not a new auth
identity or frontend ID/email. The release operator identifies the existing
moderator from server role bindings/history and adds admin only to that account,
preserving moderator. Migration grants nobody a role. Other moderators retain
pending review rights; they cannot edit sellers' listings, change global rules or
override completed non-pending decisions. Every SQL owner operation checks the
active role again. Users cannot write private runs, calls, findings or switches.

/admin lists all listings with paginated filters for automatic outcomes, technical
holds, overrides, reports and appeals. The case view shows machine-only lexical
matches/exceptions/families, image hashes, provider metadata, Vision/OCR/category,
stage timeline, original decision, overrides and complete historical runs.
Metrics cover decisions, deterministic/AI-assisted rejects, usage/errors, duration
and directional overrides. No precision/recall claim without human ground truth.

Existing moderator decisions require a reason. Admin can approve rejected/archived
content or reject/fix an active listing through the same publication primitive.
Automatic records are never rewritten; overrides append actor/reason/timestamp.
Owner controls edit title/description/price, archive or soft-delete with audit.
Editing compares the displayed content hash, invalidates old in-flight jobs and
resubmits through the queue; it never modifies ownership, contacts or promotions.
Category/attributes/media remain with the existing seller editor. Soft deletion
retains data/history; recovery remains an operator action, not a physical purge.

## Privacy and validation

OpenAI receives redacted listing content/category/attributes and bounded server
image derivatives, never account identity/session/JWT/email/password/secrets.
Pictures may still contain sensitive text: closed testing must use synthetic IDs,
cards/documents. Prompts/raw responses/base64/OCR are not retained. DB sanitizers
allow only machine codes, indexed observations, timing and usage. Normal owners
see only RU/KK outcome/reasons; staff-only routes contain the internal trace.
Retention of revision snapshots/evidence remains the existing framework policy.

Run automatic unit/DB/workerd tests and existing moderation/promotion regressions.
`scripts/smoke-moderation-automatic.mjs --real` is an explicit paid release harness:
isolated PGlite auth/listings + remote workerd preview with the existing adapter,
Worker secret and Images binding. It cannot read or publish production listings.
Only frozen synthetic cases can be evaluated once; max 8 initial API calls and a
bounded two-case defect rerun plus one DB-precedence replay (11 calls maximum), with a durable local spend reservation.
The same SQL submit/claim/finish/publication and owner audit are exercised; test DB
is closed/discarded and the remote preview removed afterwards. No CI paid calls.
Real testing is supplemental: schema/timeout/race/RLS/permissions/lifecycle use
repeatable mocks and transactional isolated fixtures.
