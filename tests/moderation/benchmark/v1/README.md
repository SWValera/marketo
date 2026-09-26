# JEVU moderation-benchmark-v1

300 invented listings, IDs BENCH-0001…BENCH-0300; no scraped listings, real people,
contacts, identifiers, user pictures, production records or external image URLs.
Expected labels are **SYNTHETIC_EXPECTED_NOT_HUMAN_REVIEWED**. They are neither human
moderator decisions, legal conclusions nor production ground truth. Kazakh and
mixed-language phrasing, especially ambiguous cases, still benefit from independent
native-language/domain review. Do not report these scores as production accuracy.

## Dataset contract

`cases.jsonl`: title, description, catalog category slug/name, attributes, KZT price,
language, difficulty, fixture references, expected/forbidden/critical finding codes,
expected decision, rationale, tags and required AI/image/OCR flags. The validator
checks the complete strict schema, code vocabulary, contacts/secrets, references,
SHA-256 fixture integrity, unique content/IDs and exact counts:

| Dimension | Counts |
| --- | --- |
| Decision | APPROVE 130; NEEDS_FIX 50; REJECT 60; HUMAN_REVIEW 60 |
| Language | RU 150; KK 90; MIXED_RU_KK 60 |
| Difficulty | EASY 100; MEDIUM 120; HARD 80 |
| Coverage (overlapping) | images 204; OCR 39; obfuscation 40; injection 12; category 27; duplicate 20 |

52 JPEG fixtures are derived from 23 readable vector sources. They depict simple
objects, synthetic text, document/card **mockups**, resize/brightness/compression
variants and intentionally poor images. TEST-ID-123456 is not a real document;
4242… is an explicitly synthetic payment-test pattern. Privacy labels test detector
behavior and handling of possible identifiers, not whether an actual person's data
has been disclosed. Dangerous offers without appropriate synthetic imagery are
text-only. No face/identity matching or real hazardous-object photos are used.

JPEG bytes are pinned; regeneration via `scripts/generate-moderation-benchmark-images.mjs`
only writes a new candidate directory. Re-encoding may vary by platform and is not
a regression assertion. Do not overwrite v1 fixtures. dHash uses the existing
`dhash64-v1` and cutoff 3, unchanged. Brightness variants can exceed that cutoff;
they intentionally remain expected reuse signals so missed similarity is visible.
Similarity is not proof of fraud, and no duplicate case expects rejection.

## Offline validation and selection

Run from the repository root (Node >=22.13):

```sh
npm run moderation:benchmark:validate
node --test tests/moderation-benchmark.test.mjs tests/moderation-benchmark-worker.test.mjs
npm run moderation:benchmark -- --sample first-run-30 --dry-run
npm run moderation:benchmark -- --language KK --difficulty HARD --limit 5 --offset 2
npm run moderation:benchmark -- --expected-decision NEEDS_FIX --limit 10
npm run moderation:benchmark -- --ids BENCH-0001,BENCH-0131
```

Default is dry-run; no OpenAI, Cloudflare or database access. All filters combine,
then offset/limit apply. `first-run-30.json` freezes 13/5/6/6 decision strata,
15/9/6 language strata and 10/12/8 difficulty strata, including every risk feature.
It was selected before paid calls, not based on model responses.

## Explicit paid execution (operator authorization required)

```sh
npm run moderation:benchmark -- --sample first-run-30 --real
# Only after an actual integration defect was fixed/reviewed:
npm run moderation:benchmark -- --ids BENCH-0131 --limit 1 --rerun reviewed-defect-id --real
```

The runner uses an authorized Wrangler session and a short-lived remote **preview**
of the existing Worker name. Cloudflare retains its server secret inside the preview;
no API key is read back, copied locally or logged. A read-only settings check and
preview health check require production external AI OFF, AI enabled OFF, shadow ON,
and an existing OPENAI_API_KEY. The model comes from deployed/local configuration,
which must agree. The preview has no DB/R2/publication/queue operations and accepts
only a baked-in case allowlist and SHA-256-pinned fixture bytes. It rejects forged
case content/results. It is protected by a random operator nonce, expiry and a
per-case one-call guard. Nothing is published or inserted, so there are no DB test
records to clean up. The preview process and temporary nonce/entry are removed on
exit. A crash may leave an ignored directory/lock; inspect reservations before
manual cleanup, never blindly repeat a potentially charged request.

The actual existing `moderate`, `OpenAIModerationProvider`, Responses schema validator,
`moderationDerivatives`, local OCR detectors, dHash and `evaluateShadow` are reused.
Cloudflare Images creates bounded derivatives. Comparison fixture images are hashed
locally in the Worker and are not sent to OpenAI. Measured duplicate observations
feed the existing Shadow evaluator. Final decisions never gain publication rights.
Deterministic existing policy rejection remains independent of shadow observations.
No second moderation policy/engine, schema weakening or database migration is added.

`artifacts/moderation-benchmark/` is already gitignored. Frozen dataset/image/sample
hashes, model, rules hash, commit and safe flags are recorded before payment.
An atomic exclusive local lock and fsynced reservations precede network calls:
30 initial + at most 10 reviewed defect reruns, at most two calls per case, 40 in the
initial campaign and 50/day. Known prior smoke metadata is imported once (5 calls
on 2026-09-26). Reservations are not released after transport failures. No automatic
retries; 429/config/4xx or three consecutive failures stop the batch. A later
campaign requires explicit budget review/authorization; this initial ledger never
automatically resets. The local ledger cannot count unrelated operators or other
OpenAI clients; coordinate those before authorizing another campaign. Production's
separate DB daily limit is unchanged, and external production AI stays OFF.

## Results and metrics

Per-case JSONL is allowlisted: case/label, stable finding codes, shadow recommendation,
latency/usage, status/schema booleans, image count, OCR booleans, duplicate distance,
final safe decision and actual call count. No raw request/response, prompt, OCR,
base64, URL, arbitrary provider explanation or secret is written. OCR text is used
only in memory by existing local detectors; stored evidence is codes/booleans.
Wrangler logs are directed to a /dev/null symlink, and its console is discarded.
If a transport response is lost, actual calls are unknown, but the reserved budget
still counts it. Missing usage stays null and is reported, never estimated.

All reports are **SYNTHETIC BENCHMARK METRICS**:

- Decision exact-match and per-class match include all attempted cases in the
  denominator; invalid schema/provider failure never counts as a matching REVIEW.
- Finding precision/recall use micro counts of stable codes vs synthetic labels.
  Unexpected observations are labeled false positives for this benchmark, but an
  omitted/incomplete expected label can also explain them; inspect case rationales.
- Critical false negatives use AI/AI-derived OCR observations only, not deterministic
  text detections that could hide a semantic miss. Report case IDs and missing codes.
- Forbidden findings and safe-case decision mismatches are shown separately.
- Provider/schema failures, known usage totals, missing usage and average known
  latency are explicit. Billing cost is not invented from token counts.

Labels remain fixed after a real run. Discrepancies become review items; do not
quietly edit expected labels to improve scores. For a genuine labeling correction,
document independent rationale/review and create a new dataset version with new
manifest hashes; retain the old dataset and results for comparisons. New cases
belong in the next version (v1 remains exactly 300). No automated legal-rule update.

Application runtime, rules, UI, lifecycle, promotions and production flags are
outside this benchmark's scope. Shadow ON; auto-approval OFF; AI-only rejection OFF;
external AI for ordinary production traffic OFF throughout evaluation.
