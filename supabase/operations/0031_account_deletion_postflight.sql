-- READ ONLY, schema/privilege checks only. This does not delete a test or real account.
select '01 Both private job tables retain RLS' as check_name,
  (select count(*)=2 and bool_and(relrowsecurity) from pg_class where oid in
    (to_regclass('private.account_deletions'),to_regclass('private.account_deletion_media'))) as ok
union all select '02 Job rows are inaccessible to API roles',
  not exists(select 1 from unnest(array['anon','authenticated','service_role']) r,
    unnest(array['private.account_deletions','private.account_deletion_media']) t,
    unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege where has_table_privilege(r,t,privilege))
union all select '03 Deletion RPCs have fixed security-definer boundaries',
  (select count(*)=3 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
    from pg_proc p where p.oid in (to_regprocedure('public.begin_account_deletion(uuid,text)'),
    to_regprocedure('public.advance_account_deletion(text,text[])'),to_regprocedure('public.finish_account_deletion(text)')))
union all select '04 Only server role can execute deletion RPCs',
  not exists(select 1 from unnest(array['anon','authenticated']) r,
    unnest(array['public.begin_account_deletion(uuid,text)','public.advance_account_deletion(text,text[])','public.finish_account_deletion(text)']) f
    where has_function_privilege(r,f,'EXECUTE'))
  and (select bool_and(has_function_privilege('service_role',f,'EXECUTE')) from
    unnest(array['public.begin_account_deletion(uuid,text)','public.advance_account_deletion(text,text[])','public.finish_account_deletion(text)']) f)
union all select '05 Concurrent new ownership links guarded',
  (select count(*)=3 and bool_and(tgenabled='O') from pg_trigger where not tgisinternal and tgname in
    ('listings_require_writable_owner','user_roles_require_writable_owner','city_premium_accounts_require_writable_owner'))
union all select '06 New reports require targets, historical targets may detach',
  exists(select 1 from pg_trigger where tgrelid='public.reports'::regclass and tgname='reports_require_target_on_insert' and tgenabled='O')
  and not exists(select 1 from pg_constraint where conrelid='public.reports'::regclass and conname='reports_target_present')
union all select '07 Pending profiles cannot be edited by their owner',
  exists(select 1 from pg_policies where schemaname='public' and policyname='profiles_owner_update' and qual like '%deleted%' and with_check like '%deleted%')
  and (select count(*)=2 from pg_policies where schemaname='public' and policyname in ('profile_private_owner_insert','profile_private_owner_update') and with_check like '%current_profile_accepts_account_writes%')
union all select '08 Finalizer owner can check Auth outcome',
  (select has_schema_privilege(pg_get_userbyid(proowner),'auth','USAGE') and has_table_privilege(pg_get_userbyid(proowner),'auth.users','SELECT')
    from pg_proc where oid=to_regprocedure('public.finish_account_deletion(text)'));
