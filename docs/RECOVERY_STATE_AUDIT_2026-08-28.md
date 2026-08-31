# Marketo v1.0 — recovery state audit

Audit source: actual working directory on 2026-08-28. The uploaded baseline ZIP
was inspected read-only and was not restored over the workspace.

| Block | State found at audit | Recovery resolution |
|---|---|---|
| Master Catalog | Expanded data and semantic validator existed, but current docs/checksums still described the old 228-node release | Verified 1,356 categories / 1,137 leaves, completed benchmark and validator docs, preserved 0017 and regression gates |
| Auth/registration | Phone-form stub; no complete frontend email/password/session/profile flow | Added real register/login/callback/logout/recovery/update-password/profile flow and forward migration 0018 |
| Real listing flow | Atomic Supabase draft/RLS existed; photos were preview-only and listing stopped before moderation submission | Added content-validated R2 upload/metadata compensation, submit route and User A → moderation → User B roundtrip tests |
| Home/City Premium | Legacy hero rotated at 7 seconds, manual input stopped autoplay, no city capacity model | Added migration 0019, active-only city placements, default capacity 15, branded fallback set, persistent 3-second rotation, 3 desktop / 2 mobile cards and Catalog/Listings tabs |

## Conflicts resolved

- Current code and old ZIP/report counts conflicted; current code and clean
  migration execution were treated as authoritative.
- Stale tests expected the removed legacy hero and pre-update profile name;
  expectations were aligned to the verified runtime behavior.
- Protected-page render tests still expected anonymous 200 responses; they now
  assert the real 307 login redirects in RU and KK.
- A security assertion expected every denied RLS update to throw. PostgreSQL
  can instead hide the target row, so the test now proves zero updated rows and
  an unchanged listing title.
- The production Worker correctly uses `cloudflare:workers`, while the Node
  artifact harness could not resolve that native module. A test-only loader now
  supplies the binding shape without changing the workerd runtime.
- Live browser QA exposed an RSC locale-refresh reset in the showcase. The
  browser snapshot now preserves the active index, with Web Storage and a
  compact cookie fallback for full-document navigation.
- Runtime files, database types, Drizzle mirror, migration manifest and SQL
  checksums were synchronized without modifying migrations 0001–0016.

Production Supabase, deployment and GitHub were not changed.
Live external Supabase Auth/email delivery and R2 upload remain NOT VERIFIED
without non-production credentials; their local contracts and security
roundtrips are covered by the automated suite.
