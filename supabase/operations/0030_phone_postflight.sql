-- READ ONLY. This is not a substitute for HTTP/identity/quota checks.
select '01 Public projection contains no phone value' as check_name,
  coalesce((select prosrc like '%null::text%' and prosrc not like '%then contact.contact_phone_e164%'
    from pg_proc where oid=to_regprocedure('public.get_listing_contact_options(uuid)')),false) as ok
union all select '02 Reveal ACL and fixed search path',
  coalesce((select prosecdef and provolatile='v' and proconfig @> array['search_path=""']::text[]
    and not has_function_privilege('authenticated',oid,'EXECUTE')
    and not has_function_privilege('anon',oid,'EXECUTE')
    and has_function_privilege('service_role',oid,'EXECUTE')
    and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0)
    from pg_proc where oid=to_regprocedure('public.reveal_listing_phone(uuid,text)')),false)
  and to_regprocedure('public.reveal_listing_phone(uuid)') is null
union all select '03 Private quota table has RLS and no runtime grants',
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('private.listing_phone_reveal_limits')),false)
  and not has_table_privilege('anon','private.listing_phone_reveal_limits','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','private.listing_phone_reveal_limits','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','private.listing_phone_reveal_limits','SELECT,INSERT,UPDATE,DELETE')
union all select '04 Owner-only contact tables remain protected',
  not has_table_privilege('anon','public.listing_contacts','SELECT')
  and not has_table_privilege('anon','public.profile_private','SELECT')
union all select '05 Quota locking, bounded cleanup and session key guard',
  coalesce((select prosrc like '%for update%' and prosrc like '%p_session_key !~%'
    and prosrc like '%limit 100 for update skip locked%' and prosrc like '%minute_count >= 5%'
    and prosrc like '%cardinality(history) >= 40%' from pg_proc where oid=to_regprocedure('public.reveal_listing_phone(uuid,text)')),false);
