-- OCR v2 semantics and canonical current/publication state. No content, dates, roles or flags change.
begin;
set local lock_timeout='5s';

-- Revision pointers are derived exclusively from persisted content. They avoid
-- re-reading every attribute/image while counting the moderation dashboard.
create table private.listing_moderation_state (
 listing_id uuid primary key references public.listings(id) on delete cascade,
 current_revision_hash text not null check(current_revision_hash ~ '^[a-f0-9]{64}$'),
 published_revision_hash text check(published_revision_hash ~ '^[a-f0-9]{64}$')
);
alter table private.listing_moderation_state enable row level security;
revoke all on private.listing_moderation_state from public,anon,authenticated,service_role;
create function private.refresh_moderation_revision(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare hash text; state text;
begin
 select status::text into state from public.listings where id=target for update;
 if not found then return;end if;
 hash:=private.moderation_hash(private.moderation_content(target));
 insert into private.listing_moderation_state(listing_id,current_revision_hash,published_revision_hash)
 values(target,hash,case when state='active' then hash end)
 on conflict(listing_id) do update set current_revision_hash=excluded.current_revision_hash,
 published_revision_hash=case when state='active' then hash else private.listing_moderation_state.published_revision_hash end;
end;
$$;
create function private.capture_moderation_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='listings' then perform private.refresh_moderation_revision(new.id);
 else
  if tg_op<>'INSERT' then perform private.refresh_moderation_revision(old.listing_id);end if;
  if tg_op<>'DELETE' and (tg_op='INSERT' or new.listing_id is distinct from old.listing_id) then perform private.refresh_moderation_revision(new.listing_id);end if;
 end if;
 return null;
end;
$$;
create trigger moderation_revision_listing after insert or update of title,description,category_id,settlement_id,price_minor,currency_code,status on public.listings for each row execute function private.capture_moderation_revision();
create trigger moderation_revision_images after insert or update or delete on public.listing_images for each row execute function private.capture_moderation_revision();
create trigger moderation_revision_attributes after insert or update or delete on public.listing_attribute_values for each row execute function private.capture_moderation_revision();
create trigger moderation_revision_options after insert or update or delete on public.listing_attribute_option_values for each row execute function private.capture_moderation_revision();
-- Metadata normalization only; no publication, queued runs or audit are changed.
insert into private.listing_moderation_state(listing_id,current_revision_hash,published_revision_hash)
 select l.id,h.hash,case when l.status='active' then h.hash end from public.listings l
 cross join lateral(select private.moderation_hash(private.moderation_content(l.id)) hash) h;
create index moderation_runs_current_revision on private.moderation_runs(listing_id,content_revision_hash,created_at desc,id desc) where status<>'stale';

-- Single canonical classifier for rows, counts, detail, owner badges and receipts.
-- A completed/historical run is never an active queued job. No run is not PENDING.
create view private.moderation_effective as
 with current_state as (
 select l.id,l.owner_id,l.status::text public_status,l.deleted_at,l.published_at,l.expires_at,
 s.current_revision_hash current_revision,s.published_revision_hash published_revision,
 coalesce(r.id,v.run_id) run_id,r.status run_status,r.decision automatic_decision,r.decision_basis,r.error_code,
 coalesce(r.automatic_trace->>'provider_status',r.error_code) provider_status,r.created_at run_created_at,
 v.new_decision manual_decision,
 (l.status='active' and l.deleted_at is null and l.published_at is not null and l.expires_at>now()) is_public,
 exists(select 1 from public.reports p where p.listing_id=l.id and p.status in ('open','in_review')) has_reports,
 exists(select 1 from private.moderation_runs m join private.moderation_appeals a on a.run_id=m.id where m.listing_id=l.id and a.status='open') has_appeals
 from public.listings l join private.listing_moderation_state s on s.listing_id=l.id
 left join lateral(select id,status,decision,decision_basis,error_code,automatic_trace,created_at from private.moderation_runs where listing_id=l.id and content_revision_hash=s.current_revision_hash and status<>'stale' order by created_at desc,id desc limit 1) r on true
 left join lateral(select o.new_decision,o.run_id from private.moderation_overrides o left join private.moderation_runs m on m.id=o.run_id
 where o.listing_id=l.id and coalesce(o.content_revision_hash,m.content_revision_hash)=s.current_revision_hash and o.created_at>=coalesce(r.created_at,'-infinity') order by o.created_at desc,o.id desc limit 1) v on true
 ), classified as (
 select *,case
 when deleted_at is not null or public_status='deleted' then 'deleted'
 when public_status='archived' or (public_status='active' and not is_public) then 'archived'
 when public_status='draft' then 'draft'
 when manual_decision in ('APPROVE','RESTORE') and is_public then 'manual_approved'
 when manual_decision='NEEDS_FIX' and public_status='rejected' then 'needs_fix'
 when manual_decision='REJECT' and public_status='rejected' then 'manual_rejected'
 when run_status in ('queued','running') and (public_status='pending' or is_public and current_revision is distinct from published_revision) then 'pending'
 when run_status='completed' and (public_status='pending' or is_public and current_revision is distinct from published_revision) and (decision_basis='technical_hold' or error_code is not null) then 'technical'
 when public_status='pending' or is_public and current_revision is distinct from published_revision then 'uncertain'
 when is_public and automatic_decision='APPROVED' then 'auto_approved'
 when is_public then 'published'
 when public_status='rejected' and automatic_decision='NEEDS_FIX' then 'needs_fix'
 when public_status='rejected' and automatic_decision='REJECTED' then 'auto_rejected'
 when public_status='rejected' then 'rejected'
 else 'uncertain' end effective_state
 from current_state
 )
 select *,case when public_status='active' and not is_public then 'archived' else public_status end publication_state,case when is_public and current_revision is distinct from published_revision and effective_state in ('pending','technical','uncertain') then 'published_changes_'||effective_state else effective_state end label_code,
 array_remove(array['all',case when effective_state='auto_approved' then 'approved' end,case when effective_state='auto_rejected' then 'rejected' end,
 case when effective_state in ('needs_fix','uncertain','technical','pending') then effective_state end,
 case when manual_decision is not null then 'overrides' end,case when has_reports then 'reports' end,case when has_appeals then 'appeals' end],null) filters
 from classified;
revoke all on private.moderation_effective from public,anon,authenticated,service_role;

create function private.moderation_current_summary(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('current_revision',current_revision,'published_revision',published_revision,'effective_state',effective_state,'label_code',label_code,'publication_state',publication_state,
 'run_id',run_id,'decision',automatic_decision,'status',run_status,'basis',case when effective_state in ('technical','uncertain','auto_approved','auto_rejected','needs_fix') and manual_decision is null then decision_basis end,
 'provider_status',case when effective_state in ('technical','uncertain','auto_approved','auto_rejected','needs_fix') and manual_decision is null then provider_status end,
 'manual_decision',manual_decision,'created_at',run_created_at,'owner_controls',private.is_moderation_owner()) from private.moderation_effective where id=target;
$$;
create or replace function public.moderation_dashboard(selected_filter text default 'all',requested_page integer default 1,page_size integer default 24) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.has_any_role(array['moderator','admin']) then raise exception 'staff required' using errcode='42501';end if;
 if selected_filter not in ('all','approved','rejected','needs_fix','uncertain','technical','overrides','reports','appeals','pending') or requested_page not between 1 and 10000 or page_size not between 1 and 50 then raise exception 'invalid filter' using errcode='22023';end if;
 with classified as materialized(select * from private.moderation_effective where effective_state<>'deleted'),
 filtered as (select * from classified where selected_filter=any(filters)),
 page as (select e.*,l.title,l.price_minor,l.currency_code,l.category_id,l.settlement_id,l.created_at from filtered e join public.listings l on l.id=e.id order by l.created_at desc,l.id desc offset (requested_page-1)*page_size limit page_size)
 select jsonb_build_object('total',(select count(*) from filtered),'counts',(select jsonb_object_agg(k,n) from (select k,count(c.id) n from unnest(array['all','approved','rejected','needs_fix','uncertain','technical','overrides','reports','appeals','pending']) k left join classified c on k=any(c.filters) group by k) counts),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'price_minor',p.price_minor,'currency_code',p.currency_code,'owner_id',p.owner_id,'status',p.public_status,'created_at',p.created_at,'effective_state',p.effective_state,'label_code',p.label_code,'decision',p.automatic_decision,'manual_decision',p.manual_decision,'overridden',p.manual_decision is not null,
 'category_ru',c.name_ru,'category_kk',c.name_kk,'city_ru',s.name_ru,'city_kk',s.name_kk,'seller_name',profile.display_name,'image_key',image.storage_key) order by p.created_at desc,p.id desc)
 from page p join public.categories c on c.id=p.category_id join public.settlements s on s.id=p.settlement_id left join public.profiles profile on profile.id=p.owner_id
 left join lateral(select storage_key from public.listing_images where listing_id=p.id order by sort_order,id limit 1) image on true),'[]'),'owner_controls',private.is_moderation_owner()) into result;
 return result;
end;
$$;

create function private.owner_moderation_summary(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e record;
begin
 select * into e from private.moderation_effective where id=target;
 if not found then return null;end if;
 return jsonb_build_object('effective_state',e.effective_state,'label_code',e.label_code,'run_id',e.run_id,
 'status',case when e.effective_state='pending' then 'AUTOMATIC_MODERATION' when e.effective_state in ('auto_approved','manual_approved','published') then 'APPROVED' when e.effective_state='needs_fix' then 'NEEDS_FIX' when e.effective_state in ('auto_rejected','manual_rejected','rejected') then 'REJECTED' when e.effective_state='draft' then 'DRAFT' when e.effective_state in ('archived','deleted') then upper(e.effective_state) else 'HUMAN_REVIEW' end,
 'reasons',case when e.effective_state in ('needs_fix','auto_rejected','uncertain') and e.manual_decision is null then (select coalesce(jsonb_agg(distinct jsonb_build_object('ru',user_reason_ru,'kk',user_reason_kk,'image_index',image_index)),'[]') from private.moderation_findings where run_id=e.run_id and source_type not in ('fraud','system')) else '[]'::jsonb end,
 'can_appeal',e.run_id is not null and e.effective_state in ('needs_fix','auto_rejected','manual_rejected','uncertain','technical') and not exists(select 1 from private.moderation_appeals where run_id=e.run_id and owner_id=auth.uid()));
end;
$$;
create function public.my_moderation_statuses(listing_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or cardinality(listing_ids)>50 then raise exception 'invalid owner status request' using errcode='42501';end if;
 return (select coalesce(jsonb_object_agg(l.id,private.owner_moderation_summary(l.id)),'{}') from public.listings l where l.id=any(listing_ids) and l.owner_id=auth.uid() and l.deleted_at is null);
end;
$$;
revoke all on function public.my_moderation_statuses(uuid[]) from public,anon,service_role;
grant execute on function public.my_moderation_statuses(uuid[]) to authenticated;


create or replace function public.moderation_case(target_listing_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 return answer||jsonb_build_object('summary',private.moderation_current_summary(target_listing_id));
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
 if decision<>'approve' and normalized_note is null then raise exception 'override reason required' using errcode='22023';end if;
 perform 1 from public.listings where id=target_listing_id for update;
 select * into run from private.moderation_runs where listing_id=target_listing_id order by created_at desc,id desc limit 1 for update;
 -- A repeated action on the current run is a no-op, including old clients.
 if exists(select 1 from private.moderation_overrides o where o.id=(select id from private.moderation_overrides where listing_id=target_listing_id order by created_at desc,id desc limit 1)
 and o.run_id is not distinct from run.id and o.created_at>=coalesce(run.created_at,'-infinity') and o.new_decision=upper(decision)
 and exists(select 1 from public.listings l where l.id=target_listing_id and l.status=case when decision='approve' then 'active' else 'rejected' end)) then return;end if;
 perform private.apply_listing_moderation(target_listing_id,decision,auth.uid(),case when decision in ('approve','restore') then null else normalized_reason end,normalized_note);
 insert into private.moderation_overrides(run_id,listing_id,moderator_id,automatic_decision,new_decision,reason,content_revision_hash) values(run.id,target_listing_id,auth.uid(),run.decision,upper(decision),coalesce(normalized_note,normalized_reason,'Проверено модератором'),private.moderation_hash(private.moderation_content(target_listing_id)));
  -- Keep completed automatic results immutable; invalidate in-flight callbacks.
  update private.moderation_runs set status='stale',claim_token=null,completed_at=now(),error_code='human_override' where listing_id=target_listing_id and status in ('queued','running');
end;
$$;

create or replace function public.moderate_listing_checked(target_listing_id uuid,decision text,expected_revision text,request_id uuid,reason_code text default null,note text default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
  return jsonb_build_object('id',target_listing_id,'decision',receipt.new_decision,'status',result_status,'override_id',receipt.id,'revision',receipt.content_revision_hash,'replayed',true,'summary',private.moderation_current_summary(target_listing_id));
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
 return jsonb_build_object('id',target_listing_id,'decision',upper(decision),'status',result_status,'override_id',latest,'revision',current_hash,'replayed',latest is not distinct from prior,'summary',private.moderation_current_summary(target_listing_id));
end;
$$;

create or replace function public.get_listing_moderation(target_listing_id uuid,staff_view boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare output jsonb; staff boolean:=private.has_any_role(array['moderator','admin']);
begin
 if auth.uid() is null or not exists(select 1 from public.listings where id=target_listing_id and (owner_id=auth.uid() or staff)) then raise exception 'not authorized' using errcode='42501';end if;
 if not (staff_view and staff) then return private.owner_moderation_summary(target_listing_id);end if;
 output:=private.get_listing_moderation_before_automatic(target_listing_id,staff_view);
 if staff_view and private.has_any_role(array['moderator','admin']) then
  output:=output||jsonb_build_object('owner_controls',private.is_moderation_owner(),'current_revision',private.moderation_hash(private.moderation_content(target_listing_id)),
   'image_hashes',(select coalesce(jsonb_agg(to_jsonb(h)),'[]') from private.moderation_image_hashes h where h.listing_id=target_listing_id),
   'actions',(select coalesce(jsonb_agg(to_jsonb(m) order by created_at desc),'[]') from public.moderation_actions m where m.listing_id=target_listing_id),
   'owner_edits',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at desc),'[]') from public.admin_audit_log a where a.entity_id=target_listing_id::text and a.action like 'moderation.owner_%'));
 end if;
 if not (output ? 'overrides') then output:=output||jsonb_build_object('overrides',(select coalesce(jsonb_agg(to_jsonb(o) order by created_at desc),'[]') from private.moderation_overrides o where listing_id=target_listing_id));end if;
 return output||jsonb_build_object('summary',private.moderation_current_summary(target_listing_id));
end;
$$;

create function public.moderation_staff_audit(target_listing_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_any_role(array['moderator','admin']) then raise exception 'staff required' using errcode='42501';end if;
 return public.get_listing_moderation(target_listing_id,true);
end;
$$;
revoke all on function public.moderation_staff_audit(uuid) from public,anon,service_role;
grant execute on function public.moderation_staff_audit(uuid) to authenticated;

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
 select coalesce(max(generation),0) into gen from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-4';
 -- Explicit submit may retry a completed technical hold at the SAME revision.
 -- A queued/running run is reused, as is any definitive compatible result.
 if force_new or exists(select 1 from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-4' and generation=gen and status='completed' and decision='HUMAN_REVIEW' and (decision_basis='technical_hold' or error_code='system_error' or automatic_trace->'canonical_families' ? 'ocr_partial_risk')) then gen:=gen+1; end if;
 insert into private.moderation_runs(listing_id,revision_id,content_revision_hash,generation,engine_version,ruleset_version,rules_snapshot)
 values(target,rev,hash,gen,'jevu-moderation-4',version,rules) on conflict do nothing returning id into run;
 if run is null then select id into run from private.moderation_runs where listing_id=target and content_revision_hash=hash and ruleset_version=version and engine_version='jevu-moderation-4' and generation=gen; end if;
 -- Reuse a definitive same-engine/same-ruleset approval without buying another
 -- AI call or issuing a fresh lifetime. A later human override always wins.
 if exists(select 1 from private.moderation_runs r cross join private.moderation_settings m
   where r.id=run and r.status='completed' and r.decision='APPROVED' and m.automatic_enabled and m.auto_approve
   and not exists(select 1 from private.moderation_overrides o where o.listing_id=target and coalesce(o.content_revision_hash,(select content_revision_hash from private.moderation_runs where id=o.run_id))=hash and o.created_at>=r.created_at)) then
  perform private.apply_listing_moderation(target,'approve',null,null,'Compatible content revision approval reused');
 end if;
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
  update private.moderation_runs set ai_calls=ai_calls||jsonb_build_array(jsonb_build_object('provider','openai','model',payload->>'model','schema_version',case when payload->>'schema_version'='moderation-ai-observation-v2' then 'moderation-ai-observation-v2' else 'moderation-ai-observation-v1' end,'status','started','retry_count',n,'created_at',clock_timestamp())) where id=job_id;
  return to_jsonb(n+1);
 elsif operation='record' then
  attempt:=(payload->>'attempt')::integer;
  if attempt is null or attempt not between 1 and jsonb_array_length(job.ai_calls) then raise exception 'invalid attempt';end if;
  entry:=job.ai_calls->(attempt-1);if entry->>'status'<>'started' then return 'false';end if;
  if coalesce(payload->>'status','') not in ('success','timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','ocr_failure','ocr_incomplete','content_unavailable','configuration_missing','provider_4xx')
   or coalesce(payload->>'latency_ms','') !~ '^[0-9]{1,7}$' or coalesce(payload->>'image_count','') !~ '^[0-7]$'
   or (payload->>'input_tokens')::integer not between 0 and 5000000 or (payload->>'output_tokens')::integer not between 0 and 100000 then raise exception 'invalid provider metadata';end if;
  if payload->>'schema_version' is not null and payload->>'schema_version' is distinct from entry->>'schema_version' then raise exception 'schema version conflict';end if;
  entry:=entry||jsonb_build_object('status',payload->>'status','latency_ms',(payload->>'latency_ms')::integer,'image_count',(payload->>'image_count')::integer,'input_tokens',(payload->>'input_tokens')::integer,'output_tokens',(payload->>'output_tokens')::integer,'request_id',case when payload->>'request_id' ~ '^[a-zA-Z0-9_-]{1,160}$' then payload->>'request_id' else null end);
  if payload->>'validation_issue' in ('json','envelope','shape','coverage','provenance','ocr_incomplete','ocr_semantics') then entry:=entry||jsonb_build_object('validation_issue',payload->>'validation_issue');end if;
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
 if coalesce(value->>'schema_version','') not in ('moderation-ai-observation-v1','moderation-ai-observation-v2') or value->>'mode' is distinct from 'shadow'
 or coalesce(value->>'status','') not in ('success','timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','ocr_failure','ocr_incomplete','content_unavailable','configuration_missing','provider_4xx','budget_exhausted','disabled','not_eligible')
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
 return jsonb_build_object('schema_version',value->>'schema_version','mode','shadow','status',value->>'status','recommendation',case when value->>'status'='success' then value->>'recommendation' else 'SHADOW_HUMAN_REVIEW' end,'findings',findings,'subjects',subjects,'ocr_images',(value->>'ocr_images')::integer,'languages',langs,'uncertainty',(value->>'uncertainty')::numeric);
end;
$$;

create or replace function private.sanitize_moderation_automatic(value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare lexical jsonb:='{}'; obs jsonb:='[]'; timeline jsonb:='[]'; ocr jsonb:='[]'; v jsonb; key text;
begin
 if value is null then return null;end if;
 if value->>'version' is distinct from 'jevu-automatic-1' or value->>'decision_source' is distinct from 'AUTOMATIC'
 or coalesce(value->>'mode','') not in ('automatic','manual_fallback')
 or coalesce(value->>'basis','') not in ('deterministic','ai_assisted','fixable','uncertain','technical_hold','switch_disabled')
 or coalesce(value->>'provider_status','') not in ('not_required','success','timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','ocr_failure','ocr_incomplete','content_unavailable','configuration_missing','provider_4xx','budget_exhausted','disabled','not_eligible')
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
 if value ? 'ocr' then
  if jsonb_typeof(value->'ocr') is distinct from 'array' or jsonb_array_length(value->'ocr')>7 then raise exception 'unsafe OCR summary';end if;
  for v in select * from jsonb_array_elements(value->'ocr') loop
   if coalesce(v->>'image_index','') !~ '^[0-6]$' or coalesce(v->>'ocr_status','') not in ('NO_TEXT_DETECTED','TEXT_READ','PARTIAL_TEXT','TECHNICAL_FAILURE') or coalesce(v->>'moderation_relevance','') not in ('none','possible_risk') or v->>'ocr_status'='NO_TEXT_DETECTED' and v->>'moderation_relevance'<>'none' then raise exception 'unsafe OCR state';end if;
   ocr:=ocr||jsonb_build_array(jsonb_build_object('image_index',(v->>'image_index')::integer,'ocr_status',v->>'ocr_status','moderation_relevance',v->>'moderation_relevance'));
  end loop;
 end if;
 return jsonb_build_object('version','jevu-automatic-1','decision_source','AUTOMATIC','mode',value->>'mode','basis',value->>'basis','lexical',lexical,
 'schema_validated',(value->>'schema_validated')::boolean,'provider_status',value->>'provider_status',
 'category',case when value->'category'<>'null' then jsonb_build_object('status',value->'category'->>'status','confidence',(value->'category'->>'confidence')::numeric) end,
 'uncertainty',(value->>'uncertainty')::numeric,'ocr_images',(value->>'ocr_images')::integer,'vision_images',(value->>'vision_images')::integer,
 'ocr',ocr,'observations',obs,'resolved_local_rules',private.moderation_code_array(value->'resolved_local_rules'),'canonical_families',private.moderation_code_array(value->'canonical_families'),'timeline',timeline);
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
 enabled:=settings.automatic_enabled and job.engine_version in ('jevu-moderation-3','jevu-moderation-4') and job.created_at>=settings.automatic_since and trace->>'mode'='automatic';
 complete:=coalesce(enabled and trace->>'schema_validated'='true' and trace->>'provider_status'='success' and (trace->>'uncertainty')::numeric<=.15
  and (trace->>'ocr_images')::integer=image_count and (trace->>'vision_images')::integer=image_count
  and (job.engine_version<>'jevu-moderation-4' or (
   jsonb_array_length(trace->'ocr')=image_count
   and (select count(distinct o->>'image_index') from jsonb_array_elements(trace->'ocr') o)=image_count
   and not exists(select 1 from jsonb_array_elements(trace->'ocr') o where (o->>'image_index')::integer>=image_count or o->>'ocr_status'='TECHNICAL_FAILURE')
 ))
  and result->>'provider'='openai' and result->>'ocr_provider'='openai_vision_ocr' and result->>'error_code' is null
  and image_count between 1 and 7 and jsonb_array_length(result->'stages')=6+image_count*3
  and not exists(select 1 from jsonb_array_elements(result->'stages') s where s->>'status' is distinct from 'PASS')
  and jsonb_array_length(result->'images')=image_count and not exists(select 1 from jsonb_array_elements(result->'images') i where i->>'status' is distinct from 'PASS' or coalesce(i->>'sha256','') !~ '^[a-f0-9]{64}$')
  and exists(select 1 from jsonb_array_elements(job.ai_calls) c where c->>'status'='success' and c->>'schema_version'=case when job.engine_version='jevu-moderation-4' then 'moderation-ai-observation-v2' else 'moderation-ai-observation-v1' end and c->>'model'=result->>'provider_version' and (c->>'image_count')::integer=image_count),false);
 select exists(select 1 from jsonb_array_elements(result->'findings') f join private.moderation_rules r on r.id=(f->>'rule_id')::uuid
  where r.ruleset_version=job.ruleset_version and r.enabled and r.effective_from<=job.created_at and (r.effective_to is null or r.effective_to>job.created_at)
  and f->>'source_type'='text' and f->>'recommended_action'='REJECTED' and f->>'finding_code'=r.code and (f->>'confidence')::numeric=1 and r.legal_status='JEVU_POLICY' and r.action='REJECTED') into hard;
 select exists(select 1 from jsonb_array_elements(result->'findings') f join private.moderation_rules r on r.id=(f->>'rule_id')::uuid
  where r.ruleset_version=job.ruleset_version and r.enabled and r.legal_status='JEVU_POLICY' and r.action='REJECTED'
  and f->>'recommended_action'='REJECTED' and f->>'finding_code'=r.code and (f->>'confidence')::numeric>=.98
  and exists(select 1 from jsonb_array_elements(trace->'observations') o where o->>'present'='true' and o->>'subject'='offered_item' and (o->>'confidence')::numeric>=.98
   and o->>'code'=case r.code when 'drugs' then 'possible_drug' when 'illegal_precursors' then 'possible_precursor' when 'forged_document' then 'possible_fake_document' when 'nicotine' then 'possible_nicotine_product' else 'possible_'||r.code end)) into ai_block;
 if result->>'decision'='APPROVED' and (not complete or exists(select 1 from jsonb_array_elements(trace->'ocr') o where o->>'ocr_status'='PARTIAL_TEXT' and o->>'moderation_relevance'='possible_risk') or not settings.auto_approve or trace->'category'->>'status' is distinct from 'match' or coalesce((trace->'category'->>'confidence')::numeric,0)<.9) then result:=jsonb_set(result,'{decision}','"HUMAN_REVIEW"');end if;
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

revoke all on function private.refresh_moderation_revision(uuid),private.capture_moderation_revision(),private.moderation_current_summary(uuid),private.owner_moderation_summary(uuid) from public,anon,authenticated,service_role;
create or replace function public.appeal_listing_moderation(target_run uuid,message text) returns uuid language plpgsql security definer set search_path='' as $$
declare appeal uuid; target uuid;
begin
 if auth.uid() is null or not private.current_profile_is_active() or length(btrim(message)) not between 10 and 2000 then raise exception 'invalid appeal' using errcode='42501';end if;
 select r.listing_id into target from private.moderation_runs r join public.listings l on l.id=r.listing_id join private.moderation_effective e on e.id=l.id and e.run_id=r.id and e.effective_state in ('needs_fix','auto_rejected','manual_rejected','uncertain','technical') where r.id=target_run and l.owner_id=auth.uid() and l.status in ('pending','rejected') and (r.decision in ('REJECTED','NEEDS_FIX','HUMAN_REVIEW') or exists(select 1 from private.moderation_overrides o where o.run_id=r.id and o.new_decision in ('REJECT','NEEDS_FIX')));
 if target is null then raise exception 'appeal unavailable' using errcode='42501';end if;
 insert into private.moderation_appeals(run_id,owner_id,message) values(target_run,auth.uid(),btrim(message)) on conflict(run_id,owner_id) do nothing returning id into appeal;
 if appeal is null then select id into appeal from private.moderation_appeals where run_id=target_run and owner_id=auth.uid();
 else insert into public.admin_audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'moderation.appeal','listing',target::text);end if;
 return appeal;
end;
$$;
notify pgrst, 'reload schema';
commit;
