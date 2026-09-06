-- READ ONLY. Run only after the approved 0029 transaction.
with expected(signature,definer,guest) as (values
 ('public.save_listing_draft_with_contacts(uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb,boolean,uuid)',false,false),
 ('public.get_listing_contact_options(uuid)',true,true),
 ('public.get_or_create_listing_conversation(uuid)',true,false),
 ('private.can_send_listing_message(uuid)',true,false),
 ('public.send_listing_message(uuid,uuid,text)',true,false),
 ('public.mark_listing_conversation_read(uuid,uuid)',true,false),
 ('public.get_my_conversation_inbox(integer,integer)',false,false)
)
select expected.signature as check_name,
  coalesce(p.prosecdef=expected.definer and p.proconfig @> array['search_path=""']::text[]
    and has_function_privilege('authenticated',p.oid,'EXECUTE')
    and has_function_privilege('anon',p.oid,'EXECUTE')=expected.guest
    and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE'),false) as ok
from expected left join pg_proc p on p.oid=to_regprocedure(expected.signature)
union all select 'Политика проверяет участника, отправителя и запрет сообщений',
  exists(select 1 from pg_policies where schemaname='public' and tablename='messages'
    and policyname='messages_participant_insert' and roles=array['authenticated']::name[]
    and with_check ilike '%sender_id%' and with_check ilike '%can_send_listing_message%')
union all select 'Приватные контактные таблицы не открыты гостям',
  not has_table_privilege('anon','public.listing_contacts','SELECT')
  and not has_table_privilege('anon','public.profile_private','SELECT')
union all select 'Отметка прочтения меняется только через защищённую функцию',
  not has_column_privilege('authenticated','public.conversation_participants','last_read_at','UPDATE');
