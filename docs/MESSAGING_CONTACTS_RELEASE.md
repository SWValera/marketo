# Messages and listing calls — 0029

The phone-checkbox behavior below describes the historical0029release. The prepared
replacement and its separate activation gates are in [Protected calls](PROTECTED_PHONE_RELEASE.md).

Status: source implementation, NOT live until the database and frontend release gates pass.

## Product behavior

- Listing visitors can start a buyer/seller conversation via “Написать продавцу”.
  Signing in is required. Rendering a GET page never creates a conversation.
- One conversation per listing/pair. Owners cannot message themselves. Starting a
  conversation requires an active, unexpired, nondeleted listing. Existing chats
  survive listing expiry/archive/deletion so participants can finish their discussion.
  Inactive accounts, disabled messages and blocked chats cannot send new messages.
- Visible open chats fetch new messages every 3 seconds, inboxes every 10 seconds.
  Requests are single-flight; hidden/offline tabs stop polling and reconnect on return.
  This does not claim push notifications when the PWA is closed.
- History is persistent in Supabase, loaded in bounded timestamp/ID cursor pages.
  Send retries retain their message ID; a lost response does not duplicate a send.
  An unsuccessful send keeps the composed text. Read markers acknowledge a displayed
  stored message, not a client-supplied time. Legacy direct marker writes are revoked;
  a historical future marker is corrected on that participant's next valid receipt.
- Phone calls use a native tel: link. A seller must explicitly tick “Разрешить звонки”
  on the contact step. Consent defaults OFF, including old/local drafts without it.
  Editing existing listings follows the existing withdraw/edit/moderation lifecycle.
- The phone comes only from that listing's consented contact. A private profile
  phone is never used as fallback. Existing phone consent flags are NOT backfilled.
  Calls are ordinary device calls, not in-app VoIP; no number is dialled automatically.
- Ordinary outsiders cannot read another conversation. Existing staff moderation
  access policies remain unchanged; staff personal inboxes only list their own chats.

## Safe activation sequence

1. Review final source, SQL checksum and the new review ZIP.
2. Obtain explicit approval for a NEW schema-only backup and an isolated restore.
   Export no listings, profiles, private contacts, messages, Auth/Storage rows or
   registration handoffs. Use only fictional or explicitly approved test accounts.
3. Run supabase/operations/0029_messaging_preflight.sql on the explicitly selected
   Supabase project qiyfcuhldcleggfogzsu. All checks must pass.
4. Restore the authorized schema into an isolated test database and apply exactly
   the reviewed 0029 SQL. Exercise two participants plus an unrelated user; verify
   retries, disabled contact choices, inactive accounts, history and read receipts.
   The small focused core test is NOT a substitute for this production-schema clone.
5. Apply the approved migration transaction; require all 0029 postflight checks.
6. Publish the matching validated source in Sites, preserving the existing access
   policy. Do not deploy this frontend against the old database: new draft saves,
   chat sends/inbox and contact lookup require the new functions.
7. Verify the actual published PWA with two approved accounts and a real phone:
   listing → write → send → receive → reply → read → reload → retry after offline;
   phone consent OFF/ON → correct tel: destination. Do not place a real call unless
   the owner explicitly requests one.

Migration 0029 adds/replaces functions and one insert policy; it creates no user
tables, deletes no data, and changes no catalog or R2 objects. Existing legacy draft
RPCs remain for compatibility. Historical migrations are not rewritten.

Rollback: redeploy the previous frontend if necessary; the additive functions can
remain. Do not drop chat data or disable RLS. Removing this migration's tighter send
guard is not an automatic rollback step.
