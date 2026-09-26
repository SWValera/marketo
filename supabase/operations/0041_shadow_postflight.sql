-- READ ONLY. No user or listing content, raw evidence or credentials.
begin read only;
select jsonb_build_object(
 'service_only_rpc',has_function_privilege('service_role','public.moderation_shadow_job(text,uuid,uuid,jsonb)','EXECUTE') and not has_function_privilege('anon','public.moderation_shadow_job(text,uuid,uuid,jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.moderation_shadow_job(text,uuid,uuid,jsonb)','EXECUTE'),
 'private_rls_acl',(select bool_and(relrowsecurity and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE')) from pg_class where oid in ('private.moderation_runs'::regclass,'private.moderation_image_hashes'::regclass)),
 'approval_constraint',exists(select 1 from pg_constraint where conrelid='private.moderation_settings'::regclass and conname='moderation_shadow_no_auto_approve' and convalidated),
 'settings',(select to_jsonb(s) from private.moderation_settings s),
 'hash_indexes',(select count(*) from pg_indexes where schemaname='private' and indexname like 'moderation_hash_band%'),
 'runs',(select jsonb_build_object('total',count(*),'queued',count(*) filter(where status='queued'),'running',count(*) filter(where status='running'),'ai_calls',coalesce(sum(jsonb_array_length(ai_calls)),0)) from private.moderation_runs),
 'listing_fingerprint',(select md5(coalesce(string_agg(concat_ws('|',id,status,published_at,expires_at,vip_until,x2_until,bumped_at),E'\n' order by id),'')) from public.listings),
 'listing_counts',(select jsonb_object_agg(status,n) from (select status,count(*) n from public.listings group by status) s),
 'scheduler',(select jsonb_agg(jsonb_build_object('name',jobname,'active',active,'schedule',schedule)) from cron.job)
) postflight;
commit;
