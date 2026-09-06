-- Read-only inventory BEFORE applying 0028. Use the explicitly selected project.
-- All guards must be true; this does not substitute for a tested schema backup.
select
  to_regclass('public.listings') is not null as listings_present,
  to_regclass('private.registration_handoffs') is null as handoff_not_previously_applied,
  to_regprocedure('public.owner_listing_transition(uuid,text)') is null as transition_not_previously_applied,
  exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='listings' and column_name='expires_at' and data_type='timestamp with time zone') as expiry_column,
  coalesce((select prosrc ilike '%requiredWhen%' from pg_proc
    where oid=to_regprocedure('public.submit_listing(uuid)')),false) as conditional_submit_0027,
  coalesce((select prosecdef and proconfig @> array['search_path=""']::text[]
    and prosrc ilike '%private.has_any_role%' and prosrc ilike '%invalid moderation reason_code%'
    from pg_proc where oid=to_regprocedure('public.moderate_listing(uuid,text,text,text)')),false) as reviewed_moderation_boundary,
  exists(select 1 from pg_policies where schemaname='public' and tablename='listings'
    and policyname='listings_anon_active_read' and cmd='SELECT' and roles=array['anon']::name[]
    and qual ilike '%active%' and qual ilike '%published_at IS NOT NULL%' and qual ilike '%deleted_at IS NULL%') as anonymous_parent_guard,
  exists(select 1 from pg_policies where schemaname='public' and tablename='listings'
    and policyname='listings_authenticated_read' and cmd='SELECT' and roles=array['authenticated']::name[]
    and qual ilike '%owner_id%' and qual ilike '%moderator%' and qual ilike '%admin%' and qual not ilike '%support%') as authenticated_parent_guard,
  not exists(select 1 from pg_proc as p join pg_namespace as n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) as a
    where n.nspname in ('public','private') and a.grantee=0 and a.privilege_type='EXECUTE') as no_public_rpc_grants;

select name,default_version,installed_version from pg_available_extensions where name='pg_cron';
select status,count(*) from public.listings group by status order by status;
-- Only aggregate counts are returned, not owner identifiers or listing contents.
