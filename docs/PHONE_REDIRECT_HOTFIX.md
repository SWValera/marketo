# Phone verification Cloudflare hotfix

## Confirmed failure

The direct Cloudflare site returned HTTP 503 for the phone POST, including an
intentionally invalid token for a synthetic listing (no contact read). Negative
probes without a signed cookie, with a bad content type, and with an empty payload
returned the expected 403, 400, and 400. The failure was isolated to Siteverify.

The same compatibility date (2026-05-22) and nodejs_compat in local workerd
reproduced the exception: redirect mode "error" is unsupported. Node-based mocks
had accepted this option and therefore missed the production runtime mismatch.

## Minimal correction

Use redirect: "manual" for the fixed Cloudflare Siteverify endpoint, preserving
the existing non-2xx rejection. Every redirect is rejected without following its
Location, so the verification secret and token cannot be forwarded elsewhere.
No phone projection, signed-cookie check, quota, hostname/action/listing binding,
or database permission is weakened. No schema migration or secret rotation is
required for this fix.

The new workerd regression test executes the real verification source with mocked
network and synthetic values: 200 success/denial, 301/302/303/307/308 redirects,
and 503. The old source failed; the corrected source passes. The four focused
phone test files pass 16 tests. This is not proof of a real human phone reveal.

## Publication boundary

Not published by this diagnostic stage. The intended isolated hotfix contains:

- lib/phone/protection.ts
- tests/listing-phone-protection.test.mjs
- tests/listing-phone-worker.test.mjs
- docs/PHONE_REDIRECT_HOTFIX.md

The working tree also contains separate, unpublished contact-dock and account
deletion changes, including migration 0031. Do not publish those accidentally
with this fix. Obtain approval naming the direct Cloudflare target and isolated
hotfix; do not push the broad worktree to an auto-deploy branch. Preserve all
existing runtime bindings and build with the real R2 binding site-creator-r2,
never a local validation placeholder.

After publication, repeat the synthetic invalid-token check: it must return 403,
not 503, without reading a contact or changing a quota. Then ask the owner to
retry Call manually. A successful negative test is not an end-to-end phone test.
