-- Shadow observations are private evidence, never publication authority.
begin;
set local lock_timeout='5s';
alter table private.moderation_runs add column shadow_result jsonb;
alter table private.moderation_runs add column ai_calls jsonb not null default '[]' check(jsonb_typeof(ai_calls)='array' and jsonb_array_length(ai_calls)<=2);
alter table private.moderation_settings add column shadow_daily_call_limit integer not null default 50 check(shadow_daily_call_limit between 0 and 1000);
update private.moderation_settings set auto_approve=false;
alter table private.moderation_settings add constraint moderation_shadow_no_auto_approve check(not auto_approve);
alter table private.moderation_image_hashes add column perceptual_hash text check(perceptual_hash ~ '^[a-f0-9]{16}$');
alter table private.moderation_image_hashes add column algorithm text check(algorithm='dhash64-v1');
alter table private.moderation_image_hashes add constraint moderation_hash_pair check((perceptual_hash is null)=(algorithm is null));
-- Four indexed 16-bit bands guarantee a candidate for distance <=3. A bounded
-- candidate sample prevents low-entropy photos from making a large scan.
create index moderation_hash_band1 on private.moderation_image_hashes(algorithm,substring(perceptual_hash,1,4)) where perceptual_hash is not null;
create index moderation_hash_band2 on private.moderation_image_hashes(algorithm,substring(perceptual_hash,5,4)) where perceptual_hash is not null;
create index moderation_hash_band3 on private.moderation_image_hashes(algorithm,substring(perceptual_hash,9,4)) where perceptual_hash is not null;
create index moderation_hash_band4 on private.moderation_image_hashes(algorithm,substring(perceptual_hash,13,4)) where perceptual_hash is not null;

create function private.sanitize_moderation_shadow(value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare f jsonb; findings jsonb:='[]'; subjects jsonb:='[]'; langs jsonb;
begin
 if value is null then return null;end if;
 if value->>'schema_version' is distinct from 'moderation-ai-observation-v1' or value->>'mode' is distinct from 'shadow'
 or coalesce(value->>'status','') not in ('success','timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','content_unavailable','configuration_missing','provider_4xx','budget_exhausted','disabled','not_eligible')
 or coalesce(value->>'recommendation','') not in ('SHADOW_APPROVE','SHADOW_REJECT','SHADOW_NEEDS_FIX','SHADOW_HUMAN_REVIEW')
 or jsonb_typeof(value->'findings') is distinct from 'array' or jsonb_array_length(value->'findings')>100
 or jsonb_typeof(value->'languages') is distinct from 'array' or jsonb_array_length(value->'languages')>4
 or coalesce(value->>'ocr_images','') !~ '^[0-7]$' then raise exception 'invalid shadow result' using errcode='22023';end if;
 if (value->>'uncertainty')::numeric not between 0 and 1 then raise exception 'invalid uncertainty';end if;
 if exists(select 1 from jsonb_array_elements_text(value->'languages') l where l not in ('ru','kk','en','other')) then raise exception 'invalid languages';end if;
 langs:=value->'languages';
 if jsonb_typeof(value->'subjects') is distinct from 'array' or jsonb_array_length(value->'subjects')>7 then raise exception 'invalid image subjects';end if;
 for f in select * from jsonb_array_elements(value->'subjects') loop
  if coalesce(f->>'object_type','') not in ('vehicle','phone','furniture','document','weapon_like','vape_like','other','uncertain') or coalesce(f->>'image_index','') !~ '^[0-6]$' or f->>'confidence' is null or (f->>'confidence')::numeric not between 0 and 1 then raise exception 'invalid image subject';end if;
  subjects:=subjects||jsonb_build_array(jsonb_build_object('image_index',(f->>'image_index')::integer,'object_type',f->>'object_type','confidence',(f->>'confidence')::numeric));
 end loop;
 for f in select * from jsonb_array_elements(value->'findings') loop
  if coalesce(f->>'code','') !~ '^[a-z][a-z0-9_]{0,79}$' or coalesce(f->>'source','') not in ('text','image','ocr','fraud','category')
  or coalesce(f->>'action','') not in ('SHADOW_APPROVE','SHADOW_REJECT','SHADOW_NEEDS_FIX','SHADOW_HUMAN_REVIEW')
  or (f->>'image_index')::integer not between 0 and 6 or (f->>'confidence')::numeric not between 0 and 1
  or (f->>'rule_code' is not null and f->>'rule_code' !~ '^[a-z][a-z0-9_]{0,79}$') then raise exception 'unsafe shadow finding';end if;
  -- Never retain model prose, raw OCR, URLs, prompts or unknown fields.
  findings:=findings||jsonb_build_array(jsonb_build_object('code',f->>'code','source',f->>'source','image_index',(f->>'image_index')::integer,'confidence',(f->>'confidence')::numeric,'action',f->>'action','rule_code',f->>'rule_code','reason',f->>'code'));
 end loop;
 return jsonb_build_object('schema_version','moderation-ai-observation-v1','mode','shadow','status',value->>'status','recommendation',case when value->>'status'='success' then value->>'recommendation' else 'SHADOW_HUMAN_REVIEW' end,'findings',findings,'subjects',subjects,'ocr_images',(value->>'ocr_images')::integer,'languages',langs,'uncertainty',(value->>'uncertainty')::numeric);
end;
$$;

create function public.moderation_shadow_job(operation text,job_id uuid,token uuid,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.moderation_runs; n integer; calls jsonb; entry jsonb; hash text:=payload->>'perceptual_hash'; exact_count integer; similar_count integer; attempt integer;
begin
 -- Same lock order as completion/content editing; old revisions cannot spend.
 perform 1 from public.listings l join private.moderation_runs r on r.listing_id=l.id where r.id=job_id for update of l;
 select * into job from private.moderation_runs where id=job_id for update;
 if job.id is null or job.status<>'running' or job.claim_token is distinct from token or job.lease_until<clock_timestamp()
 or not exists(select 1 from public.listings where id=job.listing_id and status='pending' and deleted_at is null)
 or private.moderation_hash(private.moderation_content(job.listing_id))<>job.content_revision_hash then return null;end if;
 if operation='reserve' then
  if payload->>'eligible_since' is null or job.created_at<(payload->>'eligible_since')::timestamptz or coalesce(payload->>'model','') !~ '^[-a-zA-Z0-9_.]{1,100}$' then return null;end if;
  perform pg_advisory_xact_lock(410041); -- Global cost cap, not per Worker isolate.
  n:=jsonb_array_length(job.ai_calls);if n>=2 then return null;end if;
  if (select count(*) from private.moderation_runs r cross join lateral jsonb_array_elements(r.ai_calls) c where r.created_at>now()-interval '2 days' and (c->>'created_at')::timestamptz>now()-interval '1 day') >= (select shadow_daily_call_limit from private.moderation_settings) then return null;end if;
  update private.moderation_runs set ai_calls=ai_calls||jsonb_build_array(jsonb_build_object('provider','openai','model',payload->>'model','schema_version','moderation-ai-observation-v1','status','started','retry_count',n,'created_at',clock_timestamp())) where id=job_id;
  return to_jsonb(n+1);
 elsif operation='record' then
  attempt:=(payload->>'attempt')::integer;
  if attempt is null or attempt not between 1 and jsonb_array_length(job.ai_calls) then raise exception 'invalid attempt';end if;
  entry:=job.ai_calls->(attempt-1);if entry->>'status'<>'started' then return 'false';end if;
  if coalesce(payload->>'status','') not in ('success','timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','content_unavailable','configuration_missing','provider_4xx')
   or coalesce(payload->>'latency_ms','') !~ '^[0-9]{1,7}$' or coalesce(payload->>'image_count','') !~ '^[0-7]$'
   or (payload->>'input_tokens')::integer not between 0 and 5000000 or (payload->>'output_tokens')::integer not between 0 and 100000 then raise exception 'invalid provider metadata';end if;
  entry:=entry||jsonb_build_object('status',payload->>'status','latency_ms',(payload->>'latency_ms')::integer,'image_count',(payload->>'image_count')::integer,'input_tokens',(payload->>'input_tokens')::integer,'output_tokens',(payload->>'output_tokens')::integer,'request_id',case when payload->>'request_id' ~ '^[a-zA-Z0-9_-]{1,160}$' then payload->>'request_id' else null end);
  calls:=jsonb_set(job.ai_calls,array[(attempt-1)::text],entry);update private.moderation_runs set ai_calls=calls where id=job_id;return 'true';
 elsif operation='similar' then
  if coalesce(payload->>'sha256','') !~ '^[a-f0-9]{64}$' or (hash is not null and (hash !~ '^[a-f0-9]{16}$' or payload->>'algorithm' is distinct from 'dhash64-v1')) then raise exception 'invalid image hash';end if;
  select count(*) into exact_count from (select h.listing_id from private.moderation_image_hashes h join public.listings l on l.id=h.listing_id where h.sha256=payload->>'sha256' and h.listing_id<>job.listing_id and l.status in ('active','pending') and l.deleted_at is null limit 200) candidates;
  select count(*) into similar_count from (
   (select listing_id,perceptual_hash from private.moderation_image_hashes where algorithm='dhash64-v1' and substring(perceptual_hash,1,4)=substring(hash,1,4) and listing_id<>job.listing_id limit 200)
   union (select listing_id,perceptual_hash from private.moderation_image_hashes where algorithm='dhash64-v1' and substring(perceptual_hash,5,4)=substring(hash,5,4) and listing_id<>job.listing_id limit 200)
   union (select listing_id,perceptual_hash from private.moderation_image_hashes where algorithm='dhash64-v1' and substring(perceptual_hash,9,4)=substring(hash,9,4) and listing_id<>job.listing_id limit 200)
   union (select listing_id,perceptual_hash from private.moderation_image_hashes where algorithm='dhash64-v1' and substring(perceptual_hash,13,4)=substring(hash,13,4) and listing_id<>job.listing_id limit 200)
  ) h join public.listings l on l.id=h.listing_id where l.status in ('active','pending') and l.deleted_at is null and bit_count(('x'||h.perceptual_hash)::bit(64)#('x'||hash)::bit(64))<=3;
  return jsonb_build_object('exact',exact_count,'perceptual',similar_count);
 end if;
 raise exception 'invalid shadow operation';
end;
$$;

alter function public.finish_moderation_job(uuid,uuid,jsonb) rename to finish_moderation_job_before_shadow;
alter function public.finish_moderation_job_before_shadow(uuid,uuid,jsonb) set schema private;
create function public.finish_moderation_job(job_id uuid,token uuid,result jsonb) returns text language plpgsql security definer set search_path='' as $$
declare outcome text; safe_shadow jsonb; image jsonb;
begin
 -- No configuration or claimed AI confidence can opt this release into approval.
 if result->>'decision'='APPROVED' then result:=jsonb_set(result,'{decision}','"HUMAN_REVIEW"');end if;
 if result->>'decision'='REJECTED' and not exists(
  select 1 from jsonb_array_elements(result->'findings') f join private.moderation_rules r on r.id=(f->>'rule_id')::uuid
  join private.moderation_runs job on job.id=job_id and job.ruleset_version=r.ruleset_version
  where f->>'source_type'='text' and f->>'recommended_action'='REJECTED' and f->>'finding_code'=r.code and (f->>'confidence')::numeric=1 and r.legal_status='JEVU_POLICY' and r.action='REJECTED'
 ) then result:=jsonb_set(result,'{decision}','"HUMAN_REVIEW"');end if;
 outcome:=private.finish_moderation_job_before_shadow(job_id,token,result);
 if outcome in ('ignored','stale') then return outcome;end if;
 safe_shadow:=private.sanitize_moderation_shadow(result->'shadow');
 update private.moderation_runs set shadow_result=safe_shadow where id=job_id;
 for image in select * from jsonb_array_elements(result->'images') loop
  if image->>'perceptual_hash' ~ '^[a-f0-9]{16}$' and image->>'algorithm'='dhash64-v1' then
   update private.moderation_image_hashes set perceptual_hash=image->>'perceptual_hash',algorithm='dhash64-v1' where run_id=job_id and image_index=(image->>'image_index')::integer;
  end if;
 end loop;
 return outcome;
end;
$$;

alter function public.moderation_admin(text,jsonb) rename to moderation_admin_before_shadow;
alter function public.moderation_admin_before_shadow(text,jsonb) set schema private;
create function public.moderation_admin(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare output jsonb; metrics jsonb;
begin
 if not private.has_any_role(array['moderator','admin']) then raise exception 'staff required' using errcode='42501';end if;
 if operation='settings' and (payload->>'auto_approve')::boolean then raise exception 'automatic approval disabled during shadow evaluation' using errcode='42501';end if;
 output:=private.moderation_admin_before_shadow(operation,payload); -- existing staff/admin authorization
 if operation='queue' then
  with runs as (select * from private.moderation_runs where created_at>now()-interval '30 days'),
  calls as (select c from runs cross join lateral jsonb_array_elements(ai_calls) c),
  compared as (select r.shadow_result->>'recommendation' shadow,case o.new_decision when 'APPROVE' then 'SHADOW_APPROVE' when 'REJECT' then 'SHADOW_REJECT' when 'NEEDS_FIX' then 'SHADOW_NEEDS_FIX' end human from runs r cross join lateral (select new_decision from private.moderation_overrides where run_id=r.id and new_decision in ('APPROVE','REJECT','NEEDS_FIX') order by created_at desc,id desc limit 1) o where r.shadow_result->>'status'='success')
  select jsonb_build_object('ai_calls_total',(select count(*) from calls),'ai_success',(select count(*) from calls where c->>'status'='success'),
  'ai_errors',(select coalesce(jsonb_object_agg(status,n),'{}') from (select c->>'status' status,count(*) n from calls where c->>'status'<>'success' group by 1) e),
  'average_latency_ms',(select avg((c->>'latency_ms')::numeric) from calls),'input_tokens',(select sum((c->>'input_tokens')::bigint) from calls),'output_tokens',(select sum((c->>'output_tokens')::bigint) from calls),'images_analyzed',(select sum((c->>'image_count')::integer) from calls where c->>'status'='success'),
  'ocr_images',(select sum((shadow_result->>'ocr_images')::integer) from runs),'perceptual_duplicate_signals',(select count(*) from runs cross join lateral jsonb_array_elements(shadow_result->'findings') f where f->>'code'='duplicate_or_reused_image'),
  'shadow_recommendations',(select coalesce(jsonb_object_agg(decision,n),'{}') from (select shadow_result->>'recommendation' decision,count(*) n from runs where shadow_result is not null group by 1) s),
  'total_evaluated',(select count(*) from compared),'ai_human_agreement',(select count(*) from compared where shadow=human),'human_overrides',(select count(*) from compared where shadow<>human),
  'confusion_matrix',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from (select shadow,human,count(*) n from compared group by shadow,human) m)) into metrics;
  output:=jsonb_set(output,'{metrics}',(output->'metrics')||metrics);
 end if;
 return output;
end;
$$;

revoke all on function private.sanitize_moderation_shadow(jsonb),private.finish_moderation_job_before_shadow(uuid,uuid,jsonb),private.moderation_admin_before_shadow(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.moderation_shadow_job(text,uuid,uuid,jsonb),public.finish_moderation_job(uuid,uuid,jsonb),public.moderation_admin(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.moderation_shadow_job(text,uuid,uuid,jsonb),public.finish_moderation_job(uuid,uuid,jsonb) to service_role;
grant execute on function public.moderation_admin(text,jsonb) to authenticated;

-- New jobs identify the changed engine; historical runs remain immutable.
create or replace function private.enqueue_moderation(target uuid,force_new boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
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
 select coalesce(max(generation),0) into gen from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-2';
 if force_new then gen:=gen+1; end if;
 insert into private.moderation_runs(listing_id,revision_id,content_revision_hash,generation,engine_version,ruleset_version,rules_snapshot)
 values(target,rev,hash,gen,'jevu-moderation-2',version,rules) on conflict do nothing returning id into run;
 if run is null then select id into run from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-2' and generation=gen; end if;
 return run;
end;
$$;
create or replace function public.claim_moderation_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.moderation_runs; owner uuid; snap jsonb; fingerprint text; token uuid:=gen_random_uuid();
begin
 select * into job from private.moderation_runs where status='queued' and next_attempt_at<=now() order by next_attempt_at,created_at limit 1 for update skip locked;
 if job.id is null then return null; end if;
 update private.moderation_runs set status='running',attempts=attempts+1,started_at=coalesce(started_at,now()),lease_until=now()+interval '180 seconds',claim_token=token where id=job.id;
 select snapshot,content_fingerprint into snap,fingerprint from private.listing_content_revisions where id=job.revision_id;
 select owner_id into owner from public.listings where id=job.listing_id;
 return jsonb_build_object('id',job.id,'listing_id',job.listing_id,'claim_token',token,'content_revision_hash',job.content_revision_hash,'ruleset_version',job.ruleset_version,
 'created_at',job.created_at,'snapshot',snap,'rules',job.rules_snapshot,'auto_approve',(select auto_approve from private.moderation_settings),
 'fraud',jsonb_build_object('recent_submissions',(select count(*) from private.moderation_runs r join public.listings l on l.id=r.listing_id where l.owner_id=owner and r.created_at>now()-interval '1 hour'),
 'prior_rejections',(select count(*) from private.moderation_runs r join public.listings l on l.id=r.listing_id where l.owner_id=owner and r.decision='REJECTED' and r.created_at>now()-interval '30 days'),
 'confirmed_reports',(select count(*) from public.reports r join public.listings l on l.id=r.listing_id where l.owner_id=owner and r.status='resolved' and r.created_at>now()-interval '90 days'),
 'duplicate_content',(select count(distinct r.listing_id) from private.listing_content_revisions r join public.listings l on l.id=r.listing_id where r.content_fingerprint=fingerprint and r.listing_id<>job.listing_id and l.owner_id=owner and l.status in ('pending','active')),
 'reused_images',0));
end;
$$;

commit;
