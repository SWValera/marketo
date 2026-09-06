# Profile and registration release — 0028

## Deployment gate

This worktree is NOT deployed. The live Supabase email template, confirmation
setting, callback allowlist, SMTP delivery, pg_cron schedule, and two-device PWA
flow must be verified before reporting the feature live. Do not publish frontend
code before the migration: registration intentionally refuses to proceed when
the private handoff RPC is unavailable.

1. Review final source, test reports and fresh review ZIP; authorize exact commit
   and migration hash before GitHub/Sites production publication.
2. Take an explicitly authorized schema-only backup and, only if approved, the
   three public catalog tables. Do not export listings, profiles, contacts,
   messages, Auth, Storage or registration handoff rows.
3. Run `supabase/operations/0028_profile_preflight.sql`; require all guards true.
   Restore the authorized backup to an isolated clone; apply and test migration
   0028 there before applying it to production.
4. Apply the identical reviewed 0028 transaction to the intended Supabase project.
5. Enable pg_cron and run `supabase/operations/0028_publication_scheduler.sql`.
   Run `0028_profile_postflight.sql`; require all guards and a successful cron run.
6. Configure confirmation enabled, canonical Site URL and exact callback paths
   on all real site/PWA origins. Install `supabase/templates/confirmation.html`,
   subject `Подтвердите регистрацию в Marketo`; disable email link tracking.
7. Deploy matching frontend in Sites, preserve current audience/access settings.
8. Test fresh email signup in two separate browser contexts/devices; check
   recipient inbox, Russian button, callback origin, original PWA auto-login,
   resend, expired link, offline/resume and ordinary password fallback. Use only
   authorized test accounts. Do not claim email delivery verified from a mock.
9. Verify create → submit → approve → edit (withdraw) → submit → archive → restore
   (draft) → submit → approve → delete. Verify preserved photos on owner archive,
   no anonymous access, and deletion disappears from owner profile.

## Exact term and safety

- One calendar month in Asia/Almaty, from the actual approval timestamp after the
  row lock. January 31 ends on February 28 (29 in a leap year), same local time.
- Editing cannot extend a running term. Editing an active/pending listing first
  withdraws it. Republishing goes through moderation and starts a fresh month.
- Moderator restore preserves the old unexpired term. Expired publications must
  be resubmitted. Owners may edit a moderator-hidden archive into a draft, but
  cannot restore public visibility without new moderator approval.
- RLS and public view enforce the deadline at read time. Cron physically archives
  due rows every minute in batches of 2000; cron delay does not prolong visibility.
- Archive retains text, attributes and photos. Delete is a soft delete with
  `deleted_at`; it is excluded from profile/public routes. No R2 objects are purged.
- Already-downloaded bytes cannot be recalled from another person's device.

## Registration protocol

The originating browser retains Supabase's PKCE verifier and an HttpOnly read
capability. A different device can only deposit a short-lived code using a
separate write capability. Only the original browser can exchange it. No password,
session or email address is stored in the mailbox. A server-only RPC stores hashed
capabilities, a keyed rate-limit identifier, and a code for the short handoff.
Polling is bounded, pauses when hidden/offline and resumes on focus. Cookies are
buffered until finalization, so cancelled attempts never establish a session.

The code is one-use and expires after five minutes; after OS suspension or a long
delay, ordinary email/password login is the safe fallback. See
[Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[email templates](https://supabase.com/docs/guides/auth/auth-email-templates) and
[Cron](https://supabase.com/docs/guides/cron).

No promise of immediate background navigation is possible while iOS has suspended
the PWA or the device is offline. External email tests remain a required gate.
