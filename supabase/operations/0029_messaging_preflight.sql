-- READ ONLY. Select project qiyfcuhldcleggfogzsu explicitly in Supabase.
-- Every result must be true. An independent, tested schema backup is required.
select '01 Базовые функции сохранения доступны' as check_name,
  to_regprocedure('public.create_listing_draft(uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb)') is not null
  and to_regprocedure('public.update_listing_draft(uuid,uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb)') is not null as ok
union all select '02 Новый выпуск ещё не применялся',
  to_regprocedure('public.save_listing_draft_with_contacts(uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb,boolean,uuid)') is null
  and to_regprocedure('public.get_listing_contact_options(uuid)') is null
  and to_regprocedure('public.send_listing_message(uuid,uuid,text)') is null
  and to_regprocedure('public.mark_listing_conversation_read(uuid,uuid)') is null
  and to_regprocedure('public.get_my_conversation_inbox(integer,integer)') is null
  and to_regprocedure('private.can_send_listing_message(uuid)') is null
union all select '03 Защищённые таблицы используют RLS',
  (select count(*)=7 and bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('listings','listing_contacts','profiles','profile_private','conversations','conversation_participants','messages') and c.relkind='r')
union all select '04 Приватные контакты не доступны гостю',
  not has_table_privilege('anon','public.listing_contacts','SELECT')
  and not has_table_privilege('anon','public.profile_private','SELECT')
union all select '05 Действует срок публикации 0028',
  coalesce((select prosrc ilike '%expires_at > statement_timestamp()%' from pg_proc
    where oid=to_regprocedure('public.get_or_create_listing_conversation(uuid)')),false)
union all select '06 Действует исходная защита отправителя',
  exists(select 1 from pg_policies where schemaname='public' and tablename='messages'
    and policyname='messages_participant_insert' and cmd='INSERT' and roles=array['authenticated']::name[]
    and with_check ilike '%sender_id%' and with_check ilike '%is_conversation_participant%'
    and with_check ilike '%current_profile_is_active%')
union all select '07 Нет общих разрешений на RPC',
  not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where n.nspname in ('public','private') and a.grantee=0 and a.privilege_type='EXECUTE');
