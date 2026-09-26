-- READ ONLY. Run on the intended existing JEVU project before 0040.
begin read only;
select jsonb_build_object(
 'moderation_absent',to_regclass('private.moderation_runs') is null,
 'baseline_functions_match',coalesce((select bool_and(p.oid is not null and md5(replace(p.prosrc,E'\r\n',E'\n'))=x.hash)
   from (values
    ('public.submit_listing(uuid)','c2620a6f1125993673c99ef68f8a4579'),
    ('public.moderate_listing(uuid,text,text,text)','e38fbf9d3943b3a87c81e538c77d70e9'),
    ('public.owner_listing_transition(uuid,text)','3c608c03cc0b0abe5dc3092764e9f904'),
    ('public.archive_expired_listings()','ba933b8998bd997906bb0ebe3bc64249'),
    ('private.enforce_listing_publication_period()','38b2c8e1e2b7a70f45c76a048b186b2f')
   ) x(signature,hash) left join pg_proc p on p.oid=to_regprocedure(x.signature)),false),
 'core_rls_enabled',(select bool_and(relrowsecurity) from pg_class where oid in ('public.listings'::regclass,'public.profiles'::regclass,'public.listing_images'::regclass,'public.reports'::regclass)),
 'scheduler',(select jsonb_agg(jsonb_build_object('job',jobname,'schedule',schedule,'active',active)) from cron.job),
 'listing_counts',(select jsonb_object_agg(status,total) from (select status,count(*) total from public.listings group by status) counts)
) as preflight;
commit;
