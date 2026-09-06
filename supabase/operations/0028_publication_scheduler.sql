-- Run as project postgres AFTER migration 0028 succeeds. Do not expose to browsers.
-- Supabase pg_cron must be enabled in Database > Extensions first.
begin;
do $$ begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'Enable pg_cron before publishing the profile release';
  end if;
end $$;
select cron.schedule('marketo-archive-expired-listings', '* * * * *',
  'select public.archive_expired_listings();');
commit;

-- Postflight: exactly one active job, minute schedule, correct database and SQL.
select jobid, jobname, schedule, database, active, command from cron.job
where jobname = 'marketo-archive-expired-listings';
