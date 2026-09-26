-- JEVU moderation foundation. Forward-only; no existing listing is republished.
begin;
set local lock_timeout='5s';

create table private.moderation_settings (
  singleton boolean primary key default true check(singleton),
  auto_approve boolean not null default false,
  require_verified_kz_phone boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into private.moderation_settings default values;
create table private.moderation_rulesets (
  version text primary key check(version ~ '^[a-zA-Z0-9_.-]{1,64}$'),
  status text not null check(status in ('draft','reviewed','active','retired')),
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), activated_at timestamptz
);
create unique index moderation_one_active_ruleset on private.moderation_rulesets(status) where status='active';
create table private.moderation_rules (
  id uuid primary key default gen_random_uuid(),code text not null,
  jurisdiction text not null default 'KZ' check(jurisdiction='KZ'),
  title_ru text not null,title_kk text not null,description_ru text not null,description_kk text not null,
  rule_type text not null,scope jsonb not null default '["text","image","ocr"]',
  applicable_categories jsonb not null default '[]',severity text not null check(severity in ('low','medium','high','critical')),
  action text not null check(action in ('REJECTED','NEEDS_FIX','HUMAN_REVIEW')),
  enabled boolean not null default true,priority integer not null default 100,config jsonb not null,
  legal_status text not null check(legal_status in ('LAW','REGULATION','JEVU_POLICY','LEGAL_REVIEW_REQUIRED')),
  legal_basis text not null,legal_source_title text not null,legal_source_reference text not null,
  effective_from timestamptz not null default now(),effective_to timestamptz,
  ruleset_version text not null references private.moderation_rulesets(version),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(ruleset_version,code),check(effective_to is null or effective_to>effective_from),
  check(jsonb_typeof(config)='object' and jsonb_typeof(scope)='array' and jsonb_typeof(applicable_categories)='array')
);
create table private.listing_content_revisions (
  id uuid primary key default gen_random_uuid(),listing_id uuid not null references public.listings(id) on delete cascade,
  content_revision_hash text not null check(length(content_revision_hash)=64),
  content_fingerprint text not null,snapshot jsonb,created_at timestamptz not null default now(),
  purge_after timestamptz not null default now()+interval '30 days',unique(listing_id,content_revision_hash)
);
create index moderation_revision_fingerprint on private.listing_content_revisions(content_fingerprint,created_at);
create table private.moderation_runs (
  id uuid primary key default gen_random_uuid(),listing_id uuid not null references public.listings(id) on delete cascade,
  revision_id uuid not null references private.listing_content_revisions(id),content_revision_hash text not null,
  generation integer not null default 0, status text not null default 'queued' check(status in ('queued','running','completed','stale')),
  decision text check(decision in ('APPROVED','NEEDS_FIX','REJECTED','HUMAN_REVIEW')),
  risk_score integer check(risk_score between 0 and 100),engine_version text not null,
  ruleset_version text not null references private.moderation_rulesets(version),rules_snapshot jsonb not null,
  provider text,provider_version text,ocr_provider text,ocr_version text,
  stages jsonb not null default '[]',image_results jsonb not null default '[]',
  attempts integer not null default 0,claim_token uuid,lease_until timestamptz,next_attempt_at timestamptz not null default now(),
  started_at timestamptz,completed_at timestamptz,error_code text,created_at timestamptz not null default now(),
  unique(listing_id,content_revision_hash,ruleset_version,engine_version,generation)
);
create index moderation_jobs_due on private.moderation_runs(next_attempt_at,created_at) where status in ('queued','running');
create index moderation_listing_history on private.moderation_runs(listing_id,created_at desc);
create index moderation_metrics_recent on private.moderation_runs(created_at);
create table private.moderation_findings (
  id uuid primary key default gen_random_uuid(),run_id uuid not null references private.moderation_runs(id) on delete cascade,
  rule_id uuid references private.moderation_rules(id),finding_code text not null,source_type text not null,
  image_index integer check(image_index between 0 and 6),severity text not null,confidence numeric check(confidence between 0 and 1),
  recommended_action text not null,evidence_summary text not null check(length(evidence_summary)<=160),
  user_reason_ru text not null,user_reason_kk text not null,internal_details jsonb not null default '{}',created_at timestamptz not null default now()
);
create index moderation_findings_run on private.moderation_findings(run_id);
create index moderation_findings_recent on private.moderation_findings(created_at);
create table private.moderation_image_hashes (
 run_id uuid not null references private.moderation_runs(id) on delete cascade,
 listing_id uuid not null references public.listings(id) on delete cascade,
 image_index integer not null check(image_index between 0 and 6),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 primary key(run_id,image_index)
);
create index moderation_reused_images on private.moderation_image_hashes(sha256,listing_id);
create table private.moderation_overrides (
  id uuid primary key default gen_random_uuid(),run_id uuid references private.moderation_runs(id),
  listing_id uuid not null references public.listings(id) on delete cascade,moderator_id uuid references public.profiles(id) on delete set null,
  automatic_decision text,new_decision text not null,reason text not null check(length(reason) between 1 and 2000),created_at timestamptz not null default now()
);
create index moderation_overrides_listing on private.moderation_overrides(listing_id,created_at desc);
create table private.moderation_appeals (
  id uuid primary key default gen_random_uuid(),run_id uuid not null references private.moderation_runs(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,message text not null check(length(message) between 10 and 2000),
  status text not null default 'open' check(status in ('open','upheld','overturned')),reviewer uuid references public.profiles(id) on delete set null,
  resolution text,created_at timestamptz not null default now(),resolved_at timestamptz,unique(run_id,owner_id)
);
create index moderation_appeals_open on private.moderation_appeals(created_at) where status='open';
create table private.seller_phone_verifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,phone_e164 text not null check(phone_e164 ~ '^\+7[67][0-9]{9}$'),
  verified_at timestamptz not null,provider text not null,provider_reference text not null
);
create table private.seller_phone_challenges (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
  phone_e164 text not null check(phone_e164 ~ '^\+7[67][0-9]{9}$'),provider text not null,provider_reference text not null,
  expires_at timestamptz not null,attempts integer not null default 0,consumed_at timestamptz,created_at timestamptz not null default now()
);
create index seller_phone_challenges_user on private.seller_phone_challenges(user_id,created_at desc);
-- Every new table is private and inaccessible to browser and service roles directly.
do $$ declare tab text; begin
 foreach tab in array array['moderation_settings','moderation_rulesets','moderation_rules','listing_content_revisions','moderation_runs','moderation_findings','moderation_image_hashes','moderation_overrides','moderation_appeals','seller_phone_verifications','seller_phone_challenges'] loop
 execute format('alter table private.%I enable row level security',tab);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',tab);
 end loop;
end $$;

-- Account erasure must clear newly introduced phone records at the same point
-- that the existing workflow clears contact details, even if Auth cleanup retries.
create function private.clear_moderation_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='deleted' and old.status is distinct from new.status then
  delete from private.seller_phone_verifications where user_id=new.id;
  delete from private.seller_phone_challenges where user_id=new.id;
  update private.moderation_appeals set message='[account deleted]' where owner_id=new.id;
 end if;return new;
end;
$$;
create trigger moderation_identity_erasure after update of status on public.profiles for each row execute function private.clear_moderation_identity();

create function private.moderation_content(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('title',l.title,'description',l.description,'category_id',l.category_id,
 'category_path',(with recursive path as (select c.id,c.parent_id,c.slug,c.name_ru,c.name_kk,0 depth from public.categories c where c.id=l.category_id
 union all select c.id,c.parent_id,c.slug,c.name_ru,c.name_kk,p.depth+1 from public.categories c join path p on p.parent_id=c.id where p.depth<15)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'slug',slug,'ru',name_ru,'kk',name_kk) order by depth desc),'[]') from path),
 'settlement_id',l.settlement_id,'price_minor',l.price_minor,'currency_code',l.currency_code,
 'attributes',(select coalesce(jsonb_agg(v.value order by v.value::text),'[]') from (
 select jsonb_build_object('key',a.key,'ru',a.label_ru,'kk',a.label_kk,'text',v.text_value,'number',v.number_value,'boolean',v.boolean_value,'date',v.date_value,'min',v.number_min_value,'max',v.number_max_value) value
 from public.listing_attribute_values v join public.category_attributes a on a.id=v.attribute_id where v.listing_id=l.id
 union all select jsonb_build_object('key',a.key,'option',o.value,'ru',o.label_ru,'kk',o.label_kk) from public.listing_attribute_option_values v
 join public.category_attributes a on a.id=v.attribute_id join public.category_attribute_options o on o.id=v.option_id where v.listing_id=l.id) v),
 'images',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'storage_key',i.storage_key,'sort_order',i.sort_order,'width',i.width,'height',i.height,'byte_size',i.byte_size,'mime_type',i.mime_type) order by i.sort_order,i.id),'[]') from public.listing_images i where i.listing_id=l.id))
 from public.listings l where l.id=target;
$$;
create function private.moderation_hash(content jsonb) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(content::text,'UTF8'),'sha256'),'hex');
$$;
create function private.enqueue_moderation(target uuid,force_new boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare content jsonb; hash text; rev uuid; run uuid; version text; gen integer:=0; rules jsonb;
begin
 perform 1 from public.listings where id=target and status='pending' and deleted_at is null for update;
 if not found then return null; end if;
 select r.version into strict version from private.moderation_rulesets r where status='active';
 content:=private.moderation_content(target);hash:=private.moderation_hash(content);
 insert into private.listing_content_revisions(listing_id,content_revision_hash,content_fingerprint,snapshot)
 values(target,hash,private.moderation_hash(content-'images'-'settlement_id'),content) on conflict(listing_id,content_revision_hash) do nothing;
 select id into rev from private.listing_content_revisions where listing_id=target and content_revision_hash=hash;
 select coalesce(jsonb_agg(to_jsonb(r) order by priority,code),'[]') into rules from private.moderation_rules r
 where ruleset_version=version and enabled and effective_from<=now() and (effective_to is null or effective_to>now());
 select coalesce(max(generation),0) into gen from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-1';
 if force_new then gen:=gen+1; end if;
 insert into private.moderation_runs(listing_id,revision_id,content_revision_hash,generation,engine_version,ruleset_version,rules_snapshot)
 values(target,rev,hash,gen,'jevu-moderation-1',version,rules) on conflict do nothing returning id into run;
 if run is null then select id into run from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-1' and generation=gen; end if;
 return run;
end;
$$;
create function private.capture_moderation_submission() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending' and old.status is distinct from new.status then perform private.enqueue_moderation(new.id); end if;
 return new;
end;
$$;
create trigger listings_moderation_submission after update of status on public.listings for each row execute function private.capture_moderation_submission();

-- The same publication primitive serves humans and the trusted worker. Existing
-- publication/expiry/promotion triggers remain the sole owners of lifecycle dates.
create function private.apply_listing_moderation(target uuid,decision text,actor uuid,reason text,note text) returns void
language plpgsql security definer set search_path='' as $$
declare prior text; next text;
begin
 select status into prior from public.listings where id=target and deleted_at is null for update;
 if prior is null then raise exception 'listing is unavailable' using errcode='P0002'; end if;
 next:=case when decision='approve' and prior='pending' then 'active' when decision in ('reject','needs_fix') and prior='pending' then 'rejected'
 when decision='hide' and prior='active' then 'archived' when decision='restore' and prior='archived' then 'active' else null end;
 if next is null then raise exception 'moderation transition is not allowed' using errcode='22023'; end if;
 if next='active' then
   if not exists(select 1 from public.listings l join public.profiles p on p.id=l.owner_id where l.id=target and p.status='active') then raise exception 'active owner required' using errcode='42501'; end if;
   if (select require_verified_kz_phone from private.moderation_settings) and not exists(select 1 from private.seller_phone_verifications v join public.listings l on l.owner_id=v.user_id where l.id=target) then raise exception 'verified KZ phone required' using errcode='22023'; end if;
 end if;
 update public.listings set status=next,published_at=case when next='active' then coalesce(published_at,now()) else published_at end where id=target;
 insert into public.moderation_actions(listing_id,moderator_id,action,previous_status,new_status,reason_code,note,metadata)
 values(target,actor,case when decision='needs_fix' then 'reject' else decision end,prior,next,reason,note,jsonb_build_object('decision',decision,'source',case when actor is null then 'automatic' else 'human' end));
 insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,metadata) values(actor,'listing.'||decision,'listing',target::text,jsonb_build_object('previous_status',prior,'new_status',next,'reason_code',reason,'note',note));
end;
$$;
create or replace function public.moderate_listing(target_listing_id uuid,decision text,reason_code text default null,note text default null) returns void
language plpgsql security definer set search_path='' as $$
declare run private.moderation_runs; normalized_note text:=nullif(btrim(note),''); normalized_reason text:=nullif(btrim(reason_code),'');
begin
 if auth.uid() is null or not private.has_any_role(array['moderator','admin']) then raise exception 'moderator role required' using errcode='42501'; end if;
 if decision is null or decision not in ('approve','reject','needs_fix','hide','restore') then raise exception 'invalid moderation input' using errcode='22023'; end if;
 if length(normalized_note)>2000 then raise exception 'moderation note is too long' using errcode='22023';end if;
 if normalized_reason is not null and normalized_reason not in ('incomplete_information','wrong_category','duplicate','photo_issue','policy_violation','other') then raise exception 'invalid moderation reason_code' using errcode='22023'; end if;
 if decision in ('reject','needs_fix','hide') and normalized_reason is null then raise exception 'reason_code is required' using errcode='22023'; end if;
 perform 1 from public.listings where id=target_listing_id for update;
 select * into run from private.moderation_runs where listing_id=target_listing_id order by created_at desc,id desc limit 1 for update;
 if run.decision is not null and normalized_note is null then raise exception 'override reason required' using errcode='22023'; end if;
 perform private.apply_listing_moderation(target_listing_id,decision,auth.uid(),case when decision in ('approve','restore') then null else normalized_reason end,normalized_note);
 if run.id is not null then
  insert into private.moderation_overrides(run_id,listing_id,moderator_id,automatic_decision,new_decision,reason) values(run.id,target_listing_id,auth.uid(),run.decision,upper(decision),coalesce(normalized_note,normalized_reason,'manual review before automated decision'));
  -- Keep completed automatic results immutable; invalidate in-flight callbacks.
  update private.moderation_runs set status='stale',claim_token=null,completed_at=now(),error_code='human_override' where listing_id=target_listing_id and status in ('queued','running');
 end if;
end;
$$;

create function private.lock_moderation_content() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; state text;
begin
 target:=case when tg_op='DELETE' then old.listing_id else new.listing_id end;
 select status into state from public.listings where id=target for update;
 -- Database-owner migration fixtures remain privileged; API roles must edit first.
 if state in ('active','pending') and current_setting('role',true) in ('anon','authenticated','service_role') then raise exception 'edit listing before changing content' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if;return new;
end;
$$;
create trigger moderation_lock_images before insert or update or delete on public.listing_images for each row execute function private.lock_moderation_content();
create trigger moderation_lock_attributes before insert or update or delete on public.listing_attribute_values for each row execute function private.lock_moderation_content();
create trigger moderation_lock_options before insert or update or delete on public.listing_attribute_option_values for each row execute function private.lock_moderation_content();

create function public.claim_moderation_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.moderation_runs; owner uuid; snap jsonb; fingerprint text; token uuid:=gen_random_uuid();
begin
 select * into job from private.moderation_runs where status='queued' and next_attempt_at<=now() order by next_attempt_at,created_at limit 1 for update skip locked;
 if job.id is null then return null; end if;
 update private.moderation_runs set status='running',attempts=attempts+1,started_at=coalesce(started_at,now()),lease_until=now()+interval '180 seconds',claim_token=token where id=job.id;
 select snapshot,content_fingerprint into snap,fingerprint from private.listing_content_revisions where id=job.revision_id;
 select owner_id into owner from public.listings where id=job.listing_id;
 return jsonb_build_object('id',job.id,'listing_id',job.listing_id,'claim_token',token,'content_revision_hash',job.content_revision_hash,'ruleset_version',job.ruleset_version,
 'snapshot',snap,'rules',job.rules_snapshot,'auto_approve',(select auto_approve from private.moderation_settings),
 'fraud',jsonb_build_object('recent_submissions',(select count(*) from private.moderation_runs r join public.listings l on l.id=r.listing_id where l.owner_id=owner and r.created_at>now()-interval '1 hour'),
 'prior_rejections',(select count(*) from private.moderation_runs r join public.listings l on l.id=r.listing_id where l.owner_id=owner and r.decision='REJECTED' and r.created_at>now()-interval '30 days'),
 'confirmed_reports',(select count(*) from public.reports r join public.listings l on l.id=r.listing_id where l.owner_id=owner and r.status='resolved' and r.created_at>now()-interval '90 days'),
 'duplicate_content',(select count(distinct r.listing_id) from private.listing_content_revisions r join public.listings l on l.id=r.listing_id where r.content_fingerprint=fingerprint and r.listing_id<>job.listing_id and l.owner_id=owner and l.status in ('pending','active')),
 'reused_images',0));
end;
$$;

create function public.finish_moderation_job(job_id uuid,token uuid,result jsonb) returns text language plpgsql security definer set search_path='' as $$
declare job private.moderation_runs; item public.listings; outcome text:=result->>'decision'; f jsonb; image_count integer; expected integer; current_hash text;
begin
 select l.* into item from public.listings l join private.moderation_runs r on r.listing_id=l.id where r.id=job_id for update of l;
 select * into job from private.moderation_runs where id=job_id for update;
 if job.id is null or job.status<>'running' or job.claim_token is distinct from token or job.lease_until<now() then return 'ignored'; end if;
 current_hash:=private.moderation_hash(private.moderation_content(job.listing_id));
 if item.status<>'pending' or item.deleted_at is not null or current_hash<>job.content_revision_hash or not exists(select 1 from private.moderation_rulesets where version=job.ruleset_version and status='active') then
   update private.moderation_runs set status='stale',completed_at=now(),claim_token=null,error_code='revision_or_state_changed' where id=job_id;
   if item.status='pending' and item.deleted_at is null then perform private.enqueue_moderation(item.id); end if;
   return 'stale';
 end if;
 if jsonb_typeof(result) is distinct from 'object' or outcome is null or outcome not in ('APPROVED','NEEDS_FIX','REJECTED','HUMAN_REVIEW')
   or jsonb_typeof(result->'stages') is distinct from 'array' or jsonb_typeof(result->'findings') is distinct from 'array'
   or jsonb_typeof(result->'images') is distinct from 'array' or coalesce(result->>'risk_score','') !~ '^[0-9]{1,3}$'
   then raise exception 'invalid moderation result' using errcode='22023'; end if;
 if (result->>'risk_score')::integer not between 0 and 100 or jsonb_array_length(result->'findings')>100
   or jsonb_array_length(result->'stages')>27 or jsonb_array_length(result->'images')>7
   or exists(select 1 from jsonb_array_elements(result->'stages') s where coalesce(s->>'code','') !~ '^[a-z][a-z0-9_]{0,79}$' or coalesce(s->>'status','') not in ('PASS','ERROR','UNAVAILABLE'))
   then raise exception 'invalid moderation result' using errcode='22023'; end if;
 image_count:=jsonb_array_length(private.moderation_content(item.id)->'images');expected:=6+image_count*3;
 -- Approval requires the complete, distinct mandatory stage set, approved provider
 -- identities, current revision, active owner and explicit rollout authorization.
 if outcome='APPROVED' and (not (select auto_approve from private.moderation_settings)
   or coalesce(result->>'provider','unavailable') in ('unavailable','none','') or coalesce(result->>'ocr_provider','unavailable') in ('unavailable','none','')
   or image_count not between 1 and 7 or jsonb_array_length(result->'stages')<>expected
   or jsonb_array_length(result->'images')<>image_count
   or (select count(distinct i->>'image_index') from jsonb_array_elements(result->'images') i where (i->>'image_index')::integer between 0 and image_count-1 and i->>'status'='PASS' and (i->>'sha256') ~ '^[a-f0-9]{64}$')<>image_count
   or coalesce(result->>'provider_version','') in ('','none') or coalesce(result->>'ocr_version','') in ('','none')
   or (select count(distinct s->>'code') from jsonb_array_elements(result->'stages') s where s->>'status'='PASS' and ((s->>'code') in ('rules','text','privacy','fraud','category','ai_text') or (s->>'code') in (select p||i from generate_series(0,image_count-1) i cross join unnest(array['image_technical_','image_semantic_','ocr_']) p)))<>expected
   or jsonb_array_length(result->'findings')<>0
   or (result->>'risk_score')::integer>=40
   or ((select require_verified_kz_phone from private.moderation_settings) and not exists(select 1 from private.seller_phone_verifications where user_id=item.owner_id))
   or not exists(select 1 from public.profiles where id=item.owner_id and status='active')
   or (item.expires_at is not null and item.expires_at<=now())) then outcome:='HUMAN_REVIEW'; end if;
 for f in select value from jsonb_array_elements(result->'findings') loop
   if length(f->>'finding_code')>80 or (f->>'finding_code') !~ '^[a-z][a-z0-9_]*$' or (f->>'evidence_summary') is distinct from (f->>'finding_code') then raise exception 'unsafe finding' using errcode='22023'; end if;
   insert into private.moderation_findings(run_id,rule_id,finding_code,source_type,image_index,severity,confidence,recommended_action,evidence_summary,user_reason_ru,user_reason_kk)
   values(job_id,(f->>'rule_id')::uuid,f->>'finding_code',f->>'source_type',(f->>'image_index')::integer,f->>'severity',(f->>'confidence')::numeric,f->>'recommended_action',f->>'evidence_summary',left(f->>'user_reason_ru',500),left(f->>'user_reason_kk',500));
 end loop;
 update private.moderation_runs set status='completed',decision=outcome,risk_score=(result->>'risk_score')::integer,
 provider=left(result->>'provider',100),provider_version=left(result->>'provider_version',100),ocr_provider=left(result->>'ocr_provider',100),ocr_version=left(result->>'ocr_version',100),
 stages=(select coalesce(jsonb_agg(jsonb_build_object('code',s->>'code','status',s->>'status','provider',left(s->>'provider',100),'version',left(s->>'version',100))),'[]') from jsonb_array_elements(result->'stages') s),
 image_results=(select coalesce(jsonb_agg(jsonb_build_object('image_index',i->'image_index','sha256',i->'sha256','perceptual_hash',null,'status',i->>'status')),'[]') from jsonb_array_elements(result->'images') i),
 completed_at=now(),error_code=case when result->>'error_code' in ('required_stage_unavailable','system_error') then result->>'error_code' else null end,claim_token=null where id=job_id;
 insert into private.moderation_image_hashes(run_id,listing_id,image_index,sha256)
 select job_id,item.id,(i->>'image_index')::integer,i->>'sha256' from jsonb_array_elements(coalesce(result->'images','[]')) i where i->>'status'='PASS' and (i->>'sha256') ~ '^[a-f0-9]{64}$';
 if outcome in ('APPROVED','REJECTED','NEEDS_FIX') then
   perform private.apply_listing_moderation(item.id,case outcome when 'APPROVED' then 'approve' when 'NEEDS_FIX' then 'needs_fix' else 'reject' end,null,case outcome when 'REJECTED' then 'policy_violation' when 'NEEDS_FIX' then 'photo_issue' else null end,null);
 end if;
 insert into public.admin_audit_log(action,entity_type,entity_id,metadata) values('moderation.completed','listing',item.id::text,jsonb_build_object('run_id',job_id,'decision',outcome,'revision',job.content_revision_hash,'ruleset',job.ruleset_version));
 return outcome;
end;
$$;
create function public.count_moderation_image_reuse(target_listing_id uuid,hashes text[]) returns integer language sql stable security definer set search_path='' as $$
 select count(distinct h.listing_id)::integer from private.moderation_image_hashes h join public.listings l on l.id=h.listing_id where h.sha256=any(hashes) and h.listing_id<>target_listing_id and l.status in ('active','pending') and l.deleted_at is null;
$$;
create function public.fail_moderation_job(job_id uuid,token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.moderation_runs set status=case when attempts>=3 then 'completed' else 'queued' end,
 decision=case when attempts>=3 then 'HUMAN_REVIEW' else null end,error_code='system_error',completed_at=case when attempts>=3 then now() else null end,
 next_attempt_at=now()+interval '30 seconds'*power(2,attempts),claim_token=null,lease_until=null where id=job_id and status='running' and claim_token=token;
end;
$$;
create function private.moderation_watchdog() returns void language plpgsql security definer set search_path='' as $$
begin
 update private.moderation_runs set status=case when attempts>=3 or created_at<now()-interval '15 minutes' then 'completed' else 'queued' end,
 decision=case when attempts>=3 or created_at<now()-interval '15 minutes' then 'HUMAN_REVIEW' else null end,
 completed_at=case when attempts>=3 or created_at<now()-interval '15 minutes' then now() else null end,error_code='system_error',claim_token=null,next_attempt_at=now()+interval '1 minute'
 where (status='running' and lease_until<now()) or (status='queued' and created_at<now()-interval '15 minutes');
 update private.listing_content_revisions set snapshot=null where purge_after<now() and snapshot is not null and not exists(select 1 from private.moderation_runs r where r.revision_id=listing_content_revisions.id and r.status in ('queued','running'));
 delete from private.seller_phone_challenges where expires_at<now()-interval '1 day';
 update private.moderation_appeals set message='[retention expired]' where resolved_at<now()-interval '90 days' and message<>'[retention expired]';
end;
$$;
-- Keep the deployed minute scheduler and existing promotion implementation intact.
alter function public.archive_expired_listings() rename to archive_expired_listings_before_moderation;
alter function public.archive_expired_listings_before_moderation() set schema private;
create function public.archive_expired_listings() returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin affected:=private.archive_expired_listings_before_moderation();perform private.moderation_watchdog();return affected;end;
$$;

create function public.get_listing_moderation(target_listing_id uuid,staff_view boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare staff boolean:=private.has_any_role(array['moderator','admin']); latest private.moderation_runs; state text; manual_decision text;
begin
 if auth.uid() is null or not exists(select 1 from public.listings where id=target_listing_id and (owner_id=auth.uid() or staff)) then raise exception 'not authorized' using errcode='42501';end if;
 select status into state from public.listings where id=target_listing_id;
 select * into latest from private.moderation_runs where listing_id=target_listing_id order by created_at desc,id desc limit 1;
 if latest.id is null then return jsonb_build_object('status',case when state='active' then 'APPROVED' when state='draft' then 'DRAFT' when state='rejected' then 'REJECTED' else 'HUMAN_REVIEW' end,'run_id',null,'reasons','[]'::jsonb);end if;
 select o.new_decision into manual_decision from private.moderation_overrides o where o.run_id=latest.id order by o.created_at desc,o.id desc limit 1;
 if staff_view and staff then return jsonb_build_object('run',to_jsonb(latest)-'claim_token'-'rules_snapshot',
 'findings',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from private.moderation_findings f where run_id=latest.id),
 'history',(select coalesce(jsonb_agg((to_jsonb(r)-'rules_snapshot'-'claim_token')||jsonb_build_object('findings',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from private.moderation_findings f where f.run_id=r.id)) order by r.created_at desc),'[]') from private.moderation_runs r where r.listing_id=target_listing_id),
 'overrides',(select coalesce(jsonb_agg(to_jsonb(o) order by created_at desc),'[]') from private.moderation_overrides o where listing_id=target_listing_id),
 'appeals',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from private.moderation_appeals a join private.moderation_runs r on r.id=a.run_id where r.listing_id=target_listing_id));end if;
 return jsonb_build_object('run_id',latest.id,'status',case when state='active' then 'APPROVED' when state='draft' then 'DRAFT' when state='rejected' and manual_decision in ('REJECT','NEEDS_FIX') then case manual_decision when 'NEEDS_FIX' then 'NEEDS_FIX' else 'REJECTED' end when latest.status in ('queued','running') then 'AUTOMATIC_MODERATION' when latest.status='stale' or state='pending' then 'HUMAN_REVIEW' else coalesce(latest.decision,'HUMAN_REVIEW') end,
 'reasons',(select coalesce(jsonb_agg(distinct jsonb_build_object('ru',user_reason_ru,'kk',user_reason_kk,'image_index',image_index)),'[]') from private.moderation_findings where run_id=latest.id and source_type<>'fraud'),
 'can_appeal',state in ('pending','rejected') and (latest.decision in ('REJECTED','NEEDS_FIX','HUMAN_REVIEW') or manual_decision in ('REJECT','NEEDS_FIX')) and not exists(select 1 from private.moderation_appeals where run_id=latest.id and owner_id=auth.uid()));
end;
$$;
create function public.appeal_listing_moderation(target_run uuid,message text) returns uuid language plpgsql security definer set search_path='' as $$
declare appeal uuid; target uuid;
begin
 if auth.uid() is null or not private.current_profile_is_active() or length(btrim(message)) not between 10 and 2000 then raise exception 'invalid appeal' using errcode='42501';end if;
 select r.listing_id into target from private.moderation_runs r join public.listings l on l.id=r.listing_id where r.id=target_run and l.owner_id=auth.uid() and l.status in ('pending','rejected') and (r.decision in ('REJECTED','NEEDS_FIX','HUMAN_REVIEW') or exists(select 1 from private.moderation_overrides o where o.run_id=r.id and o.new_decision in ('REJECT','NEEDS_FIX')));
 if target is null then raise exception 'appeal unavailable' using errcode='42501';end if;
 insert into private.moderation_appeals(run_id,owner_id,message) values(target_run,auth.uid(),btrim(message)) on conflict(run_id,owner_id) do nothing returning id into appeal;
 if appeal is null then select id into appeal from private.moderation_appeals where run_id=target_run and owner_id=auth.uid();
 else insert into public.admin_audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'moderation.appeal','listing',target::text);end if;
 return appeal;
end;
$$;
create function public.resolve_moderation_appeal(target_appeal uuid,resolution text,reason text) returns void language plpgsql security definer set search_path='' as $$
declare target uuid; old_hash text; new_run uuid;
begin
 if not private.has_any_role(array['moderator','admin']) then raise exception 'staff required' using errcode='42501';end if;
 if resolution not in ('upheld','overturned') or nullif(btrim(reason),'') is null or length(reason)>2000 then raise exception 'reason required' using errcode='22023';end if;
 update private.moderation_appeals set status=resolve_moderation_appeal.resolution,reviewer=auth.uid(),resolution=reason,resolved_at=now() where id=target_appeal and status='open';
 if not found then raise exception 'appeal closed' using errcode='22023';end if;
 if resolve_moderation_appeal.resolution='overturned' then
  select r.listing_id,r.content_revision_hash into target,old_hash from private.moderation_appeals a join private.moderation_runs r on r.id=a.run_id where a.id=target_appeal;
  perform 1 from public.listings where id=target for update;
  if private.moderation_hash(private.moderation_content(target))=old_hash then
   update public.listings set status='pending' where id=target and status='rejected' and deleted_at is null;
   if found then update private.moderation_runs set status='stale',claim_token=null,completed_at=now() where listing_id=target and status in ('queued','running');new_run:=private.enqueue_moderation(target,true);update private.moderation_runs set status='completed',decision='HUMAN_REVIEW',completed_at=now(),error_code='appeal_overturned' where id=new_run;end if;
  end if;
 end if;
 insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'moderation.appeal_resolved','appeal',target_appeal::text,jsonb_build_object('resolution',resolution));
end;
$$;

-- Reuse reports; serialize identical complaints without deleting historical rows.
revoke insert on public.reports from authenticated;
revoke insert (reporter_id,listing_id,reported_user_id,reason_code,details) on public.reports from authenticated;
create index if not exists reports_moderation_dedup on public.reports(reporter_id,listing_id,reason_code);
create function public.report_listing(target_listing_id uuid,reason text,details text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare report uuid;
begin
 if auth.uid() is null or not private.current_profile_is_active() then raise exception 'active account required' using errcode='42501';end if;
 if reason not in ('listing.spam','listing.fraud','listing.prohibited','listing.inaccurate','listing.stolen_photos','listing.counterfeit','listing.personal_data','listing.other') or length(details)>4000 then raise exception 'invalid report' using errcode='22023';end if;
 if not exists(select 1 from public.listings where id=target_listing_id and status='active' and deleted_at is null and owner_id<>auth.uid() and expires_at>now()) then raise exception 'listing unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||target_listing_id::text||reason,40));
 select id into report from public.reports where reporter_id=auth.uid() and listing_id=target_listing_id and reason_code=reason order by created_at desc limit 1;
 if report is not null then return report;end if;
 if (select count(*) from public.reports where reporter_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'report rate limit' using errcode='22023';end if;
 insert into public.reports(reporter_id,listing_id,reason_code,details) values(auth.uid(),target_listing_id,reason,details) returning id into report;
 insert into public.admin_audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'report.created','report',report::text);
 return report;
end;
$$;
create function private.recheck_confirmed_report() returns trigger language plpgsql security definer set search_path='' as $$
declare run uuid;
begin
 if new.status='resolved' and old.status<>'resolved' and new.reason_code in ('listing.fraud','listing.prohibited','listing.personal_data','listing.counterfeit') then
  update public.listings set status='pending' where id=new.listing_id and status='active' and deleted_at is null;
  if found then
   update private.moderation_runs set status='stale',completed_at=now(),claim_token=null where listing_id=new.listing_id and status in ('queued','running');
   run:=private.enqueue_moderation(new.listing_id,true);
   update private.moderation_runs set status='completed',decision='HUMAN_REVIEW',completed_at=now(),error_code='confirmed_report' where id=run;
  end if;
 end if;return new;
end;
$$;
create trigger moderation_confirmed_report after update of status on public.reports for each row execute function private.recheck_confirmed_report();

create function public.moderation_admin(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_version text:=payload->>'version'; target uuid; current_status text;
begin
 if not private.has_any_role(array['moderator','admin']) then raise exception 'staff required' using errcode='42501';end if;
 if operation='queue' then return jsonb_build_object('appeals',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('listing_id',r.listing_id)),'[]') from private.moderation_appeals a join private.moderation_runs r on r.id=a.run_id where a.status='open'),
 'reports',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select * from public.reports where status in ('open','in_review') order by created_at limit 100) r),
 'metrics',(select jsonb_build_object('runs_total',count(*),'approved',count(*) filter(where decision='APPROVED'),'rejected',count(*) filter(where decision='REJECTED'),'needs_fix',count(*) filter(where decision='NEEDS_FIX'),'human_review',count(*) filter(where decision='HUMAN_REVIEW'),'provider_error',count(*) filter(where error_code is not null),'average_processing_ms',avg(extract(epoch from(completed_at-started_at))*1000),'retries',coalesce(sum(greatest(0,attempts-1)),0)) from private.moderation_runs where created_at>now()-interval '30 days'),
 'rules_triggered',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from (select finding_code,count(*) total from private.moderation_findings where created_at>now()-interval '30 days' group by finding_code) f),
 'appeal_count',(select count(*) from private.moderation_appeals),'override_count',(select count(*) from private.moderation_overrides));end if;
 if not private.has_any_role(array['admin']) then raise exception 'admin required' using errcode='42501';end if;
 if operation='view' then return jsonb_build_object('rulesets',(select jsonb_agg(to_jsonb(s) order by created_at desc) from private.moderation_rulesets s),
 'rules',(select jsonb_agg(to_jsonb(r) order by ruleset_version,priority,code) from private.moderation_rules r),
 'settings',(select to_jsonb(s) from private.moderation_settings s),'history',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from (select actor_id,action,metadata,created_at from public.admin_audit_log where action like 'moderation.rules%' order by created_at desc limit 100) a));end if;
 if nullif(btrim(payload->>'reason'),'') is null or length(payload->>'reason')>1000 then raise exception 'change reason required' using errcode='22023';end if;
 if operation='clone' then
  insert into private.moderation_rulesets(version,status,created_by) values(selected_version,'draft',auth.uid());
  insert into private.moderation_rules(code,jurisdiction,title_ru,title_kk,description_ru,description_kk,rule_type,scope,applicable_categories,severity,action,enabled,priority,config,legal_status,legal_basis,legal_source_title,legal_source_reference,effective_from,effective_to,ruleset_version)
  select code,jurisdiction,title_ru,title_kk,description_ru,description_kk,rule_type,scope,applicable_categories,severity,action,enabled,priority,config,legal_status,legal_basis,legal_source_title,legal_source_reference,effective_from,effective_to,selected_version from private.moderation_rules where ruleset_version=(select s.version from private.moderation_rulesets s where status='active');
 elsif operation='edit' then
  select status into current_status from private.moderation_rulesets s where s.version=selected_version for update;
  if current_status is distinct from 'draft' then raise exception 'draft ruleset required' using errcode='22023';end if;
  update private.moderation_rules set enabled=coalesce((payload->>'enabled')::boolean,enabled),action=coalesce(payload->>'action',action),config=coalesce(payload->'config',config),
   effective_from=coalesce((payload->>'effective_from')::timestamptz,effective_from),effective_to=case when payload?'effective_to' then (payload->>'effective_to')::timestamptz else effective_to end,updated_at=now()
  where ruleset_version=selected_version and code=payload->>'code';
  if not found then raise exception 'rule unavailable' using errcode='22023';end if;
 elsif operation='review' then
  update private.moderation_rulesets s set status='reviewed',reviewed_by=auth.uid() where s.version=selected_version and status='draft';if not found then raise exception 'draft required';end if;
 elsif operation='activate' then
  perform pg_advisory_xact_lock(400040);
  perform 1 from private.moderation_rulesets s where s.version=selected_version and status='reviewed' for update;if not found then raise exception 'reviewed version required';end if;
  update private.moderation_rulesets set status='retired' where status='active';update private.moderation_rulesets s set status='active',activated_at=now() where s.version=selected_version;
 elsif operation='settings' then
  update private.moderation_settings set auto_approve=coalesce((payload->>'auto_approve')::boolean,auto_approve),require_verified_kz_phone=coalesce((payload->>'require_verified_kz_phone')::boolean,require_verified_kz_phone),updated_at=now();
 elsif operation='rerun' then
  target:=(payload->>'listing_id')::uuid;
  perform 1 from public.listings where id=target and status='pending' for update;if not found then raise exception 'pending listing required';end if;
  update private.moderation_runs set status='stale',claim_token=null,completed_at=now() where listing_id=target and status in ('queued','running');perform private.enqueue_moderation(target,true);
 else raise exception 'invalid operation' using errcode='22023';end if;
 insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'moderation.rules_'||operation,'moderation_ruleset',selected_version,payload);
 return jsonb_build_object('ok',true);
end;
$$;

create function public.get_seller_verification() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if auth.uid() is null then raise exception 'auth required' using errcode='42501';end if;
 return jsonb_build_object('verified',exists(select 1 from private.seller_phone_verifications where user_id=auth.uid()),'required',(select require_verified_kz_phone from private.moderation_settings));end;
$$;
create function public.seller_phone_challenge(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare challenge private.seller_phone_challenges; target uuid:=(payload->>'user_id')::uuid;
begin
 if not exists(select 1 from public.profiles where id=target and status='active') then raise exception 'active user required' using errcode='42501';end if;
 if operation='create' then
  perform pg_advisory_xact_lock(hashtextextended(target::text,41));
  if (select count(*) from private.seller_phone_challenges where user_id=target and created_at>now()-interval '1 hour')>=3 then raise exception 'phone rate limit' using errcode='22023';end if;
  insert into private.seller_phone_challenges(user_id,phone_e164,provider,provider_reference,expires_at) values(target,payload->>'phone',payload->>'provider',payload->>'reference',now()+interval '5 minutes') returning * into challenge;
 elsif operation in ('attempt','verified') then
  select * into challenge from private.seller_phone_challenges where id=(payload->>'id')::uuid and user_id=target and expires_at>now() and consumed_at is null for update;
  if challenge.id is null or (operation='attempt' and challenge.attempts>=5) or (operation='verified' and challenge.attempts not between 1 and 5) then raise exception 'challenge expired' using errcode='22023';end if;
  if operation='attempt' then update private.seller_phone_challenges set attempts=attempts+1 where id=challenge.id;
  else
   insert into private.seller_phone_verifications(user_id,phone_e164,provider,provider_reference,verified_at) values(target,challenge.phone_e164,challenge.provider,challenge.provider_reference,now())
   on conflict(user_id) do update set phone_e164=excluded.phone_e164,provider=excluded.provider,provider_reference=excluded.provider_reference,verified_at=excluded.verified_at;
   update private.seller_phone_challenges set consumed_at=now() where id=challenge.id;
  end if;
 else raise exception 'invalid operation' using errcode='22023';end if;
 return jsonb_build_object('id',challenge.id,'reference',challenge.provider_reference,'provider',challenge.provider,'phone',challenge.phone_e164);
end;
$$;

insert into private.moderation_rulesets(version,status,activated_at) values('kz-policy-2026-09-26.1','active',now());
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('drugs','Наркотики и психотропные вещества','Есірткі және психотроптық заттар','Наркотики и психотропные вещества','Есірткі және психотроптық заттар','semantic_and_offer','critical','REJECTED','{"terms": ["наркотик", "есірткі", "героин", "кокаин", "мефедрон", "marijuana", "kokain"], "observation": "drugs", "explicit_offers": ["продам наркотики", "продам мефедрон", "есірткі сатамын", "героин сатамын"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: Z980000279_','https://adilet.zan.kz/rus/docs/Z980000279_','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('illegal_precursors','Прекурсоры для незаконного оборота','Заңсыз айналымға арналған прекурсорлар','Прекурсоры для незаконного оборота','Заңсыз айналымға арналған прекурсорлар','semantic_and_offer','critical','REJECTED','{"terms": ["прекурсор", "precursor"], "observation": "illegal_precursors", "explicit_offers": ["прекурсоры для изготовления наркотиков"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: Z980000279_','https://adilet.zan.kz/rus/docs/Z980000279_','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('vape','Вейпы, жидкости и ароматизаторы','Вейптер, сұйықтықтар және хош иістендіргіштер','Вейпы, жидкости и ароматизаторы','Вейптер, сұйықтықтар және хош иістендіргіштер','semantic_and_offer','critical','REJECTED','{"terms": ["вейп", "vape", "электронды темекі", "сұйықтық вейп", "электронная сигарета"], "observation": "vape", "explicit_offers": ["продам вейп", "продаю вейп", "вейп сатылады", "вейп сатамын", "vape for sale", "жидкость для вейпа продам"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: K2000000360','https://adilet.zan.kz/rus/docs/K2000000360','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('tobacco','Табачная продукция','Темекі өнімдері','Табачная продукция','Темекі өнімдері','semantic_and_offer','critical','REJECTED','{"terms": ["табак", "сигарет", "темекі", "tobacco"], "observation": "tobacco", "explicit_offers": ["продам сигареты", "продам табак", "темекі сатамын", "темекі сатылады"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: K2000000360','https://adilet.zan.kz/rus/docs/K2000000360','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('nicotine','Никотинсодержащая продукция','Құрамында никотин бар өнімдер','Никотинсодержащая продукция','Құрамында никотин бар өнімдер','semantic_and_offer','critical','REJECTED','{"terms": ["никотин", "nicotine", "снюс"], "observation": "nicotine", "explicit_offers": ["продам снюс", "продам никотин", "никотин сатамын"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: K2000000360','https://adilet.zan.kz/rus/docs/K2000000360','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('weapon','Оружие','Қару','Оружие','Қару','semantic_and_offer','critical','REJECTED','{"terms": ["оруж", "пистолет", "мылтық", "қару", "weapon", "gun"], "observation": "weapon", "explicit_offers": ["продам боевой пистолет", "продам огнестрельное оружие", "атыс қаруын сатамын"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: Z980000339_','https://adilet.zan.kz/rus/docs/Z980000339_','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('ammunition','Боеприпасы','Оқ-дәрілер','Боеприпасы','Оқ-дәрілер','semantic_and_offer','critical','REJECTED','{"terms": ["боеприпас", "патрон", "оқ-дәрі", "оқ дәрі", "ammunition"], "observation": "ammunition", "explicit_offers": ["продам боеприпасы", "оқ-дәрі сатамын"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: Z980000339_','https://adilet.zan.kz/rus/docs/Z980000339_','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('explosive','Взрывчатка и опасные компоненты','Жарылғыш заттар мен қауіпті компоненттер','Взрывчатка и опасные компоненты','Жарылғыш заттар мен қауіпті компоненттер','semantic_and_offer','critical','REJECTED','{"terms": ["взрывчат", "взрывател", "жарылғыш", "explosive", "детонатор"], "observation": "explosive", "explicit_offers": ["продам взрывчатку", "жарылғыш зат сатамын"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: Z980000339_','https://adilet.zan.kz/rus/docs/Z980000339_','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('forged_document','Поддельные документы','Жалған құжаттар','Поддельные документы','Жалған құжаттар','semantic_and_offer','critical','REJECTED','{"terms": ["поддельн", "фиктивн", "жалған құжат", "fake passport"], "observation": "forged_document", "explicit_offers": ["продам поддельный паспорт", "сделаю поддельный паспорт", "жалған құжат сатамын"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: K1400000226','https://adilet.zan.kz/rus/docs/K1400000226','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('stolen_payment_data','Украденные платёжные данные','Ұрланған төлем деректері','Украденные платёжные данные','Ұрланған төлем деректері','semantic_and_offer','critical','REJECTED','{"terms": ["украденные карты", "данные карт", "ұрланған карта", "stolen card"], "observation": "stolen_payment_data", "explicit_offers": ["продам украденные карты", "stolen cards for sale"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: K1400000226','https://adilet.zan.kz/rus/docs/K1400000226','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('illegal_service','Явно незаконные услуги','Айқын заңсыз қызметтер','Явно незаконные услуги','Айқын заңсыз қызметтер','semantic_and_offer','critical','REJECTED','{"terms": ["взлом аккаунт", "заказное убийство", "аккаунт бұзу"], "observation": "illegal_service", "explicit_offers": ["взломаю чужой аккаунт за деньги", "заказное убийство"]}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: K1400000226','https://adilet.zan.kz/rus/docs/K1400000226','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('regulated','Регулируемые товары — ручная проверка','Реттелетін тауарлар — қолмен тексеру','Регулируемые товары — ручная проверка','Реттелетін тауарлар — қолмен тексеру','semantic_and_offer','high','HUMAN_REVIEW','{"terms": ["лекарств", "дәрі-дәрмек", "алкогол", "ішімдік", "пестицид", "редкое животное"], "observation": "regulated", "explicit_offers": []}','LEGAL_REVIEW_REQUIRED','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: Z040000544_','https://adilet.zan.kz/rus/docs/Z040000544_','kz-policy-2026-09-26.1');
insert into private.moderation_rules(code,title_ru,title_kk,description_ru,description_kk,rule_type,severity,action,config,legal_status,legal_basis,legal_source_title,legal_source_reference,ruleset_version) values('adult_content','Контент для взрослых — ручная проверка','Ересектерге арналған контент — қолмен тексеру','Контент для взрослых — ручная проверка','Ересектерге арналған контент — қолмен тексеру','semantic_and_offer','critical','HUMAN_REVIEW','{"terms": ["порнограф", "порнография"], "observation": "adult_content", "explicit_offers": []}','JEVU_POLICY','Internal JEVU policy; legal applicability reviewed separately. Source is contextual, not a claim every matching item is illegal.','Әділет: Z030000508_','https://adilet.zan.kz/rus/docs/Z030000508_','kz-policy-2026-09-26.1');

-- Explicit RPC allowlists; no default PUBLIC execution survives this migration.
revoke all on function private.clear_moderation_identity(),private.moderation_content(uuid),private.moderation_hash(jsonb),private.enqueue_moderation(uuid,boolean),private.capture_moderation_submission(),private.apply_listing_moderation(uuid,text,uuid,text,text),private.lock_moderation_content(),private.moderation_watchdog(),private.archive_expired_listings_before_moderation(),private.recheck_confirmed_report() from public,anon,authenticated,service_role;
revoke all on function public.count_moderation_image_reuse(uuid,text[]),public.claim_moderation_job(),public.finish_moderation_job(uuid,uuid,jsonb),public.fail_moderation_job(uuid,uuid),public.seller_phone_challenge(text,jsonb),public.archive_expired_listings() from public,anon,authenticated,service_role;
grant execute on function public.count_moderation_image_reuse(uuid,text[]),public.claim_moderation_job(),public.finish_moderation_job(uuid,uuid,jsonb),public.fail_moderation_job(uuid,uuid),public.seller_phone_challenge(text,jsonb),public.archive_expired_listings() to service_role;
revoke all on function public.get_listing_moderation(uuid,boolean),public.appeal_listing_moderation(uuid,text),public.resolve_moderation_appeal(uuid,text,text),public.report_listing(uuid,text,text),public.moderation_admin(text,jsonb),public.get_seller_verification(),public.moderate_listing(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_listing_moderation(uuid,boolean),public.appeal_listing_moderation(uuid,text),public.resolve_moderation_appeal(uuid,text,text),public.report_listing(uuid,text,text),public.moderation_admin(text,jsonb),public.get_seller_verification(),public.moderate_listing(uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
