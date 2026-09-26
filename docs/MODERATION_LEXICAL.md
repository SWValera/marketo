# Deterministic lexical moderation v1

`jevu-lexical-1` extends the existing server Rule Engine. Ruleset
`kz-policy-2026-09-26.2` copies `.1` policy/legal metadata and adds `config.lexical`.
No migration, new legal prohibition, UI change or publication primitive is added.
Automatic approval and AI-only rejection stay disabled; external production AI
stays off. Offline development and release require **zero real OpenAI calls**.

## Data and decision contract

The canonical authoring source is `lib/moderation/rulesets/lexical-v1.ts`.
It supplies release tools and offline fixtures, not a second live rule store.
Production compiles only the private, versioned rule snapshot claimed with a job.
There are 95 patterns across the 13 existing families: 14 hard, 40 suspicious and
41 contextual exceptions. The 11 prohibited JEVU_POLICY families cover vape,
tobacco, nicotine, weapons, ammunition, explosives, drugs, illegal precursor
intent, forged documents, stolen payment data and illegal services. The existing
adult-content and regulated-goods families remain review-only. LAW/REGULATION
claims are not expanded; `regulated` remains LEGAL_REVIEW_REQUIRED.

Each config has a schema version, ruleset version, stable family code and bounded
patterns with stable codes, level, language applicability and matcher config.
Severity, action, enabled state, category scope, legal status and bilingual reasons
belong to the enclosing rule. All v1 patterns support RU/KK/mixed/Latin input;
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
an exception or simple negation becomes review. Education/toy/accessory context
can resolve a suspicious occurrence; prop, souvenir or collectible wording is a
review modifier, never an unconditional pass. Negated exceptions cannot exempt
an offer. This is intentionally conservative lexical analysis, not full NLP.

Precedence: any confirmed offer → DETERMINISTIC_REJECT; unresolved/conflicting
candidate → SEND_TO_AI when available, otherwise HUMAN_REVIEW; only resolved
contexts or no candidates → NO_TEXT_RISK. The structured result contains a
normalized text SHA-256, rule/pattern codes, risk, reasons and routing, without
raw excerpts. The existing text stage stores lexical version, hash and routing;
findings store policy codes/reasons and the run retains its immutable ruleset.
Client-supplied matches or approval flags are ignored.

**NO_TEXT_RISK is not APPROVED.** Missing mandatory providers remain incomplete.
A confirmed local rejection skips semantic AI. Clean text with photographs still
requires the existing Vision/OCR pipeline. No model/prompt, image decoder,
derivative, dHash threshold or publication/promotion lifecycle is changed.

## Test and review before activation

1. Add a phrase to the canonical config, including real RU/KK usage and reasonable
   transliteration. Prefer suspicious classification when intent is uncertain.
2. For a hard pattern, require an unambiguous item/offer combination and a bounded
   window. Add adjacent safe contexts, unrelated-clause and negation tests.
3. Run `node --test tests/moderation-lexical.test.mjs` and
   `npm run moderation:benchmark:offline`. This runner disables network access and
   processes the unchanged 300 synthetic cases; never use the paid batch runner
   for a lexical change. Add targeted fixtures outside benchmark v1 instead of
   editing its expected labels. Run DB/RLS and workerd tests for integration changes.
4. Review false hard rejects and code-level misses, including language/difficulty
   strata. Inspect the full ignored `artifacts/moderation-lexical-v1` report.
5. Clone a draft version, edit, review and activate through the existing admin
   workflow with an actor and reason. Never mutate the released active version.

This initial release also provides a controlled DB-operator SQL generator:
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
operator. It reactivates `.1`, retaining `.2`, all audit entries and moderation
history. No listing records are rewritten or backfilled. Existing stale-version
checks prevent a queued old snapshot from applying after activation/rollback.
Do not roll the Worker back before restoring compatible rules.

## Offline v1 measurement and limitations

With AI unavailable: 36 deterministic rejects, 41 human reviews, 223 NO_TEXT_RISK,
zero SEND_TO_AI; with a usable configured provider those 41 routes become SEND_TO_AI.
36/60 expected REJECT cases are hard-caught. False hard rejects: 0/300. Strict
suspicious-finding recall: 60/69 (86.96%); this is not final moderation accuracy.
Eight of 17 safe-context cases need extra review, none are rejected. All 40
obfuscation cases raise a candidate; 32 explicitly carry the obfuscation marker.

Six cases miss an exact critical code: 0210/0228/0240 hide the critical evidence
in images, which this layer cannot inspect; 0189/0221 are hard-caught as stolen
payment data and 0227 as drugs, differing from benchmark finding taxonomy.
Labels remain untouched. Books 0059/0100/0128 avoid rejection; document prop 0269
still requires review. dHash case 0258 is a separate future calibration issue.

Up to 259/300 cases avoid a separate text-semantic request; 204 non-rejected
image cases still need Vision/OCR for any future approval. This is a technical
routing estimate, not actual paid-call or money savings. The current adapter
combines text/images in one call, so image-bearing cases still use that call.
Future work includes colloquial/implicit offers, bounded contextual exceptions,
KK inflections/transliteration and finding taxonomy alignment. Expand from reviewed
errors, not thousands of guessed words. Never turn a low lexical risk into approval.
