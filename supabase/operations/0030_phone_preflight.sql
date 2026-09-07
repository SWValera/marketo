-- READ ONLY. Target qiyfcuhldcleggfogzsu after a NEW schema backup/clone.
-- Also REQUIRED: effective PostgREST db-tx-end=commit with no rollback override.
-- SQL alone cannot prove the running API configuration; see release checklist.
select '01 Applied contact API and owner save wrapper' as check_name,
  to_regprocedure('public.get_listing_contact_options(uuid)') is not null
  and to_regprocedure('public.save_listing_draft_with_contacts(uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb,boolean,uuid)') is not null as ok
union all select '02 Release not already applied',
  to_regprocedure('public.reveal_listing_phone(uuid)') is null
  and to_regprocedure('public.reveal_listing_phone(uuid,text)') is null
  and to_regclass('private.listing_phone_reveal_limits') is null
union all select '03 Dedicated server role exists',
  exists(select 1 from pg_roles where rolname='service_role')
union all select '04 Contact tables retain RLS and deny anon reads',
  (select count(*)=2 and bool_and(relrowsecurity) from pg_class where oid in ('public.listing_contacts'::regclass,'public.profile_private'::regclass))
  and not has_table_privilege('anon','public.listing_contacts','SELECT')
  and not has_table_privilege('anon','public.profile_private','SELECT')
union all select '05 No known rollback configuration override',
  not exists (select 1 from pg_db_role_setting s cross join lateral unnest(s.setconfig) as setting
    where setting like 'pgrst.db_tx_end=%' and setting <> 'pgrst.db_tx_end=commit');
