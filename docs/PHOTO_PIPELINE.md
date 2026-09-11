# Photo pipeline: implementation prepared, release BLOCKED (2026-09-09)

Baseline: stage3-staging, 0e4a8014ab3bd1a4fa1ad1eccfbfe92f6d1dfd62, initially clean.
This document is NOT a production-readiness certificate. Do not deploy this
worktree without the staging configuration and provider/browser verification
below. No production database, account, migration, R2 object or infrastructure
was changed during the implementation.

## Confirmed old failures

- Newly reproduced on the exact published JEVU artifact: vinext 0.0.50 parses
  multipart API uploads as progressive Server Actions before route dispatch.
  Two 600 KiB files hit its unrelated 1 MiB limit (413); two 128 KiB files reach
  the application's authentication check (401). Both requests are local workerd
  tests with no network, account or storage writes. `multipartRouteGuard` now
  bypasses that parser only for the matched listing-photo API, preserving its
  own CSRF/auth/body checks and the framework limit for all other routes/pages.
- publish-form rejected originals above 12 MiB before attempting normalization.
- The browser decoded the full source before checking its 50 MP limit. Resizing
  afterwards cannot prevent the initial RGBA allocation (108 MP = 432 MB).
- HEIC/HEIF were present in a form allowlist but absent from the file input.
  The previous HEIC test injected a fake decoder; it did not establish HEIC support.
- A failure discarded every successful photo in the current selection batch.
- Multipart upload could retain about 60 MiB of prepared files per request.
- Direct API callers were treated as if a trusted browser encoder had validated
  their JPEG pixels. A client is not a security boundary. The new storage path
  obtains a server-decoded, re-encoded result before creating an R2 object.

Old source fails the same photo-client-contract tests that the revised source
passes (photo-baseline.log versus photo-client-after.log).

## Implemented flow

File selection -> sequential authenticated POST /api/photos/normalize ->
bounded original read -> magic/MIME agreement -> Images info / resource limits
-> Images resize (scale-down, no crop), orientation, JPEG encoding -> bounded
output framing validation and removal of every APP/COM block -> JPEG response
(no-store) -> bounded 640px local thumbnail -> sequential owner upload API ->
server normalization again (never trust a client assertion) -> R2 -> metadata
insert -> existing authorized media route.

Originals are never assigned to Image/canvas/object-URL previews, saved in R2,
logged, or inserted into the database. The UI retains the normalized files and
small thumbnail URLs. Work is sequential; one bad source does not roll back
successful selections. One successfully stored photo is removed from the retry
list before the next is uploaded. The old multi-file API is still accepted for
small batches, with a new 4 MiB + 512 KiB multipart ceiling.

The per-isolate processing guard is fail-fast, not a distributed rate limiter.
It remains occupied until an unabortable Images RPC actually settles, even if
the HTTP operation times out. The read/processing budget is 90 seconds, not the
page-navigation budget. Supported body reads and browser requests are cancelled;
the binding does not expose per-call AbortSignal for an already-running RPC.

Every partial API failure preserves the existing cleanup order: delete newly
created metadata first, then corresponding objects. If metadata cleanup fails,
keep the referenced objects and report the failure. Never delete another upload's
object or change ownership/RLS. Network loss after a successful metadata commit
still requires draft-state reconciliation; exactly-once uploads under arbitrary
connection loss are not certified by this change.

## Format and resource decisions

- Maximum number of new photos is **7**, including existing images (user correction, 2026-09-09). Previously saved photos are not deleted; adding is blocked if existing photos already fill the limit.
- Input contract: JPEG, PNG, WebP, HEIC/HEIF; actual HEIC decoding by the live
  Cloudflare service remains BLOCKED. A file's extension is not proof of format.
- Images binding input: at most 20,000,000 compressed bytes; 100,000,000 pixels;
  maximum side 12,000 pixels. These are conservative documented provider limits,
  not a promise to accept every codec/profile within those bounds.
- 12/24/48/50 MP and 100 MP JPEG fixtures exercised a real local codec.
- 108 MP and 200 MP are **not supported by this selected provider path**. They
  fail before full decode with an honest platform-limit message. Supporting them
  requires another trusted high-resolution server decoder or an agreed provider
  limit change, not removing the phone/Worker memory checks.
- Output: sRGB-compatible JPEG, longest side <=2560, no crop, original aspect,
  white background for transparency, qualities 82/72/62 only if needed to fit
  <=4 MiB. Validate baseline/progressive JPEG framing, dimensions, final EOI and
  no trailing payload; pixel decoding is provided by the trusted Images codec.
- JPEG keeps the existing storage/delivery contract and broad modern browser
  compatibility. WebP may compress better but would require a new trusted output
  validation/storage contract. AVIF has higher encoding cost and input restrictions.
  This is not a measured subjective image-quality comparison.
- Output APP/COM removal strips EXIF/GPS/XMP/IPTC/comments/ICC. Cloudflare documents
  applying input color profiles and EXIF rotation before discarding metadata.
- Previews are <=640px and decoded sequentially only after checking the bounded
  JPEG. Seven full-size 2560px images are not retained as preview images. This is
  a resource design and unit-test result for newly selected photos, NOT measured
  iPhone memory usage. Previously saved images still use the existing protected
  media delivery; the entire editor's decoded-memory peak is not certified.

Normalization currently occurs twice (preparation and storage), deliberately
preserving a real server security boundary without adding another signing-secret
or temporary-original store. Provider usage/billing must be checked before release;
no paid plan was purchased or enabled.

## Configuration and release gate

1. Updated read-only check: Worker settings return 200, with **no Images binding**.
   Images stats and subscriptions return 403 / code 10000, so the account plan
   and entitlement are not established. No plan was purchased or enabled.
2. Important: **marketo-staging now serves the LIVE jevu.kz domain**. Its name
   does not make it a safe sandbox. Connecting Images there needs explicit
   approval and provider verification first; do not change live configuration
   on the basis of the former staging authorization.
   Set build environment MARKETO_IMAGE_PROCESSING=cloudflare. Vite then emits
   images.binding=MARKETO_IMAGES; the artifact validator checks that exact name.
   This is a build setting, not NEXT_PUBLIC data. Without it, the verified build
   fails before changing the output, protecting against accidental publication of
   unavailable uploads. The runtime also returns photo_processing_unavailable if
   its binding is missing; there is no unsafe original-file fallback. Test runners
   explicitly set the flag only for their local synthetic build, without deploying.
3. Keep MARKETO_MEDIA and its existing actual bucket unchanged. No database schema,
   token, guessed resource name, new bucket, or temporary public-origin URL is needed.
4. Verify real provider JPEG/PNG/WebP/HEIC/HEIF, EXIF 1-8, color profiles, quotas,
   rejection limits and timeout behavior. Miniflare Images is a low-fidelity mock
   that ignores fit/EXIF/quality options; it cannot certify these results.
5. Install/enable the user-requested Browser Use with full CDP. The plugin
   inspection explicitly returned not_installed. No search/install tool for it
   is exposed here; the available CUA entry point fails at startup with Windows
   sandbox apply deny-read ACLs. No alternative raw-CDP bypass was attempted.
6. Run all requested browser checks before considering a release: file selection,
   preview, upload, SW, manifest, Cache Storage, Network, Console, Performance,
   offline/online, navigation, background/foreground and repeated transitions.
   Status for those checks is BLOCKED, not PASS and not an HTTP-test substitute.
   REAL iOS PWA is separately NOT VERIFIED (no physical iPhone connection).
7. Re-run final tests/build, create a fresh filtered review ZIP, then commit and
   push ONLY stage3-staging once the release gate is satisfied. main and
   stage3-canonical, force push and new branches are out of scope.

## Regression coverage

photo-client-contract reproduces the original size/input contract failures.
photo-pipeline uses actual JPEG/PNG/WebP codecs via installed Sharp (Miniflare's
locked dependency), exercises sizes/aspects, EXIF 1-8, a structured GPS EXIF
block, corruption, MIME mismatch, stream bounds, cancellations and single-flight.
The local codec adapter is expressly NOT the Cloudflare Images service. HEIC
container sniffing is expressly NOT a HEIC codec test.
The synthetic-fixture helper disables the local libvips cache and uses one codec
thread. An earlier uncapped local test process exited abnormally during the large
fixture group; this is recorded separately from assertion failures or live service
behavior. Fixture sizes and assertions were not reduced to obtain a pass.

photo-upload-route executes transpiled actual route functions with synthetic
Auth/database dependencies and an actual local workerd R2 bucket: 7/8/existing
photo counts, authorization, normalization, storage, metadata, media retrieval,
partial failure and cleanup failure. SQL RLS itself is not replaced or newly
certified by these dependency fixtures. photo-preview checks bounded thumbnail
size and cleanup with browser-API doubles, not a real browser.
photo-worker additionally executes the compiled preview route in real workerd,
without any Images binding, and checks anonymous/cross-origin rejection before
processing or persistence. It does not certify a provider decoding operation.

The new tests are discovered by npm test. The codec/client/thumbnail checks also
run as a production build gate; changing the provider-binding contract must not
silently remove the guard or reintroduce raw client-only normalization.

## Sources (read 2026-09-09)

- https://developers.cloudflare.com/images/get-started/limits/
- https://developers.cloudflare.com/images/optimization/binding/
- https://developers.cloudflare.com/images/optimization/features/
- https://developers.cloudflare.com/images/tutorials/optimize-user-uploaded-image/
- https://developers.cloudflare.com/images/optimization/transformations/transform-via-workers/

The remote-URL variant supports larger compressed inputs (100 MB), but retains
the 100 MP limit and requires a reachable source/origin flow. Adding temporary
original storage and access-token URLs would expand privacy/cleanup obligations
without solving 108/200 MP; it was not implemented speculatively.
