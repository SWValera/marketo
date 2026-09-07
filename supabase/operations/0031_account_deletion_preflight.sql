-- READ ONLY, no user rows. Run after a fresh schema-only backup of qiyfcuhldcleggfogzsu.
select '01 Existing contact and lifecycle release' as check_name,
  to_regprocedure('public.reveal_listing_phone(uuid,text)') is not null
  and to_regprocedure('private.current_profile_is_active()') is not null as ok
union all select '02 Deletion release not installed',
  to_regclass('private.account_deletions') is null
  and to_regprocedure('public.begin_account_deletion(uuid,text)') is null
union all select '03 Expected owner policies',
  (select count(*)=3 from pg_policies where schemaname='public' and policyname in
    ('profiles_owner_update','profile_private_owner_insert','profile_private_owner_update'))
union all select '04 Reports constraint and target update boundary',
  exists(select 1 from pg_constraint where conrelid='public.reports'::regclass and conname='reports_target_present')
  and not has_column_privilege('authenticated','public.reports','listing_id','UPDATE')
  and not has_column_privilege('authenticated','public.reports','reported_user_id','UPDATE')
union all select '05 Migration owner can verify Auth erasure',
  has_schema_privilege(current_user,'auth','USAGE') and has_table_privilege(current_user,'auth.users','SELECT')
union all select '06 Financial and role blockers are present',
  to_regclass('public.city_premium_accounts') is not null and to_regclass('public.user_roles') is not null;
