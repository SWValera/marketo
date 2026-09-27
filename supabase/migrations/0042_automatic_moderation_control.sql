-- Explicit automatic rollout and owner controls. No role grants, backfill or
-- publication on migration. Existing immutable rules/revisions are unchanged.
begin;
set local lock_timeout='5s';
alter table private.moderation_settings drop constraint moderation_shadow_no_auto_approve;
alter table private.moderation_settings add column automatic_enabled boolean not null default false;
alter table private.moderation_settings add column auto_reject boolean not null default false;
alter table private.moderation_settings add column automatic_since timestamptz;
alter table private.moderation_settings add constraint moderation_automatic_activation check(not automatic_enabled or automatic_since is not null);
alter table private.moderation_runs add column decision_source text not null default 'AUTOMATIC' check(decision_source='AUTOMATIC');
alter table private.moderation_runs add column automatic_trace jsonb;
alter table private.moderation_runs add column decision_basis text check(decision_basis in ('deterministic','ai_assisted','fixable','uncertain','technical_hold','switch_disabled'));
create index moderation_runs_decision_recent on private.moderation_runs(decision,created_at desc,listing_id) where status='completed';
create index moderation_overrides_listing_recent on private.moderation_overrides(listing_id,created_at desc,id desc);
create index moderation_appeals_run_status on private.moderation_appeals(run_id,status);
create index moderation_reports_listing_status on public.reports(listing_id,status) where listing_id is not null;

-- Existing active admin is the owner permission; ordinary moderators keep their
-- current rights. Assignment is an audited operator action for a verified account.
create function private.is_moderation_owner() returns boolean language sql stable security definer set search_path='' as $$
 select private.has_any_role(array['admin']);
$$;

create function private.moderation_code_array(value jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(v),'[]') from (select v from jsonb_array_elements_text(case when jsonb_typeof(value)='array' then value else '[]' end) v where v ~ '^[a-zA-Z][a-zA-Z0-9_.:-]{0,99}$' limit 128) safe;
$$;
create function private.sanitize_moderation_automatic(value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare lexical jsonb:='{}'; obs jsonb:='[]'; timeline jsonb:='[]'; v jsonb; key text;
begin
 if value is null then return null;end if;
 if value->>'version' is distinct from 'jevu-automatic-1' or value->>'decision_source' is distinct from 'AUTOMATIC'
 or coalesce(value->>'mode','') not in ('automatic','manual_fallback')
 or coalesce(value->>'basis','') not in ('deterministic','ai_assisted','fixable','uncertain','technical_hold','switch_disabled')
 or coalesce(value->>'provider_status','') not in ('not_required','success','timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','content_unavailable','configuration_missing','provider_4xx','budget_exhausted','disabled','not_eligible')
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

create or replace function public.finish_moderation_job(job_id uuid,token uuid,result jsonb) returns text language plpgsql security definer set search_path='' as $$
declare job private.moderation_runs; settings private.moderation_settings; trace jsonb; safe_shadow jsonb; outcome text; image jsonb; complete boolean; hard boolean; ai_block boolean; enabled boolean; image_count integer; requested_decision text:=result->>'decision';
begin
 perform 1 from public.listings l join private.moderation_runs r on r.listing_id=l.id where r.id=job_id for update of l;
 select * into job from private.moderation_runs where id=job_id for update;
 if job.id is null or job.status<>'running' or job.claim_token is distinct from token or job.lease_until<clock_timestamp() then return 'ignored';end if;
 select * into settings from private.moderation_settings;
 trace:=private.sanitize_moderation_automatic(result->'automatic');
 safe_shadow:=private.sanitize_moderation_shadow(result->'shadow');
 image_count:=jsonb_array_length(private.moderation_content(job.listing_id)->'images');
 enabled:=settings.automatic_enabled and job.engine_version='jevu-moderation-3' and job.created_at>=settings.automatic_since and trace->>'mode'='automatic';
 complete:=coalesce(enabled and trace->>'schema_validated'='true' and trace->>'provider_status'='success' and (trace->>'uncertainty')::numeric<=.15
  and (trace->>'ocr_images')::integer=image_count and (trace->>'vision_images')::integer=image_count
  and result->>'provider'='openai' and result->>'ocr_provider'='openai_vision_ocr' and result->>'error_code' is null
  and image_count between 1 and 7 and jsonb_array_length(result->'stages')=6+image_count*3
  and not exists(select 1 from jsonb_array_elements(result->'stages') s where s->>'status' is distinct from 'PASS')
  and jsonb_array_length(result->'images')=image_count and not exists(select 1 from jsonb_array_elements(result->'images') i where i->>'status' is distinct from 'PASS' or coalesce(i->>'sha256','') !~ '^[a-f0-9]{64}$')
  and exists(select 1 from jsonb_array_elements(job.ai_calls) c where c->>'status'='success' and c->>'schema_version'='moderation-ai-observation-v1' and c->>'model'=result->>'provider_version' and (c->>'image_count')::integer=image_count),false);
 select exists(select 1 from jsonb_array_elements(result->'findings') f join private.moderation_rules r on r.id=(f->>'rule_id')::uuid
  where r.ruleset_version=job.ruleset_version and r.enabled and r.effective_from<=job.created_at and (r.effective_to is null or r.effective_to>job.created_at)
  and f->>'source_type'='text' and f->>'recommended_action'='REJECTED' and f->>'finding_code'=r.code and (f->>'confidence')::numeric=1 and r.legal_status='JEVU_POLICY' and r.action='REJECTED') into hard;
 select exists(select 1 from jsonb_array_elements(result->'findings') f join private.moderation_rules r on r.id=(f->>'rule_id')::uuid
  where r.ruleset_version=job.ruleset_version and r.enabled and r.legal_status='JEVU_POLICY' and r.action='REJECTED'
  and f->>'recommended_action'='REJECTED' and f->>'finding_code'=r.code and (f->>'confidence')::numeric>=.98
  and exists(select 1 from jsonb_array_elements(trace->'observations') o where o->>'present'='true' and o->>'subject'='offered_item' and (o->>'confidence')::numeric>=.98
   and o->>'code'=case r.code when 'drugs' then 'possible_drug' when 'illegal_precursors' then 'possible_precursor' when 'forged_document' then 'possible_fake_document' when 'nicotine' then 'possible_nicotine_product' else 'possible_'||r.code end)) into ai_block;
 if result->>'decision'='APPROVED' and (not complete or not settings.auto_approve or trace->'category'->>'status' is distinct from 'match' or coalesce((trace->'category'->>'confidence')::numeric,0)<.9) then result:=jsonb_set(result,'{decision}','"HUMAN_REVIEW"');end if;
 if result->>'decision'='REJECTED' and (not settings.automatic_enabled or not settings.auto_reject or not(hard or (complete and ai_block and not exists(select 1 from jsonb_array_elements(result->'findings') f where f->>'finding_code' in ('unresolved_context','uncertain','provider_error','provider_unavailable','image_unavailable'))))) then result:=jsonb_set(result,'{decision}','"HUMAN_REVIEW"');end if;
 if result->>'decision'='NEEDS_FIX' and (not complete or not settings.automatic_enabled) then result:=jsonb_set(result,'{decision}','"HUMAN_REVIEW"');end if;
 outcome:=private.finish_moderation_job_before_shadow(job_id,token,result);
 if outcome in ('ignored','stale') then return outcome;end if;
 update private.moderation_runs set shadow_result=safe_shadow,automatic_trace=trace,
 decision_basis=case when outcome<>requested_decision then 'uncertain' else coalesce(trace->>'basis',case when hard then 'deterministic' else 'uncertain' end) end where id=job_id;
 for image in select * from jsonb_array_elements(result->'images') loop
  if image->>'perceptual_hash' ~ '^[a-f0-9]{16}$' and image->>'algorithm'='dhash64-v1' then
   update private.moderation_image_hashes set perceptual_hash=image->>'perceptual_hash',algorithm='dhash64-v1' where run_id=job_id and image_index=(image->>'image_index')::integer;
  end if;
 end loop;
 -- No raw image/OCR/model text is saved. Existing publication primitive owns dates.
 return outcome;
end;
$$;

create or replace function private.apply_listing_moderation(target uuid,decision text,actor uuid,reason text,note text) returns void
language plpgsql security definer set search_path='' as $$
declare prior text; next text;
begin
 select status into prior from public.listings where id=target and deleted_at is null for update;
 if prior is null then raise exception 'listing is unavailable' using errcode='P0002'; end if;
 next:=case when decision='approve' and prior='pending' then 'active' when decision in ('reject','needs_fix') and prior='pending' then 'rejected'
 when decision='hide' and prior='active' then 'archived' when decision='restore' and prior='archived' then 'active' when actor=auth.uid() and private.is_moderation_owner() and decision='approve' and prior in ('active','rejected','archived') then 'active'
 when actor=auth.uid() and private.is_moderation_owner() and decision in ('reject','needs_fix') and prior in ('active','rejected','archived') then 'rejected' else null end;
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
 if normalized_note is null then raise exception 'override reason required' using errcode='22023';end if;
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
 if force_new then gen:=gen+1; end if;
 insert into private.moderation_runs(listing_id,revision_id,content_revision_hash,generation,engine_version,ruleset_version,rules_snapshot)
 values(target,rev,hash,gen,'jevu-moderation-3',version,rules) on conflict do nothing returning id into run;
 if run is null then select id into run from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-3' and generation=gen; end if;
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
 'created_at',job.created_at,'engine_version',job.engine_version,'automatic_enabled',(select automatic_enabled from private.moderation_settings),'auto_reject',(select auto_reject from private.moderation_settings),'automatic_since',(select automatic_since from private.moderation_settings),'snapshot',snap,'rules',job.rules_snapshot,'auto_approve',(select auto_approve from private.moderation_settings),
 'fraud',jsonb_build_object('recent_submissions',(select count(*) from private.moderation_runs r join public.listings l on l.id=r.listing_id where l.owner_id=owner and r.created_at>now()-interval '1 hour'),
 'prior_rejections',(select count(*) from private.moderation_runs r join public.listings l on l.id=r.listing_id where l.owner_id=owner and r.decision='REJECTED' and r.created_at>now()-interval '30 days'),
 'confirmed_reports',(select count(*) from public.reports r join public.listings l on l.id=r.listing_id where l.owner_id=owner and r.status='resolved' and r.created_at>now()-interval '90 days'),
 'duplicate_content',(select count(distinct r.listing_id) from private.listing_content_revisions r join public.listings l on l.id=r.listing_id where r.content_fingerprint=fingerprint and r.listing_id<>job.listing_id and l.owner_id=owner and l.status in ('pending','active')),
 'reused_images',0));
end;
$$;

-- Retain the existing metrics/rules adapter, intercept only rollout settings.
alter function public.moderation_admin(text,jsonb) rename to moderation_admin_before_automatic;
alter function public.moderation_admin_before_automatic(text,jsonb) set schema private;
create function public.moderation_admin(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare output jsonb; metrics jsonb;
begin
 if not private.has_any_role(array['moderator','admin']) then raise exception 'staff required' using errcode='42501';end if;
 if operation='settings' then
  if not private.is_moderation_owner() then raise exception 'admin required' using errcode='42501';end if;
  if nullif(btrim(payload->>'reason'),'') is null or length(payload->>'reason')>1000 then raise exception 'change reason required' using errcode='22023';end if;
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('automatic_enabled','auto_approve','auto_reject','require_verified_kz_phone','reason')) then raise exception 'unknown settings';end if;
  update private.moderation_settings set
   automatic_enabled=coalesce((payload->>'automatic_enabled')::boolean,automatic_enabled),
   automatic_since=case when (payload->>'automatic_enabled')::boolean and not automatic_enabled then clock_timestamp() else automatic_since end,
   auto_approve=coalesce((payload->>'auto_approve')::boolean,auto_approve),auto_reject=coalesce((payload->>'auto_reject')::boolean,auto_reject),
   require_verified_kz_phone=coalesce((payload->>'require_verified_kz_phone')::boolean,require_verified_kz_phone),updated_at=now();
  insert into public.admin_audit_log(actor_id,action,entity_type,metadata) values(auth.uid(),'moderation.automatic_settings','moderation_settings',payload);
  return jsonb_build_object('ok',true);
 end if;
 output:=private.moderation_admin_before_automatic(operation,payload);
 if operation='queue' then
  select jsonb_build_object('deterministic_rejects',count(*) filter(where decision='REJECTED' and decision_basis='deterministic'),'ai_assisted_rejects',count(*) filter(where decision='REJECTED' and decision_basis='ai_assisted'),'technical_hold',count(*) filter(where decision_basis='technical_hold')) into metrics from private.moderation_runs where created_at>now()-interval '30 days';
  metrics:=metrics||jsonb_build_object('admin_overrides',(select count(*) from private.moderation_overrides where created_at>now()-interval '30 days'),
   'auto_approve_manual_reject',(select count(*) from private.moderation_overrides where automatic_decision='APPROVED' and new_decision='REJECT' and created_at>now()-interval '30 days'),
   'auto_reject_manual_approve',(select count(*) from private.moderation_overrides where automatic_decision='REJECTED' and new_decision='APPROVE' and created_at>now()-interval '30 days'));
  output:=jsonb_set(output,'{metrics}',(output->'metrics')||metrics);
  output:=output||jsonb_build_object('switches',(select jsonb_build_object('automatic_enabled',automatic_enabled,'auto_approve',auto_approve,'auto_reject',auto_reject,'automatic_since',automatic_since,'daily_call_limit',shadow_daily_call_limit) from private.moderation_settings),'owner_controls',private.is_moderation_owner());
 end if;
 return output;
end;
$$;

create function public.moderation_dashboard(selected_filter text default 'all',requested_page integer default 1,page_size integer default 24) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.has_any_role(array['moderator','admin']) then raise exception 'staff required' using errcode='42501';end if;
 if selected_filter not in ('all','approved','rejected','needs_fix','uncertain','technical','overrides','reports','appeals','pending') or requested_page not between 1 and 10000 or page_size not between 1 and 50 then raise exception 'invalid filter' using errcode='22023';end if;
 with filtered as (
  select l.id,l.created_at,l.status,r.decision,r.decision_basis,r.status run_status,exists(select 1 from private.moderation_overrides o where o.listing_id=l.id) overridden
  from public.listings l left join lateral (select decision,decision_basis,status,error_code from private.moderation_runs where listing_id=l.id order by created_at desc,id desc limit 1) r on true
  where l.deleted_at is null and case selected_filter when 'all' then true when 'approved' then r.decision='APPROVED' when 'rejected' then r.decision='REJECTED' when 'needs_fix' then r.decision='NEEDS_FIX' when 'uncertain' then r.decision='HUMAN_REVIEW' when 'technical' then r.error_code is not null or r.decision_basis='technical_hold' when 'pending' then l.status='pending' when 'overrides' then exists(select 1 from private.moderation_overrides o where o.listing_id=l.id) when 'reports' then exists(select 1 from public.reports p where p.listing_id=l.id and p.status in ('open','in_review')) when 'appeals' then exists(select 1 from private.moderation_runs m join private.moderation_appeals a on a.run_id=m.id where m.listing_id=l.id and a.status='open') else false end
 ), page as (select * from filtered order by created_at desc,id desc offset (requested_page-1)*page_size limit page_size)
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id desc),'[]'),'owner_controls',private.is_moderation_owner()) into result from page;
 return result;
end;
$$;

-- Compare-and-set edits; a moderator cannot impersonate the listing's seller.
-- Edits never publish. They preserve assets/contact/attributes and re-enter the
-- same durable pipeline. Soft deletion preserves all audit and media records.
create function public.moderation_owner_listing(target_listing_id uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.listings; old_hash text; new_hash text; reason text:=nullif(btrim(payload->>'reason'),'');
begin
 if not private.is_moderation_owner() then raise exception 'owner permission required' using errcode='42501';end if;
 if reason is null or length(reason)>1000 then raise exception 'change reason required' using errcode='22023';end if;
 select * into item from public.listings where id=target_listing_id for update;
 if item.id is null or item.deleted_at is not null then raise exception 'listing unavailable' using errcode='P0002';end if;
 old_hash:=private.moderation_hash(private.moderation_content(item.id));
 if payload->>'expected_revision' is distinct from old_hash then raise exception 'content revision changed' using errcode='40001';end if;
 if operation='edit' then
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('reason','expected_revision','title','description','price_minor')) then raise exception 'unsupported content field' using errcode='22023';end if;
  if length(btrim(payload->>'title')) not between 3 and 70 or payload->>'title' is null or length(btrim(payload->>'description')) not between 10 and 20000 or payload->>'description' is null
   or (payload->>'price_minor')::bigint not between 0 and 90000000000 then raise exception 'invalid content' using errcode='22023';end if;
  if item.status in ('sold','expired','deleted') then raise exception 'listing is not editable' using errcode='22023';end if;
  update public.listings set status='draft',title=btrim(payload->>'title'),description=btrim(payload->>'description'),price_minor=(payload->>'price_minor')::bigint where id=item.id;
  new_hash:=private.moderation_hash(private.moderation_content(item.id));
  if new_hash=old_hash then raise exception 'content unchanged' using errcode='22023';end if;
  update private.moderation_runs set status='stale',claim_token=null,completed_at=now(),error_code='owner_edit' where listing_id=item.id and status in ('queued','running');
  if item.status<>'draft' then update public.listings set status='pending' where id=item.id;end if;
 elsif operation in ('archive','delete') then
  update public.listings set status=case operation when 'delete' then 'deleted' else 'archived' end,deleted_at=case when operation='delete' then now() else deleted_at end where id=item.id;
  update private.moderation_runs set status='stale',claim_token=null,completed_at=now(),error_code='owner_hide' where listing_id=item.id and status in ('queued','running');
 else raise exception 'invalid operation' using errcode='22023';end if;
 insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'moderation.owner_'||operation,'listing',item.id::text,jsonb_build_object('reason',reason,'previous_status',item.status,'previous_revision',old_hash,'new_revision',new_hash));
 return jsonb_build_object('ok',true);
end;
$$;

-- Extend staff view only. Normal sellers never receive a trace or provider data.
alter function public.get_listing_moderation(uuid,boolean) rename to get_listing_moderation_before_automatic;
alter function public.get_listing_moderation_before_automatic(uuid,boolean) set schema private;
create function public.get_listing_moderation(target_listing_id uuid,staff_view boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare output jsonb;
begin
 output:=private.get_listing_moderation_before_automatic(target_listing_id,staff_view);
 if staff_view and private.has_any_role(array['moderator','admin']) then
  output:=output||jsonb_build_object('owner_controls',private.is_moderation_owner(),'current_revision',private.moderation_hash(private.moderation_content(target_listing_id)),
   'image_hashes',(select coalesce(jsonb_agg(to_jsonb(h)),'[]') from private.moderation_image_hashes h where h.listing_id=target_listing_id),
   'actions',(select coalesce(jsonb_agg(to_jsonb(m) order by created_at desc),'[]') from public.moderation_actions m where m.listing_id=target_listing_id),
   'owner_edits',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at desc),'[]') from public.admin_audit_log a where a.entity_id=target_listing_id::text and a.action like 'moderation.owner_%'));
 end if;
 return output;
end;
$$;
revoke all on function private.is_moderation_owner(),private.moderation_code_array(jsonb),private.sanitize_moderation_automatic(jsonb),private.moderation_admin_before_automatic(text,jsonb),private.get_listing_moderation_before_automatic(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.moderation_dashboard(text,integer,integer),public.moderation_owner_listing(uuid,text,jsonb),public.moderation_admin(text,jsonb),public.get_listing_moderation(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.moderation_dashboard(text,integer,integer),public.moderation_owner_listing(uuid,text,jsonb),public.moderation_admin(text,jsonb),public.get_listing_moderation(uuid,boolean) to authenticated;
commit;
