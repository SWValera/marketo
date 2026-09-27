# Moderation correctness: engine 4 / observation v2

This release keeps the active ruleset, model, feature flags, roles and publication
lifecycle. It changes OCR semantics and how the current operational state is read.

## OCR contract

`moderation-ai-observation-v2` is both the Responses structured output schema and
the local strict validator. Every image has exactly one vision subject and OCR
entry, with the original zero-based image index. Empty text is allowed.

| OCR state | Meaning | Decision contribution |
|---|---|---|
| NO_TEXT_DETECTED | Image inspected; no text requiring analysis | Successful check |
| TEXT_READ | Visible text extracted | Local rules and privacy detection |
| PARTIAL_TEXT, relevance none | Harmless partial branding, decoration or device UI | Does not itself block approval |
| PARTIAL_TEXT, relevance possible_risk | Potentially relevant unreadable content | Human review |
| TECHNICAL_FAILURE | Image/OCR could not be checked | Bounded retry, then technical hold |

The primary physical item determines category consistency. Content on a screen
remains subject to prohibited-content and privacy checks. There is no product,
title or listing-ID whitelist. Ordinary app labels, game nicknames, public URLs
and weather/date text alone are not high-risk personal identifiers; actual
private contact/account data, documents and payment data remain checked. A
possible identifier observation remains in the trace. It becomes actionable only
with corroborating OCR/local privacy, document/payment or risky unreadable context;
there is no server-side screen or product whitelist. Other observations and all
normal approval completeness requirements
remain; a technical failure cannot become approval or rejection.

Only safe OCR state/relevance/index are retained in the automatic trace. Raw OCR,
prompts, Responses payloads, image data and URLs are not persisted. History using
v1 remains readable. Engine 4 requires a successful v2 provider ledger entry and
complete per-image OCR evidence at the database publication boundary.

## Explicit lexical follow-up

Local review candidates are passed to the same multimodal request as a bounded
server-selected checklist of stable observation codes. Each requires exactly one
explicit text observation, including a negative when absent. Missing/duplicate
answers fail validation; image-only negatives cannot clear a text candidate.
The existing 0.98 confirmation threshold, local hard blocks and independent
privacy/OCR checks remain. No rule, product whitelist or confidence override is
introduced.

## Canonical current status

Migration `0044_moderation_correctness.sql` adds the private derived
`listing_moderation_state` table (current and published revision hashes) and
`moderation_runs_current_revision` index. Content/image/attribute writes refresh
the current pointer; first/current publication records the published pointer.
Promotion-only writes do not change it. Reference-catalog migrations that change
labels included in `moderation_content` must refresh affected derived pointers
using `private.refresh_moderation_revision` within the same controlled migration.
The final approval boundary still recomputes the full content hash independently.

`private.moderation_effective` is the canonical classifier for dashboard rows,
all filter counts, current detail, owner summaries and mutation receipts.
Current compatible manual decisions supersede automatic history. Stale/other
revision results and archived queued history cannot be active review jobs.
Published legacy listings without a run are published, not pending. When a
previous revision is public and a different current revision awaits review, a
single explicit dual-state label explains both states.

Owner reads are bounded to 50 requested owned IDs. Staff reads require an active
moderator/admin role inside each security-definer RPC. Private tables/views have
no client grants; owner summaries omit provider traces, risk data and other-owner
records. Manual action audit/history and revision checks are preserved.

## Processing and retry

Submission and explicit re-run only persist the immutable revision/job and return.
The existing minute cron picks up the queue; HTTP `waitUntil` does not run image,
AI or moderation work. The runtime is imported only by the scheduled handler.
Users may see “Проверяем объявление” until the next pass. Public/profile/admin
reads never run the pipeline. Claims, retries and final publication remain in
the same trusted, revision-checked persistent queue.

Explicit resubmission of a completed technical/partial-risk hold at the same
revision creates another generation. Queued jobs and compatible definitive
results remain idempotent. Compatible approval reuse calls the existing
publication function, preserves original dates and cannot supersede a later
manual override. Provider budgets remain two attempts/run and the configured
global daily cap. No backfill is started by this migration.

## Read performance and invalidation

The admin read API makes one staff-guarded RPC on a successful read. The dashboard
classifies once and aggregates all counts from the same predicates; list payloads
exclude traces/history. Detail core loads independently of collapsed audit.
The client keeps a bounded eight-entry, 45-second cache, preserves the application
document and invalidates scoped moderation data after writes. A visible-page
15-second refresh/focus/BroadcastChannel notification observes async changes.

Profile initial summaries use one batch request alongside images/feedback.
Subsequent batch polling refreshes the page only when an effective state or run
actually changes, and is cancelled on unmount. There is no per-row polling loop
on profile cards and no global cache purge.

The CPU profile of the compiled workerd artifact identified per-card ICU number
and date formatter initialization in public/detail and owner reads. A fixed RU/KK
formatter set now preserves the exact labels and Almaty timezone without creating
formatters for every row. It contains no account data or request cache. Queue
loading is split out of the HTTP entry; this does not raise Cloudflare plan limits.
Verify ordinary authenticated reads and production CPU outcomes after deployment:
a single HTTP 200 or an idle cron is not evidence of sufficient CPU headroom.

## Release and rollback

Apply 0044 before deploying engine 4. It accepts in-flight engine 3/v1 completions
as well as engine 4/v2, without rewriting old evidence. Verify canonical states,
permissions, queue filters/counts, unchanged publication/promotion dates and the
active Worker version after release. Migration changes no production AI flags.

If rollback is needed, switch automatic processing to the existing manual
fallback using its controlled settings workflow; retain all runs, findings,
overrides and the additive metadata. A full engine rollback also requires a
reviewed forward migration restoring the engine generation selected by enqueue;
do not delete 0044 tables or edit an already applied migration. Rolling back only
the frontend does not require deleting history.

Evidence for this task is in ignored `artifacts/moderation-correctness/`.
Synthetic browser timing measurements explicitly identify compiled Worker,
simulated upstream latency and Chromium emulation; they are not measurements of
physical iPhone Safari. Real external-provider checks require the specifically
authorized images and produce only sanitized metrics/evidence.
