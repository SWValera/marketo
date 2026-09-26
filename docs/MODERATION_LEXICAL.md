# Deterministic lexical moderation v2

`jevu-lexical-2` extends the existing server Rule Engine. Ruleset
`kz-policy-2026-09-26.3` copies `.2` policy/legal metadata and updates `config.lexical`.
No migration, new legal prohibition, UI change or publication primitive is added.
Automatic approval and AI-only rejection stay disabled; external production AI
stays off. Offline development and release require **zero real OpenAI calls**.

## Data and decision contract

The canonical authoring source is `lib/moderation/rulesets/lexical-v2.ts`, an
immutable successor built from the frozen `lexical-v1.ts` configuration.
It supplies release tools and offline fixtures, not a second live rule store.
Production compiles only the private, versioned rule snapshot claimed with a job.
There are 101 patterns across the 13 existing families: 14 hard, 41 suspicious and
46 contextual exceptions (95 before; six added, two modified, none removed).
The 11 prohibited JEVU_POLICY families cover vape,
tobacco, nicotine, weapons, ammunition, explosives, drugs, illegal precursor
intent, forged documents, stolen payment data and illegal services. The existing
adult-content and regulated-goods families remain review-only. LAW/REGULATION
claims are not expanded; `regulated` remains LEGAL_REVIEW_REQUIRED.

Each config has a schema version, ruleset version, stable family code and bounded
patterns with stable codes, level, language applicability and matcher config.
Severity, action, enabled state, category scope, legal status and bilingual reasons
belong to the enclosing rule. All patterns support RU/KK/mixed/Latin input;
language applicability describes coverage, not a client-locale bypass.

The eight supported matchers are:

| Matcher | Contract |
| --- | --- |
| exact_phrase | Contiguous tokens within one clause; may be a hard combination |
| token_combination | Every alternative group must occur within the configured window |
| proximity_match | Item/intent groups, bounded by `max_distance` (at most 12 tokens) |
| regex_safe | One bounded token; anchored literals/classes only, suspicious only |
| normalized_keyword | Whole token/phrase or explicit bounded stem, suspicious only |
| transliteration_match | Candidate plus a Latin-transliteration signal |
| obfuscated_match | Candidate plus split-letter, mixed-script or leetspeak evidence |
| context_exception | Nearby education/toy/accessory/prop/negation context |

Combinations never join different clauses, sentences or content fields. Terms
ending in `*` are explicit stems of at least four letters. Regexes cannot contain
quantifiers, backreferences, lookarounds or alternation. Configs reject unknown
family codes, unsupported fields and mismatched versions. Admin edits validate
the same schema server-side; claim parsing rejects malformed stored configs.

Text is normalized once: NFKC, lowercase, invisibles, bounded letter spacing and
separators, common mixed-script lookalikes, some leetspeak and RU/KK transliteration.
Kazakh Cyrillic forms are authored directly, including `сатылады`, `сатамын`,
`ұсынамын`, `көтерме`, `темекі`, `қару`, `жалған құжат` and `ұрланған карта`.
Folding is a candidate representation, never a replacement of the seller's text.
The compiled exact/prefix index is built once per immutable job snapshot; there
are no DB queries per word. Text and occurrence limits fail closed to job retry /
human review instead of silently truncating a potentially important match.

## Context and precedence

Only an enabled versioned JEVU_POLICY with REJECTED action, a high-confidence
combination and no local conflict can yield DETERMINISTIC_REJECT. A single word
such as `ствол`, `трава`, `документ` or `патрон` cannot hard-block.

Exceptions are bounded to the relevant occurrence and clause. A book/toy word
elsewhere cannot cancel a separate confirmed offer. A hard match conflicting with
an exception or simple negation becomes review. New `anchor_scope: contains`
exceptions must contain the candidate occurrence; they cannot exempt a nearby
different mention. An explicit non-offer phrase can resolve a hard match only
when that phrase contains **all** item and intent parts (e.g. the full negated
nicotine offer in BENCH-0062). Education/toy/accessory context
can resolve a suspicious occurrence; prop, souvenir or collectible wording is a
review modifier, never an unconditional pass. Negated exceptions cannot exempt
an offer. This is intentionally conservative lexical analysis, not full NLP.

Precedence: any confirmed offer → DETERMINISTIC_REJECT; a realistic document
imitation explicitly meant to be used as authentic → direct HUMAN_REVIEW;
unresolved/conflicting candidate → SEND_TO_AI; only resolved contexts or no
candidates → NO_TEXT_RISK. Direct review requires accountable human assessment
and is independent of AI configuration. It skips automatic semantic dispatch.
Vape-liquid hard matching now requires offer intent. Illegal-precursor matching
requires material + illegal-purpose + offer; a drug mention within that purpose
does not imply a separate drug offer. Separate drug offers retain their finding.

### Logical route, execution and audit

`lexical_routing_decision` never depends on provider availability. Execution is
resolved separately and updated after an actual shadow attempt:

| Lexical route | AI state | execution_decision | fallback_reason |
| --- | --- | --- | --- |
| DETERMINISTIC_REJECT | any | REJECT | null |
| HUMAN_REVIEW | any | HUMAN_REVIEW | null |
| NO_TEXT_RISK | any | CONTINUE_PIPELINE | null |
| SEND_TO_AI | ready/success | CONTINUE_PIPELINE | null |
| SEND_TO_AI | external flag off | HUMAN_REVIEW | AI_DISABLED |
| SEND_TO_AI | missing config/key, ineligible run, missing image or budget | HUMAN_REVIEW | AI_UNAVAILABLE |
| SEND_TO_AI | actual timeout/network/429/5xx/schema error | HUMAN_REVIEW | AI_PROVIDER_ERROR |

`CONTINUE_PIPELINE` is dispatch, never a publication decision. Disabled providers
do not manufacture provider-error metrics. The structured server result includes
both decisions, fallback, normalized text SHA-256, matched rule/hard/suspicious/
exception codes, canonical families, risk, reasons, ruleset and engine versions.
It contains no raw excerpts. Client-supplied matches or routing are ignored.

No migration is needed: the existing private stage metadata persists the route
in `text.provider = lexical_route/<route>` and engine/hash in `text.version`.
`rules.provider = lexical_execution`; `rules.version` holds bounded JSON with
named `execution_decision` and `fallback_reason` fields. Both fit the existing
100-character limits. `readLexicalAudit()` decodes these fields; stage count and
PASS/UNAVAILABLE checks are unchanged (seven photos already need all 27 slots).
The run retains its immutable revision and rules snapshot. Source rule IDs/codes
remain the finding keys required by the existing SQL hard-reject authorization.
Canonical family lives in that snapshot's `config.lexical.canonical_finding_family`
and in structured server events; history is not rewritten.

`finding-taxonomy.ts` maps source codes to 13 stable families: possible_vape,
possible_tobacco, possible_nicotine_product, possible_weapon, possible_ammunition,
possible_explosive, possible_drug, possible_precursor, possible_fake_document,
possible_payment_data, possible_illegal_service, possible_regulated_item and
possible_adult_content. RU, KK and obfuscated matchers share the same family.

**NO_TEXT_RISK is not APPROVED.** Missing mandatory providers remain incomplete.
A confirmed local rejection skips semantic AI. Clean text with photographs still
requires the existing Vision/OCR pipeline. No model/prompt, image decoder,
derivative, dHash threshold or publication/promotion lifecycle is changed.

## Test and review before activation

1. Add a phrase to the canonical config, including real RU/KK usage and reasonable
   transliteration. Prefer suspicious classification when intent is uncertain.
2. For a hard pattern, require an unambiguous item/offer combination and a bounded
   window. Add adjacent safe contexts, unrelated-clause and negation tests.
3. Run `node --test tests/moderation-lexical.test.mjs tests/moderation-lexical-routing.test.mjs` and
   `npm run moderation:benchmark:offline`. This runner disables network access and
   processes the unchanged 300 synthetic cases; never use the paid batch runner
   for a lexical change. Add targeted fixtures outside benchmark v1 instead of
   editing its expected labels. The guard blocks fetch/HTTP/HTTPS and fails even
   if the real adapter catches the blocked transport exception. Workerd tests use
   explicit mocked transport with all unmatched external traffic disabled.
   Run DB/RLS and workerd tests for integration changes.
4. Review false hard rejects and code-level misses, including language/difficulty
   strata. Inspect the full ignored `artifacts/moderation-lexical-v2` report.
5. Clone a draft version, edit, review and activate through the existing admin
   workflow with an actor and reason. Never mutate the released active version.

The release provides a controlled DB-operator SQL generator:
`npm run moderation:lexical:release -- prepare <commit-reference>`, then `activate`
with the same reference. It only renders ignored SQL; it never connects remotely.
Apply it to the verified project with an authorized database operator after tests.
Deploy the compatible Worker **before activation**. Preparation copies the exact
base policy metadata into a draft, verifies it and records technical review;
activation retires the base and activates the reviewed version atomically.
Unexpected base/config/metadata or enabled auto-approval abort the transaction.
Audit entries explicitly identify the DB-operator execution, release reference
and technical scope; they do not impersonate a JEVU human/legal reviewer.

Rollback: render `rollback <commit-reference>` and execute it as the same authorized
operator. It reactivates `.2`, retaining `.3`, all audit entries and moderation
history. No listing records are rewritten or backfilled. Existing stale-version
checks prevent a queued old snapshot from applying after activation/rollback.
Do not roll the Worker back before restoring compatible rules.

## Offline v2 measurement and limitations

All 300 original synthetic cases and expected labels remain unchanged; review
scope in `tests/moderation/lexical-review-v2.mjs` is pinned to their SHA-256.
Real OpenAI calls: **0**. Routes are 36 DETERMINISTIC_REJECT, 31 SEND_TO_AI,
3 direct HUMAN_REVIEW, 230 NO_TEXT_RISK. AI-OFF execution is 36 REJECT,
34 HUMAN_REVIEW, 230 CONTINUE_PIPELINE; fallback AI_DISABLED: 31, null: 269,
AI_UNAVAILABLE/AI_PROVIDER_ERROR: 0. These are not final moderation decisions.

36/60 expected REJECT cases are hard-caught. False hard rejects: 0/300.
Safe-context false reviews: 0/17 (previously 8/17); false hard rejects there: 0.
Canonical suspicious-family recall is 61/66 (92.42%), excluding three reviewed
image-only cases. Exact expected family sets match in 60/66 eligible cases.
The previous 60/69 recall used a different denominator; do not present the change
as an equivalent quality comparison. All 40 obfuscation cases raise a candidate;
32 explicitly carry the obfuscation marker. This is not final moderation accuracy.

| Stratum | Cases | REJECT route | SEND_TO_AI | Direct review | NO_TEXT_RISK |
| --- | ---: | ---: | ---: | ---: | ---: |
| RU | 150 | 20 | 16 | 1 | 113 |
| KK | 90 | 14 | 5 | 1 | 70 |
| MIXED | 60 | 2 | 10 | 1 | 47 |
| EASY | 100 | 10 | 0 | 0 | 90 |
| MEDIUM | 120 | 22 | 15 | 0 | 83 |
| HARD | 80 | 4 | 16 | 3 | 57 |

BENCH-0210/0228/0240 are `TEXT_LAYER_NOT_APPLICABLE` for critical evidence and
excluded from lexical critical false negatives. The two remaining critical-code
mismatches, 0189/0221, are rejected as `possible_payment_data`, while the benchmark
expects `possible_illegal_service`: taxonomy mismatches, not missed rejection.
0227 now resolves to `possible_precursor`; the drug term describes its illegal
purpose. Reviewed lexical critical false negatives: 0, **not** a claim of zero
overall moderation misses. Other exact-family differences remain at
0212/0263/0280/0293; labels were not adjusted to improve scores.

### Eight reviewed safe contexts

All eight are local false positives rather than label ambiguity. The table lists
the previous suspicious match and why existing exceptions did not resolve it.
New literal exceptions contain the actual occurrence. Each now gives
NO_TEXT_RISK; tests append a separate prohibited offer and preserve its rejection.

| BENCH | Previous matcher | Missing context / correction |
| --- | --- | --- |
| 0060 | weapon_candidate, ammunition_candidate | water-toy title; explicit no-ammunition phrase → weapon/ammunition_literal_context |
| 0061 | weapon_candidate | caulking tool and not-a-weapon → weapon_literal_context |
| 0062 | vape_candidate, vape_latin, nicotine_candidate; nicotine_offer | magazine topic + fully negated nicotine offer; old nicotine_negation only requested review → vape/nicotine_literal_context |
| 0065 | weapon_candidate | historical reference title; education term in a separate clause could not exempt it → weapon_literal_context |
| 0101 | weapon_candidate | Kazakh not-a-weapon phrase → weapon_literal_context |
| 0102 | weapon_candidate | Kazakh historical-work title + inflected negated sale; old weapon_negation only requested review → weapon_literal_context |
| 0104 | vape_candidate, tobacco_candidate | Kazakh article collection and not-a-tobacco-product → vape/tobacco_literal_context |
| 0130 | weapon_candidate | Russian caulking-tool title + Kazakh not-a-weapon → weapon_literal_context |

Books 0059/0100/0128 give NO_TEXT_RISK. Document-prop 0269 gives direct
HUMAN_REVIEW because the text describes authentic-looking use; `prop` alone
never provides a pass. dHash case 0258 remains a separate calibration task.

Text-semantic dispatch is required for 31 cases and not required for 269.
204 non-rejected image cases still require **both** Vision and OCR for any future
approval. Of those, 39 benchmark cases specifically exercise OCR (`requires_ocr`);
that label does not waive OCR for the others. Direct-human cases retain these
requirements but defer content assessment to the human, without an automatic AI
call. This is a routing estimate, not measured paid-call or cost savings: the
adapter combines text/images in one request.

A long synthetic description (~17K characters) with a late suspicious term takes
about 2 ms on the development Mac; the sanity test uses a generous 1-second bound.
Normalization is one pass per evaluation and compilation is per immutable
snapshot, never per token. This is not a production latency SLA. Remaining work:
implicit commercial intent, KK inflections/transliteration, reviewed family gaps
and independent image/OCR quality evaluation. Never turn a low lexical risk into
approval. No paid second batch is part of this release.
