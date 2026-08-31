# First admin and moderator bootstrap

Use this procedure first on a disposable or staging Supabase project. Nothing
in the Marketo build, tests or migrations creates demo users or assigns a role.
Production changes require a separate, explicit approval and a verified backup.

## 1. Find the intended Auth user

Create the real user through normal Supabase Auth, confirm the email, then run
this read-only query in the Supabase SQL editor. Replace the placeholder only
at execution time; never commit an email or UUID to source control.

```sql
select id, email, created_at
from auth.users
where lower(email) = lower('<USER_EMAIL>');
```

Confirm that exactly one expected account is returned. Copy its UUID.

## 2. Assign the first admin once

`assign_user_role(...)` requires an existing active admin. For the very first
admin only, use one reviewed transaction in the SQL editor:

```sql
begin;

insert into public.user_roles (user_id, role, assigned_by)
values ('<USER_UUID>'::uuid, 'admin', null)
on conflict (user_id, role) do nothing;

insert into public.admin_audit_log (
  actor_id, action, entity_type, entity_id, metadata
)
values (
  null,
  'role.bootstrap',
  'profile',
  '<USER_UUID>',
  jsonb_build_object('role', 'admin', 'method', 'reviewed_sql_bootstrap')
);

commit;
```

The profile must have `status = 'active'`. A suspended, banned or deleted
profile keeps its stored role but receives no staff capabilities.

## 3. Use the audited RPC after bootstrap

Subsequent assignments and revocations must use the existing RPC so the acting
admin is checked and the action is audited. The Supabase SQL editor does not
carry the web session JWT, so a privileged operator must set a transaction-local
authenticated role and the real active admin UUID explicitly:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<ACTIVE_ADMIN_UUID>', true);

select public.assign_user_role('<TARGET_USER_UUID>'::uuid, 'moderator', true);

commit;
```

For a revocation, run a new transaction with the same active admin context and
pass `false` as the third argument. Use `target_role = 'admin'` only when that
specific role is intentionally being changed. An application-side admin tool
may call the same RPC with the signed-in admin session when that product area is
implemented in a later stage.

Do not use a service-role client in the browser and do not hardcode an email or
UUID in the application.

## 4. Verify roles and audit

```sql
select user_id, role, assigned_by, created_at
from public.user_roles
where user_id = '<TARGET_USER_UUID>'::uuid
order by role;

select actor_id, action, entity_type, entity_id, metadata, created_at
from public.admin_audit_log
where entity_type = 'profile'
  and entity_id = '<TARGET_USER_UUID>'
order by created_at desc, id desc;
```

Also sign in through the application and verify the expected access matrix:
ordinary user and support are denied; only an active moderator or admin can
open the listing moderation queue.
