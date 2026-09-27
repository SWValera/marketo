-- Staff action receipts + revision metadata; bounded reads and technical retry.
-- No role/flag/ruleset changes, backfill, content edits or publication.
begin;
set local lock_timeout='5s';
alter table private.moderation_overrides add column request_id uuid;
alter table private.moderation_overrides add column content_revision_hash text check(content_revision_hash ~ '^[a-f0-9]{64}$');
create unique index moderation_override_request on private.moderation_overrides(moderator_id,request_id) where request_id is not null;


create or replace function public.moderate_listing(target_listing_id uuid,decision text,reason_code text default null,note text default null) returns void
language plpgsql security definer set search_path='' as $$
declare run private.moderation_runs; normalized_note text:=nullif(btrim(note),''); normalized_reason text:=nullif(btrim(reason_code),'');
begin
 if auth.uid() is null or not private.has_any_role(array['moderator','admin']) then raise exception 'moderator role required' using errcode='42501'; end if;
 if decision is null or decision not in ('approve','reject','needs_fix','hide','restore') then raise exception 'invalid moderation input' using errcode='22023'; end if;
 if length(normalized_note)>2000 then raise exception 'moderation note is too long' using errcode='22023';end if;
 if normalized_reason is not null and normalized_reason not in ('incomplete_information','wrong_category','duplicate','photo_issue','policy_violation','other') then raise exception 'invalid moderation reason_code' using errcode='22023'; end if;
 if decision in ('reject','needs_fix','hide') and normalized_reason is null then raise exception 'reason_code is required' using errcode='22023'; end if;
 if decision<>'approve' and normalized_note is null then raise exception 'override reason required' using errcode='22023';end if;
 perform 1 from public.listings where id=target_listing_id for update;
 select * into run from private.moderation_runs where listing_id=target_listing_id order by created_at desc,id desc limit 1 for update;
 -- A repeated action on the current run is a no-op, including old clients.
 if exists(select 1 from private.moderation_overrides o where o.id=(select id from private.moderation_overrides where listing_id=target_listing_id order by created_at desc,id desc limit 1)
 and o.run_id is not distinct from run.id and o.created_at>=coalesce(run.created_at,'-infinity') and o.new_decision=upper(decision)
 and exists(select 1 from public.listings l where l.id=target_listing_id and l.status=case when decision='approve' then 'active' else 'rejected' end)) then return;end if;
 perform private.apply_listing_moderation(target_listing_id,decision,auth.uid(),case when decision in ('approve','restore') then null else normalized_reason end,normalized_note);
 insert into private.moderation_overrides(run_id,listing_id,moderator_id,automatic_decision,new_decision,reason) values(run.id,target_listing_id,auth.uid(),run.decision,upper(decision),coalesce(normalized_note,normalized_reason,'Проверено модератором'));
  -- Keep completed automatic results immutable; invalidate in-flight callbacks.
  update private.moderation_runs set status='stale',claim_token=null,completed_at=now(),error_code='human_override' where listing_id=target_listing_id and status in ('queued','running');
end;
$$;

create function public.moderate_listing_checked(target_listing_id uuid,decision text,expected_revision text,request_id uuid,reason_code text default null,note text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt private.moderation_overrides; current_hash text; prior uuid; latest uuid; result_status text;
begin
 if auth.uid() is null or not private.has_any_role(array['moderator','admin']) then raise exception 'moderation permission required' using errcode='42501';end if;
 if request_id is null or expected_revision is null or expected_revision !~ '^[a-f0-9]{64}$' then raise exception 'invalid request metadata' using errcode='22023';end if;
 -- Serialize replays even if a token is accidentally reused across listings.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,43));
 select * into receipt from private.moderation_overrides o where o.moderator_id=auth.uid() and o.request_id=moderate_listing_checked.request_id;
 if receipt.id is not null then
  if receipt.listing_id<>target_listing_id or receipt.content_revision_hash<>expected_revision or receipt.new_decision<>upper(decision) then raise exception 'request conflict' using errcode='40001';end if;
  select status::text into result_status from public.listings where id=target_listing_id and deleted_at is null for update;
  if result_status is distinct from (case when receipt.new_decision='APPROVE' then 'active' else 'rejected' end) then raise exception 'stale receipt status' using errcode='40001';end if;
  if private.moderation_hash(private.moderation_content(target_listing_id))<>expected_revision or receipt.id is distinct from (select id from private.moderation_overrides where listing_id=target_listing_id order by created_at desc,id desc limit 1) then raise exception 'stale receipt' using errcode='40001';end if;
  return jsonb_build_object('id',target_listing_id,'decision',receipt.new_decision,'status',result_status,'override_id',receipt.id,'revision',receipt.content_revision_hash,'replayed',true);
 end if;
 perform 1 from public.listings where id=target_listing_id and deleted_at is null for update;
 if not found then raise exception 'listing is unavailable' using errcode='P0002';end if;
 current_hash:=private.moderation_hash(private.moderation_content(target_listing_id));
 if current_hash<>expected_revision then raise exception 'stale revision' using errcode='40001';end if;
 select id into prior from private.moderation_overrides where listing_id=target_listing_id order by created_at desc,id desc limit 1;
 perform public.moderate_listing(target_listing_id,decision,reason_code,note);
 select id into latest from private.moderation_overrides where listing_id=target_listing_id order by created_at desc,id desc limit 1;
 if latest is distinct from prior then update private.moderation_overrides set request_id=moderate_listing_checked.request_id,content_revision_hash=current_hash where id=latest;end if;
 select status::text into result_status from public.listings where id=target_listing_id;
 return jsonb_build_object('id',target_listing_id,'decision',upper(decision),'status',result_status,'override_id',latest,'revision',current_hash,'replayed',latest is not distinct from prior);
end;
$$;
revoke all on function public.moderate_listing_checked(uuid,text,text,uuid,text,text) from public,anon;
grant execute on function public.moderate_listing_checked(uuid,text,text,uuid,text,text) to authenticated;


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
 select coalesce(max(generation),0) into gen from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-3';
 -- Explicit submit may retry a completed technical hold at the SAME revision.
 -- A queued/running run is reused, as is any definitive compatible result.
 if force_new or exists(select 1 from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-3' and generation=gen and status='completed' and decision='HUMAN_REVIEW' and (decision_basis='technical_hold' or error_code='system_error')) then gen:=gen+1; end if;
 insert into private.moderation_runs(listing_id,revision_id,content_revision_hash,generation,engine_version,ruleset_version,rules_snapshot)
 values(target,rev,hash,gen,'jevu-moderation-3',version,rules) on conflict do nothing returning id into run;
 if run is null then select id into run from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-3' and generation=gen; end if;
 return run;
end;
$$;

create or replace function public.moderation_shadow_job(operation text,job_id uuid,token uuid,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
  if coalesce(payload->>'status','') not in ('success','timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','ocr_incomplete','content_unavailable','configuration_missing','provider_4xx')
   or coalesce(payload->>'latency_ms','') !~ '^[0-9]{1,7}$' or coalesce(payload->>'image_count','') !~ '^[0-7]$'
   or (payload->>'input_tokens')::integer not between 0 and 5000000 or (payload->>'output_tokens')::integer not between 0 and 100000 then raise exception 'invalid provider metadata';end if;
  entry:=entry||jsonb_build_object('status',payload->>'status','latency_ms',(payload->>'latency_ms')::integer,'image_count',(payload->>'image_count')::integer,'input_tokens',(payload->>'input_tokens')::integer,'output_tokens',(payload->>'output_tokens')::integer,'request_id',case when payload->>'request_id' ~ '^[a-zA-Z0-9_-]{1,160}$' then payload->>'request_id' else null end);
  if payload->>'validation_issue' in ('json','envelope','shape','coverage','provenance','ocr_incomplete') then entry:=entry||jsonb_build_object('validation_issue',payload->>'validation_issue');end if;
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

create or replace function private.sanitize_moderation_shadow(value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare f jsonb; findings jsonb:='[]'; subjects jsonb:='[]'; langs jsonb;
begin
 if value is null then return null;end if;
 if value->>'schema_version' is distinct from 'moderation-ai-observation-v1' or value->>'mode' is distinct from 'shadow'
 or coalesce(value->>'status','') not in ('success','timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','ocr_incomplete','content_unavailable','configuration_missing','provider_4xx','budget_exhausted','disabled','not_eligible')
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

create or replace function private.sanitize_moderation_automatic(value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare lexical jsonb:='{}'; obs jsonb:='[]'; timeline jsonb:='[]'; v jsonb; key text;
begin
 if value is null then return null;end if;
 if value->>'version' is distinct from 'jevu-automatic-1' or value->>'decision_source' is distinct from 'AUTOMATIC'
 or coalesce(value->>'mode','') not in ('automatic','manual_fallback')
 or coalesce(value->>'basis','') not in ('deterministic','ai_assisted','fixable','uncertain','technical_hold','switch_disabled')
 or coalesce(value->>'provider_status','') not in ('not_required','success','timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','ocr_incomplete','content_unavailable','configuration_missing','provider_4xx','budget_exhausted','disabled','not_eligible')
 or jsonb_typeof(value->'schema_validated') is distinct from 'boolean'
 or coalesce(value->>'ocr_images','') !~ '^[0-7]$' or coalesce(value->>'vision_images','') !~ '^[0-7]$'
 or jsonb_typeof(value->'observations') is distinct from 'array' or jsonb_array_length(value->'observations')>88
 or jsonb_typeof(value->'timeline') is distinct from 'array' or jsonb_array_length(value->'timeline')>10
 then raise exception 'unsafe automatic trace' using errcode='22023';end if;
 if value->'lexical' is not null and value->'lexical'<>'null' then
  foreach key in array array['matched_rule_codes','matched_hard_patterns','matched_suspicious_patterns','matched_exception_patterns','confirmed_rule_codes','review_rule_codes','benign_rule_codes','finding_codes','reason_codes','canonical_finding_families'] loop
   lexical:=lexical||jsonb_build_object(key,private.moderation_code_array(value->'lexical'->key));
  end loop;
  foreach key in array array['lexical_engine_version','ruleset_version','lexical_risk','lexical_routing_decision','execution_decision','fallback_reason'] loop
   if value->'lexical'->>key ~ '^[a-zA-Z][a-zA-Z0-9_.:-]{0,99}$' then lexical:=lexical||jsonb_build_object(key,value->'lexical'->>key);end if;
  end loop;
  lexical:=lexical||jsonb_build_object('normalized_text_hash',case when value->'lexical'->>'normalized_text_hash' ~ '^[a-f0-9]{64}$' then value->'lexical'->>'normalized_text_hash' end);
 end if;
 for v in select * from jsonb_array_elements(value->'observations') loop
  if coalesce(v->>'code','') not in ('possible_vape','possible_tobacco','possible_nicotine_product','possible_weapon','possible_ammunition','possible_explosive','possible_drug','possible_precursor','possible_fake_document','document_visible','possible_identity_document','possible_payment_card','possible_personal_identifier','possible_adult_content','possible_illegal_service','possible_scam_instruction','category_mismatch','image_text_mismatch','duplicate_or_reused_image','prompt_injection_attempt','uncertain')
  or jsonb_typeof(v->'present') is distinct from 'boolean' or coalesce(v->>'source','') not in ('text','image','ocr')
  or coalesce(v->>'subject','') not in ('offered_item','background','accessory','educational','toy','unknown')
  or v->>'confidence' is null or (v->>'confidence')::numeric not between 0 and 1
  or (v->>'source'='text' and v->>'image_index' is not null) or (v->>'source'<>'text' and coalesce(v->>'image_index','') !~ '^[0-6]$') then raise exception 'unsafe observation';end if;
  obs:=obs||jsonb_build_array(jsonb_build_object('code',v->>'code','present',(v->>'present')::boolean,'source',v->>'source','subject',v->>'subject','confidence',(v->>'confidence')::numeric,'image_index',(v->>'image_index')::integer));
 end loop;
 for v in select * from jsonb_array_elements(value->'timeline') loop
  if coalesce(v->>'code','') not in ('SUBMITTED','LOCAL_RULES','IMAGE_VALIDATION','AI_ANALYSIS','VISION','OCR','RULE_EVALUATION','FINAL_DECISION') or coalesce(v->>'status','') not in ('PASS','FINDING','FAILED','SKIPPED') or (v->>'duration_ms')::integer not between 0 and 180000 then raise exception 'unsafe timeline';end if;
  timeline:=timeline||jsonb_build_array(jsonb_build_object('code',v->>'code','status',v->>'status','duration_ms',(v->>'duration_ms')::integer));
 end loop;
 if value->'category'<>'null' and (coalesce(value->'category'->>'status','') not in ('match','mismatch','uncertain') or (value->'category'->>'confidence')::numeric not between 0 and 1) then raise exception 'unsafe category';end if;
 if (value->>'uncertainty')::numeric not between 0 and 1 then raise exception 'unsafe uncertainty';end if;
 return jsonb_build_object('version','jevu-automatic-1','decision_source','AUTOMATIC','mode',value->>'mode','basis',value->>'basis','lexical',lexical,
 'schema_validated',(value->>'schema_validated')::boolean,'provider_status',value->>'provider_status',
 'category',case when value->'category'<>'null' then jsonb_build_object('status',value->'category'->>'status','confidence',(value->'category'->>'confidence')::numeric) end,
 'uncertainty',(value->>'uncertainty')::numeric,'ocr_images',(value->>'ocr_images')::integer,'vision_images',(value->>'vision_images')::integer,
 'observations',obs,'resolved_local_rules',private.moderation_code_array(value->'resolved_local_rules'),'canonical_families',private.moderation_code_array(value->'canonical_families'),'timeline',timeline);
end;
$$;

create or replace function public.moderation_dashboard(selected_filter text default 'all',requested_page integer default 1,page_size integer default 24) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.has_any_role(array['moderator','admin']) then raise exception 'staff required' using errcode='42501';end if;
 if selected_filter not in ('all','approved','rejected','needs_fix','uncertain','technical','overrides','reports','appeals','pending') or requested_page not between 1 and 10000 or page_size not between 1 and 50 then raise exception 'invalid filter' using errcode='22023';end if;
 with filtered as (
  select l.id,l.title,l.price_minor,l.currency_code,l.owner_id,l.category_id,l.settlement_id,l.created_at,l.status,r.decision,r.decision_basis,r.status run_status,v.new_decision manual_decision,exists(select 1 from private.moderation_overrides o where o.listing_id=l.id) overridden
  from public.listings l left join lateral (select decision,decision_basis,status,error_code,created_at,completed_at from private.moderation_runs where listing_id=l.id order by created_at desc,id desc limit 1) r on true
  left join lateral(select o.new_decision from private.moderation_overrides o where o.listing_id=l.id and o.created_at>=coalesce(r.completed_at,r.created_at) order by o.created_at desc,o.id desc limit 1) v on true
  where l.deleted_at is null and case selected_filter when 'all' then true when 'approved' then r.decision='APPROVED' and l.status='active' and v.new_decision is null when 'rejected' then r.decision='REJECTED' and l.status='rejected' and v.new_decision is null when 'needs_fix' then coalesce(v.new_decision,r.decision)='NEEDS_FIX' and l.status='rejected' when 'uncertain' then r.decision='HUMAN_REVIEW' and l.status='pending' and r.status='completed' and r.error_code is null and r.decision_basis='uncertain' and v.new_decision is null when 'technical' then l.status='pending' and (r.error_code is not null or r.decision_basis='technical_hold') and v.new_decision is null when 'pending' then l.status='pending' and (r.status is null or r.status in ('queued','running')) when 'overrides' then exists(select 1 from private.moderation_overrides o where o.listing_id=l.id) when 'reports' then exists(select 1 from public.reports p where p.listing_id=l.id and p.status in ('open','in_review')) when 'appeals' then exists(select 1 from private.moderation_runs m join private.moderation_appeals a on a.run_id=m.id where m.listing_id=l.id and a.status='open') else false end
 ), page as (select * from filtered order by created_at desc,id desc offset (requested_page-1)*page_size limit page_size)
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('category_ru',c.name_ru,'category_kk',c.name_kk,'city_ru',s.name_ru,'city_kk',s.name_kk,'seller_name',profile.display_name,'image_key',image.storage_key) order by p.created_at desc,p.id desc)
 from page p join public.categories c on c.id=p.category_id join public.settlements s on s.id=p.settlement_id left join public.profiles profile on profile.id=p.owner_id
 left join lateral(select storage_key from public.listing_images where listing_id=p.id order by sort_order,id limit 1) image on true),'[]'),'owner_controls',private.is_moderation_owner()) into result;
 return result;
end;
$$;

-- One scoped core read. Full history/findings remain a separate on-demand RPC.
create function public.moderation_case(target_listing_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare answer jsonb; content jsonb; summary jsonb;
begin
 if auth.uid() is null or not private.has_any_role(array['moderator','admin']) then raise exception 'staff required' using errcode='42501';end if;
 content:=private.moderation_content(target_listing_id);
 select jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'price_minor',l.price_minor,'currency_code',l.currency_code,'status',l.status,'created_at',l.created_at,'owner_id',l.owner_id,'seller_name',p.display_name,'city_ru',s.name_ru,'city_kk',s.name_kk,
 'category_path',content->'category_path','images',content->'images',
 'attributes',(select coalesce(jsonb_agg(jsonb_build_object('key',a.key,'ru',a.label_ru,'kk',a.label_kk,'unit_ru',a.unit_ru,'unit_kk',a.unit_kk,'values',v.vals) order by a.sort_order),'[]') from public.category_attributes a join lateral(
 select jsonb_agg(val) vals from (
 select jsonb_build_object('text',x.text_value,'number',x.number_value,'boolean',x.boolean_value,'date',x.date_value,'min',x.number_min_value,'max',x.number_max_value) val from public.listing_attribute_values x where x.attribute_id=a.id and x.listing_id=l.id
 union all select jsonb_build_object('ru',o.label_ru,'kk',o.label_kk) from public.listing_attribute_option_values x join public.category_attribute_options o on o.id=x.option_id where x.attribute_id=a.id and x.listing_id=l.id) q
 ) v on v.vals is not null)) into answer from public.listings l join public.settlements s on s.id=l.settlement_id left join public.profiles p on p.id=l.owner_id where l.id=target_listing_id and l.deleted_at is null and l.status in ('pending','active','rejected','archived');
 if answer is null then return null;end if;
 select jsonb_build_object('run_id',r.id,'decision',r.decision,'status',r.status,'basis',r.decision_basis,'provider_status',coalesce(r.automatic_trace->>'provider_status',r.error_code),'created_at',r.created_at) into summary from private.moderation_runs r where r.listing_id=target_listing_id order by r.created_at desc,r.id desc limit 1;
 return answer||jsonb_build_object('summary',coalesce(summary,'{}')||jsonb_build_object('current_revision',private.moderation_hash(content),'owner_controls',private.is_moderation_owner(),'manual_decision',(select o.new_decision from private.moderation_overrides o where o.listing_id=target_listing_id and o.created_at>=coalesce((summary->>'created_at')::timestamptz,'-infinity') order by o.created_at desc,o.id desc limit 1)));
end;
$$;
revoke all on function public.moderation_case(uuid) from public,anon;
grant execute on function public.moderation_case(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
