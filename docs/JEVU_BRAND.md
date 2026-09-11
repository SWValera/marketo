# JEVU brand contract

Canonical origin: https://jevu.kz. Page canonical, Open Graph, Twitter,
Organization, WebSite, WebApplication, robots and sitemap use that origin.
Unknown request hosts cannot override it. The existing direct Worker and local
preview use their own manifest/icon origins to avoid cross-origin installation.

## Official artwork

The supplied JPEG is preserved byte-for-byte at assets/brand/jevu-logo-source.jpg.
SHA-256: b083218bbbe4e95c807c90147cb4ef53c70c04c77e8c5571cf8e9db7cbc5ef3a.
Run `node scripts/build-brand-assets.mjs` to derive PNG and ICO files using the
installed Sharp library. Contain-fit, no enlargement, no redraw. Maskable artwork
is inset; the icon/title must remain identifiable within circular launcher masks.
Brand and BrandIcon components use the same official image. No AI-generated logo.

## PWA continuity

Manifest name/short_name are JEVU; start_url/scope are `/`, display is standalone.
The existing manifest **id is deliberately retained**. It is not a display name.
Renaming it creates a different app identity. Keep `/sw.js` and the existing
registration/update flow; activation removes only obsolete app static namespaces,
not unrelated caches or saved drafts. The offline document embeds the new logo.

An installed app on another origin cannot be silently moved to jevu.kz by a
manifest edit. Do not promise immediate launcher icon updates or delete user
storage to force them. Preserve auth cookies, phone HMAC contexts, recovery keys,
reference response headers and navigation/error event protocols during rollout.

## Deployment boundaries — NOT performed by this code change

- Connect and verify jevu.kz and www.jevu.kz, DNS and TLS on the existing target.
- The Worker returns 308 for www, preserving path/query. Static asset requests
  may bypass the Worker in the existing assets-first architecture. A verified
  domain-level WWW redirect must cover them too; do not claim the code-level
  handler proves that external routing has been configured.
- Verify Supabase Auth Site URL and allowed redirect URLs for jevu.kz, and apply
  the reviewed email template/subject in the hosted Auth configuration.
- Verify jevu.kz in the Turnstile widget and server allowed-host list before
  enabling phone reveal on that origin. Never disable challenge verification.
- Verify the real published manifest, SW update, install and icons on Android
  and iOS. Browser/CDP failure is a verification blocker, not a passing test.

No Cloudflare binding, Worker name, R2 bucket, SQL migration, schema or external
account is renamed by the rebrand. Rebranding is separate from the existing
uncommitted photo-processing work and its release prerequisites.

## Regression checks

`npm test` discovers brand.test.mjs and brand-worker.test.mjs. The normal build
also runs the source/artwork brand gate before compiling. They verify exact
source-derived images, ICO entries, install fields, old-logo removal, canonical
host handling, and compiled workerd HTML metadata/structured data/redirects.
The existing Service Worker tests cover legacy namespace cleanup and preserve
unrelated caches. Synthetic workerd tests are not browser or physical-iOS tests.

Primary references:

- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/static-assets/redirects/
