# Moderation AI shadow evaluation (2026-09-26)

Extends 0040; does not replace the deterministic Rule Engine, manual review,
submission, revision hashes, original publication lifetime or promotions.

## Data flow and authority

New immutable revision -> existing deterministic engine + technical image checks
-> R2 bytes -> private Images derivatives -> one Responses request (text, all
indexed images and OCR) -> strict observations -> local OCR detectors/rules ->
sanitized shadow result -> moderator -> comparison with human decision.

The engine uses `jevu-moderation-2`; history from v1 remains immutable. OpenAI
implements the multimodal capability of the server provider abstraction. It
returns observations, never legal/publication decisions. `moderation-ai-observation-v1`
uses stable enums, RU/KK languages, per-image coverage and completeness, typed
confidence, contextual subject and category consistency. Unknown enums, refusal,
truncation, incomplete OCR or wrong indexes fail closed. Prompt instructions are
separate from untrusted listing/image DATA. Do not identify people or infer their
sensitive traits. A future local KZ adapter implements the same capability.

`SHADOW_APPROVE/NEEDS_FIX/REJECT/HUMAN_REVIEW` are **not final decisions**.
AI/OCR-derived evidence is never merged into the original engine's findings.
Existing deterministic text policy rejects remain effective. In this release
APPROVED is always converted to HUMAN_REVIEW both in Worker and DB; the DB has a
`CHECK (NOT auto_approve)` constraint. AI-only REJECTED is also blocked at the DB
completion boundary. Manual approval uses the unchanged publication primitive.
Do not remove these guards to enable a flag; approval rollout is a separate
reviewed release. No shadow field is accepted from browser APIs.

## Runtime configuration / activation

Safe checked-in defaults:

| Binding | Default / activation |
| --- | --- |
| MODERATION_EXTERNAL_AI_ENABLED | false; explicit true enables external calls |
| MODERATION_AI_PROVIDER | unavailable; set openai to activate |
| MODERATION_AI_MODEL | gpt-5.6-luna; server ENV, not business logic |
| MODERATION_AI_SHADOW_MODE | true; false disables external calls, never enables live decisions |
| MODERATION_OCR_PROVIDER | unavailable; set openai_vision_ocr to activate |
| MODERATION_AI_ENABLED_SINCE | required UTC timestamp of activation; do not backdate |
| MODERATION_EXTERNAL_PROCESSING_BASIS | required reviewed processing/authorization reference; not a secret |
| OPENAI_API_KEY | Worker secret only; missing => no calls, safe fallback |
| MODERATION_PERCEPTUAL_HASH_ENABLED | true; independent of external AI |
| MODERATION_AI_ENABLED | false; old approval flag cannot override DB/code guards |

Model supports Responses image input + structured outputs. Server fetch uses
`/v1/responses`, `store:false`, `stream:false`, strict JSON schema, low reasoning,
6000 output tokens. No SDK/dependency/native addon was added. Response size is
bounded to 96 KiB. Network timeout 20s; retry only timeout/network/429/5xx, with
500ms backoff and at most two requests **total per run**, including scheduler
retries. `moderation_shadow_job('reserve',...)` commits an attempt before calling
OpenAI. Crash/lost response consumes that attempt, preventing retry storms.
Request IDs and token usage are saved when supplied, including schema failures.
No dollar prices are hardcoded. Health check is configuration-only, not proof of
remote provider availability; only the explicit real smoke test proves access.

An activation timestamp excludes old queued runs. No historical backfill. For
an explicit test re-run use the existing admin rerun action on a pending listing;
it creates a new generation. The global DB cap is 50 reserved calls per rolling
24h, serialized by advisory lock, adjustable only by a reviewed DB-admin change
of `private.moderation_settings.shadow_daily_call_limit` (0 disables spending).
At limit or after lost attempts the run goes to human review. One run per cron
minute is intentionally conservative. When external AI is enabled, submit's
short request waitUntil does not claim a job: the persistent minute scheduler
processes it with the 180s lease. Up to 25s derivative work + 40s provider time
fits that lease; the existing watchdog handles lost executions. No browser
needs to stay open. Existing pg_cron publication/promotion lifecycle is unchanged.

## Images / OCR / hashes

Sources remain private R2 references. Trusted server checks magic, metadata and
original SHA-256. Cloudflare Images creates transient JPEGs: <=1280x1280, fit
scale-down, quality75, metadata stripped, <=512KiB each, max7. Oversized outputs
fail to review instead of uploading originals. Each image has its original
revision index; all images and text share one multimodal call, detail=high. No
public/signed URLs, Files API uploads, persistent base64 or repeated browser
uploads. Existing 768x576 public previews and original files remain unchanged.

OCR is **OpenAI Vision OCR**, not PaddleOCR or a local OCR engine. Raw visible
text is used in memory by the existing normalizer, policy rules and PII detectors.
Only generic codes/actions/confidence/index/rule are retained. We discard even
model reason sentences rather than risk retaining an unrecognized person's name.
Raw OCR, prompts and responses are never saved to logs or DB. Model output cannot
alter instructions/schema. Full image pixels can contain PII; redacting text
input does not anonymize images. External activation needs explicit processing
basis/consent and provider retention/region review. `store:false` controls
Responses storage; it is not a claim of zero provider-side retention.

Hash algorithm `dhash64-v1`: Images squeeze to9x8 PNG on white; bounded pure-Web
PNG decoder (CRC, filters, grayscale/RGB/palette/alpha, 1/2/4/8/16-bit where valid,
no interlace); integer-rounded BT.601 luminance; left>right, row-major 64bits.
DecompressionStream and BigInt run in workerd; no Sharp in production. SHA-256
identifies exact source bytes. Four indexed 16bit bands generate candidates for
Hamming distance<=3; at most200 candidates/band and200 exact matches. Candidate
sampling is intentionally bounded: no match is not evidence of no reuse.
Hash similarity tolerates mild resize/brightness; strong crop is unsupported.
Low-information images can collide. Same store/product photos are legitimate:
`duplicate_or_reused_image` is only a review/fraud signal, never proof or block.
Version the algorithm if preprocessing, transform or comparison changes.

## Persistence / privacy / security

0041 adds no tables. `moderation_runs.shadow_result` and `ai_calls` are internal;
image hashes gain `perceptual_hash`/`algorithm` plus four indexes. Existing RLS and
ACLs deny direct access including service-role table access. Only service RPCs
reserve/record/finish. User status RPC returns its old safe projection; even
`staff_view=true` does not elevate an ordinary user. Staff audit clearly separates
AI SHADOW RESULT from FINAL DECISION. DB projects safe fields again, never raw
response or arbitrary provider prose. Staff history retains prior automated
results; overrides remain separate with actor/reason/time.

Only title, description, category path, relevant attributes and derivative pixels
are sent. Local redaction masks phone/email/long numeric IDs in text. No seller
ID, email field, auth/session tokens, IP, account history, internal credentials,
promotions or payment information is added. API key exists only in Authorization
header to fixed HTTPS endpoint; manual redirect mode rejects redirects. Logs
contain event/status/codes/duration, not content, keys or HTTP error bodies.
Existing revision snapshots retain the 30-day purge; raw OCR/provider response is
never persisted at all. Aggregated call metrics contain no content or identity.

Admin metrics (30d) include calls/success/error classes/latency/tokens/images,
OCR images, reuse signals, shadow counts, evaluated human comparisons, agreement,
disagreement and confusion-matrix counts. Only the latest explicit human action
on the **same run/revision** is ground truth; automatic rejects are not labels.
No precision/recall is displayed without an adequately reviewed dataset. Review
historical labeled fixtures and false-positive/negative costs before approval.

## Validation and controlled release

Mocked synthetic phone/car/furniture/toy/weapon illustrations and a clearly
synthetic `TEST CARD 4242 4242 4242 4242` are generated locally in tests. No real
personal documents or production listings. Mocks prove contracts/pipeline, not
model accuracy. Workerd tests exercise real native fetch/AbortController/R2/PNG
inflation with mocked Images transformations and network (no live paid calls).

Run targeted AI/engine/DB/security/lifecycle tests, typecheck, lint, production
build, built Worker tests, dry-run and diff checks. Apply reviewed0041 before
shipping the Worker; previous Worker completion remains compatible and safe.
See operations0041 pre/postflight for ACL/queue/lifecycle fingerprints.

Optional paid smoke (operator terminal with secret injected securely, never a
command-line literal): set `JEVU_RUN_PAID_AI_SMOKE=true`, `MODERATION_AI_MODEL`,
`OPENAI_API_KEY`, then `node scripts/smoke-moderation-openai.mjs`. Exactly three
synthetic calls, no retries, records only sanitized metadata/codes to ignored
artifacts. It must never be invoked by build/CI. Inspect semantic quality manually;
API/schema success alone is not an accuracy score. Missing key => NOT RUN.

Rollback: set external AI flag=false; optionally disable perceptual hashing.
Keep0041, history and approval-off constraint. Deploy the previous Worker if
needed (completion wrapper remains compatible); do not drop/rewind0040/0041 or
republish listings. Resume with a fresh activation timestamp and explicit test
runs. AI/SMS credentials, legal/privacy review and measured labeled evaluation
remain external gates before any later auto-approval rollout.

Official integration references reviewed 2026-09-26:
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.cloudflare.com/images/optimization/binding/
