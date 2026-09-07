# Protected guest calls — pending 0030

Local implementation; NOT active until fresh database checks and matching site
publication succeed. Applied migration0029 is immutable. The earlier account-gated
0030 checksum/review archive is superseded and must not be deployed.

## User behavior

- No call opt-in checkbox. Explicit owner saves send `allowPhone:true`, with a
  required phone field and visible RU/KK notice. Existing false values remain
  private until the owner explicitly saves; old clients still default false.
- Everyone, including guests without a Marketo account, can click “Позвонить”.
  A fresh Turnstile challenge runs on each reveal. The next deliberate tap on the
  displayed number launches native `tel:`; this is not in-app VoIP.
- No challenge/script/request is started merely by rendering the phone button.
  The widget is loaded after clicking, not on catalog navigation. Managed mode
  may ask the visitor to complete a visible check. This may take longer than
  ordinary page navigation; no sub-0.5-second promise is made for the challenge.
- Errors, offline results and invalid/expired challenges never fall back to an
  unprotected phone. A quota response disables retry until its returned deadline.
- Numbers remain only in component state; cleared after five minutes, listing
  change, pagehide and restored back/forward pages. Nothing is persisted in browser
  storage. Public contact-options responses always have `phone:null`.

## Server boundary

- `GET /api/listings/:id/phone` returns ONLY a public widget key and, if needed,
  a Secure, HttpOnly, SameSite=Lax, host-only signed random cookie. It neither
  reads a phone nor resets an existing valid guest session.
- `POST` requires same-origin, bounded JSON, a valid signed session and fresh
  server-side Siteverify success with exact allowed hostname, `listing_phone`
  action and listing UUID in cdata. Tokens are not logged, stored or reused.
- Session cookies expire after24hours. Their signatures and quota keys use HMAC
  with distinct domain labels and the server-only Turnstile secret. Rotating that
  secret invalidates old sessions. No session identity is accepted from JSON.
- The dedicated server-only Supabase gateway uses the existing server secret;
  incoming Authorization, Cookie and Prefer headers are never forwarded.
- `reveal_listing_phone(uuid,text)` is executable only by service_role; PUBLIC,
  anon and authenticated have no EXECUTE. The old `(uuid)` overload must be absent.
  The private quota table has RLS and no direct runtime grants, even to service_role.
- The function locks the per-session row and limits attempts to5per rolling minute
  and40per rolling24hours across all listings. Unavailable targets also count.
  It stores a derived key, at most40timestamps and an expiry, no number/listing/IP.
  Indexed cleanup removes at most100expired rows per request; retained guest rows
  may remain after25hours until further traffic cleans them. No scheduler added.
- Active seller, published/nonexpired/nondeleted listing and historical call
  permission remain mandatory. A private profile phone is never used as fallback.
- All endpoint responses are private/no-store; errors are generic. Body and server
  request deadlines are bounded. Siteverify failure denies access rather than
  silently weakening the protection.

## Limits and privacy

The quota is per signed browser session, NOT per person or IP. Clearing cookies,
using another browser or solving challenges through distributed automation can
create new sessions. Fresh Turnstile verification on EVERY reveal remains the bot
gate. This raises collection cost; it cannot guarantee prevention of scraping or
copying numbers already shown. Phones placed in descriptions/photos are outside
this gate; the owner notice explicitly warns about that.

Do not derive a security identity from unverified `CF-Connecting-IP`, `x-real-ip`
or `X-Forwarded-For`. The current Sites forwarding contract has not established a
trusted end-user IP; `remoteip` is deliberately omitted from Siteverify.

## Runtime configuration

Set through Sites for the exact existing project, preserve other variables:

- `TURNSTILE_SITE_KEY`: widget public key, not a build-time NEXT_PUBLIC variable.
- `TURNSTILE_SECRET_KEY`: secret, server only; never in source or public assets.
- `TURNSTILE_ALLOWED_HOSTNAMES`: `marketo-kz.sw-valera.chatgpt.site`.
- Existing `SUPABASE_SECRET_KEY` remains server only.

Configured widget: Managed; pre-clearance OFF; exact hostname above. These values
belong to Marketo Sites, not the separate Cloudflare `marketo-staging` Worker.
Environment changes alone do not activate code: deployment is still required.

## Activation gates

1. Obtain approval for a NEW schema-only backup and isolated clone, then for the
   exact reviewed0030checksum and matching publication. Never export user rows,
   listings, profiles, contacts, messages, Auth or Storage. Preserve current Sites
   audience. A prior0029backup is not a fresh0030preflight.
2. Run `0030_phone_preflight.sql` on `qiyfcuhldcleggfogzsu`. Restore the fresh
   public/private schema with ACLs into an isolated clone, using fictional rows
   and explicit synthetic Auth shims only. Every preflight result must be true.
3. Verify effective running PostgREST `db-tx-end=commit`, with no client rollback
   override. SQL settings alone cannot prove effective configuration. Do not
   change global API configuration or restart without approval. The browser phone
   endpoint discards incoming Prefer; callers cannot directly execute the RPC.
4. Apply0030and run SQL audit/postflight on the clone. Verify real concurrent
   connections separately: PGlite's single connection and repeated-statement
   tests are NOT a concurrent-load or full-production-clone proof.
5. Apply only the exact approved migration after the gates. Require postflight
   and approved live checks of committed quotas, direct RPC rejection with public
   credentials, invalid/duplicate tokens and legacy private contacts. Do not
   create live users/listings or make actual calls without explicit permission.
6. Publish matching site source only after DB checks. Verify guest/PWA click,
   visible challenge if required, second tap to native dialer, double click,
   offline/retry, cooldown and back/forward navigation. If ChatGPT Site access is
   itself restricted, do not silently change its audience to make it public.

## Local validation

- `node --test tests/listing-phone.test.mjs tests/listing-phone-state.test.mjs tests/listing-phone-protection.test.mjs`
- `node --liftoff-only --wasm-lazy-compilation --wasm-num-compilation-tasks=1 tests/listing-messaging-focused-db.mjs --phone`
- Typecheck, changed-file lint, production build/secret scan, full lightweight
  application regression and a fresh filtered review archive from final source.

These tests use fictional data and mocked external services. They do not prove
live Turnstile settings, the running API transaction configuration, Safari/PWA
behavior or a real telephone call.

Rollback must not restore the anonymous unmetered phone projection or bulk-open
historical opt-outs. The old site cannot show numbers after0030; keep any activation
gap short with a verified matching deployment or forward fix. Messages stay intact.

References: [Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[widget lifecycle](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/),
[PostgREST transactions](https://docs.postgrest.org/en/v13/references/configuration.html#db-tx-end).
