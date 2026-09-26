-- READ ONLY. No users, tokens, phone numbers or listing content are selected.
begin read only;
select jsonb_build_object(
 'tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r' and c.relname=any(array['moderation_settings','moderation_rulesets','moderation_rules','listing_content_revisions','moderation_runs','moderation_findings','moderation_image_hashes','moderation_overrides','moderation_appeals','seller_phone_verifications','seller_phone_challenges'])),
 'private_rls_and_acl',(select bool_and(c.relrowsecurity and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r' and c.relname=any(array['moderation_settings','moderation_rulesets','moderation_rules','listing_content_revisions','moderation_runs','moderation_findings','moderation_image_hashes','moderation_overrides','moderation_appeals','seller_phone_verifications','seller_phone_challenges'])),
 'job_rpc_acl',(select bool_and(to_regprocedure(s) is not null and not has_function_privilege('anon',to_regprocedure(s),'EXECUTE') and not has_function_privilege('authenticated',to_regprocedure(s),'EXECUTE') and has_function_privilege('service_role',to_regprocedure(s),'EXECUTE')) from unnest(array['public.claim_moderation_job()','public.finish_moderation_job(uuid,uuid,jsonb)','public.fail_moderation_job(uuid,uuid)','public.seller_phone_challenge(text,jsonb)']) s),
 'direct_report_insert_denied',not has_column_privilege('authenticated','public.reports','reporter_id','INSERT'),
 'settings',(select to_jsonb(s) from private.moderation_settings s),
 'rules',(select jsonb_object_agg(legal_status,total) from (select legal_status,count(*) total from private.moderation_rules group by legal_status) counts),
 'ruleset',(select version from private.moderation_rulesets where status='active'),
 'scheduler',(select jsonb_agg(jsonb_build_object('job',jobname,'schedule',schedule,'active',active)) from cron.job),
 'listing_counts',(select jsonb_object_agg(status,total) from (select status,count(*) total from public.listings group by status) counts)
) as postflight;
commit;
