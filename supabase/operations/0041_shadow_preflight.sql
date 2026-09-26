-- READ ONLY: no listing content, tokens or identifiers are selected.
begin read only;
select jsonb_build_object(
 'baseline_functions_match',(select bool_and(p.oid is not null and md5(replace(p.prosrc,E'\r\n',E'\n'))=x.hash) from (values
('private.enqueue_moderation(uuid,boolean)','562f03d5c577902b35c90be83a796ace'),
('public.claim_moderation_job()','ff2c1b5ba137f51d633f44a8fa6e654c'),
('public.finish_moderation_job(uuid,uuid,jsonb)','2310b64151c15ed1235023d2e9ab0319'),
('public.moderation_admin(text,jsonb)','1cf5e5e2a5e23d7c70535fe0e8c6a548'),
('private.apply_listing_moderation(uuid,text,uuid,text,text)','f45c878fbca1bbd54105d161cae71a6b'),
('public.moderate_listing(uuid,text,text,text)','7fcf91b5249d2b34148b4fdbf647ab8b')
 ) x(signature,hash) left join pg_proc p on p.oid=to_regprocedure(x.signature)),
 'shadow_migration_absent',to_regprocedure('public.moderation_shadow_job(text,uuid,uuid,jsonb)') is null,
 'auto_approve',(select auto_approve from private.moderation_settings),
 'private_rls',(select bool_and(relrowsecurity) from pg_class where oid in ('private.moderation_runs'::regclass,'private.moderation_image_hashes'::regclass)),
 'listing_fingerprint',(select md5(coalesce(string_agg(concat_ws('|',id,status,published_at,expires_at,vip_until,x2_until,bumped_at),E'\n' order by id),'')) from public.listings),
 'listing_counts',(select jsonb_object_agg(status,n) from (select status,count(*) n from public.listings group by status) s),
 'scheduler',(select jsonb_agg(jsonb_build_object('name',jobname,'active',active,'schedule',schedule)) from cron.job)
) preflight;
commit;
