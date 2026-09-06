-- Read-only after migration and scheduler setup. Run as project postgres.
select
  to_regprocedure('public.owner_listing_transition(uuid,text)') is not null as owner_actions,
  to_regprocedure('public.archive_expired_listings()') is not null as archive_job_rpc,
  to_regclass('private.registration_handoffs') is not null as private_handoff,
  exists(select 1 from pg_trigger where tgname='listings_publication_period' and tgenabled='O') as publication_clock,
  exists(select 1 from pg_policies where schemaname='public' and tablename='listings'
    and policyname='listings_anon_publication_term' and permissive='RESTRICTIVE') as exact_public_cutoff,
  not has_function_privilege('anon','public.owner_listing_transition(uuid,text)','EXECUTE') as no_anonymous_owner_actions,
  not has_function_privilege('authenticated','public.registration_handoff(text,text,text,text,text,text)','EXECUTE') as handoff_server_only,
  has_function_privilege('service_role','public.registration_handoff(text,text,text,text,text,text)','EXECUTE') as handoff_runtime_access;

select count(*) as active_without_deadline from public.listings
where status='active' and deleted_at is null and (published_at is null or expires_at is null);
select count(*) as expired_public_cards from public.catalog_listing_cards
where expires_at <= statement_timestamp() or expires_at is null;
select jobname,schedule,active,database,command from cron.job
where jobname='marketo-archive-expired-listings';
-- Expected: all first-row booleans true, both counts zero, one active minute job.
-- Verify at least one successful run in cron.job_run_details after scheduling.
