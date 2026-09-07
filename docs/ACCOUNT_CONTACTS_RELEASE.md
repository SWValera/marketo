# Contacts and own-account deletion

Scope: visible mobile listing contact dock; bounded contact/chat/logout loading;
profile logout; password-confirmed own-account erasure. No automatic deletion of
existing users occurs when installing migration 0031.

## Deployment targets and required configuration

The direct site is https://marketo-staging.arshavin-ivan-mail-ru.workers.dev/.
It is a separate Cloudflare worker from the Sites URL. Its Turnstile hostname and
runtime keys must be configured separately. Preserve the existing Supabase secret,
public Supabase configuration, and MARKETO_MEDIA binding to site-creator-r2.
Never deploy a build's placeholder test-media bucket to this worker.

The phone endpoint must fail closed if Turnstile configuration is missing.
Add the direct hostname to the existing widget without removing its Sites host,
then supply TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY and
TURNSTILE_ALLOWED_HOSTNAMES through a secure runtime-secret channel. Never store
the secret in source, NEXT_PUBLIC variables, logs, review archives or chat.
No public phone projection or anti-bot bypass is introduced by this release.

## Account erasure boundary

POST /api/account/delete verifies the same origin, exact bounded JSON, current
server-verified identity and that account's current password. Preparation creates
a private job, snapshots owned R2 keys, hides/anonymizes the profile, closes chats
and removes owned listings. The first response delivers a short-lived HttpOnly,
Secure, SameSite=Strict capability cookie before external R2 or Auth erasure.
Only its SHA-256 digest is persisted in the database. A lost preparation response
can be recovered by reconfirming with the still-existing account credentials.

Resume requests use the cookie, not a caller-supplied user ID. Up to 100 owned
keys are removed per batch and acknowledged only after R2 confirms deletion.
Auth erasure happens last; final SQL verifies both Auth absence and an empty
media queue. Responses never claim completion on an uncertain failure. The server
retains a five-minute completion receipt so a lost response body can be retried.
The form
continues successful batches automatically and offers retry on failure. Reloading
/profile/delete with the cookie permits resuming even if Auth is already erased.

Accounts with Premium financial records or staff roles require assisted deletion
before any content is erased. No billing/audit records are deleted. Message text
remains with the other participant, with sender/profile references detached and
the conversation read-only. Historical reports remain with detached targets;
new reports still require a target. Existing cached copies or content copied by
another person cannot be revoked by this workflow.

## Release gates

1. Obtain approval for 0031 and a new schema-only backup (no user rows).
2. Verify the backup hash and restore into an isolated clone, with original ACLs.
3. Run 0031_account_deletion_preflight.sql, apply the exact migration, then run
   0031_account_deletion_postflight.sql. Every check must be true.
4. Run the synthetic deletion audit and native concurrent writer audit. These
   tests must not access production accounts, listings, messages or R2 objects.
5. Apply approved SQL to the intended Supabase project only after backup/clone
   and preflight succeed; verify production postflight before publishing code.
6. Verify the deployed worker bindings and non-revealing phone configuration GET.
   A real phone reveal, chat send or destructive account test requires a separately
   authorized test account and listing; do not use an owner's real account.

Local controlled tests do not prove live Turnstile execution, mobile Safari layout,
mail delivery or the production Auth service's behavior. Keep these limits explicit
in the release report until those checks are performed.
