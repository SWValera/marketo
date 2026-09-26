// Controlled configuration release, not a schema migration. No network here.
import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {lexicalConfigs,LEXICAL_RULESET_VERSION,LEXICAL_BASE_VERSION} from '../lib/moderation/rulesets/lexical-v2.ts';
export function lexicalReleaseSQL(operation,release,definition={configs:lexicalConfigs,version:LEXICAL_RULESET_VERSION,base:LEXICAL_BASE_VERSION}){
 const {version,base}=definition;
 if(!['prepare','activate','rollback'].includes(operation)||!/^[-a-zA-Z0-9_.]{7,80}$/.test(release))throw Error('Explicit operation and release reference required');
 const config=JSON.stringify(definition.configs),actor=JSON.stringify({actor_kind:'authorized_database_operator',executor:'Codex',release,base_version:base,version,scope:'Technical lexical matcher review; existing policy and legal classification unchanged'});
 const audit=op=>`insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,metadata) values(null,'moderation.rules_${op}','moderation_ruleset','${version}',$audit$${actor}$audit$::jsonb);`;
 const verify=`if (select count(*) from private.moderation_rules where ruleset_version='${version}')<>13 or exists(select 1 from private.moderation_rules r full join jsonb_each(configs) j on r.code=j.key where r.ruleset_version='${version}' and r.config->'lexical' is distinct from j.value) then raise exception 'lexical config verification failed';end if;
 if exists(select 1 from private.moderation_rules n join private.moderation_rules b on b.code=n.code and b.ruleset_version='${base}' where n.ruleset_version='${version}' and ((n.config-'lexical') is distinct from (b.config-'lexical') or (to_jsonb(n)-array['id','created_at','updated_at','ruleset_version','config']) is distinct from (to_jsonb(b)-array['id','created_at','updated_at','ruleset_version','config']))) then raise exception 'policy metadata changed';end if;`;
 let action;
 if(operation==='prepare')action=`
 if exists(select 1 from private.moderation_rulesets where version='${version}') then ${verify} return;end if;
 if not exists(select 1 from private.moderation_rulesets where version='${base}' and status='active') then raise exception 'unexpected active base';end if;
 if (select count(*) from private.moderation_rules where ruleset_version='${base}')<>13 or exists(select 1 from private.moderation_rules where ruleset_version='${base}' and not(configs?code)) then raise exception 'unexpected rule families';end if;
 insert into private.moderation_rulesets(version,status) values('${version}','draft');
 ${audit('clone')}
 insert into private.moderation_rules(code,jurisdiction,title_ru,title_kk,description_ru,description_kk,rule_type,scope,applicable_categories,severity,action,enabled,priority,config,legal_status,legal_basis,legal_source_title,legal_source_reference,effective_from,effective_to,ruleset_version)
 select r.code,r.jurisdiction,r.title_ru,r.title_kk,r.description_ru,r.description_kk,r.rule_type,r.scope,r.applicable_categories,r.severity,r.action,r.enabled,r.priority,r.config||jsonb_build_object('lexical',configs->r.code),r.legal_status,r.legal_basis,r.legal_source_title,r.legal_source_reference,r.effective_from,r.effective_to,'${version}' from private.moderation_rules r where r.ruleset_version='${base}';
 ${audit('edit')}
 ${verify}
 update private.moderation_rulesets set status='reviewed' where version='${version}' and status='draft';
 ${audit('review')}`;
 if(operation==='activate')action=`
 ${verify}
 if exists(select 1 from private.moderation_rulesets where version='${version}' and status='active') then return;end if;
 if not exists(select 1 from private.moderation_rulesets where version='${version}' and status='reviewed') or not exists(select 1 from private.moderation_rulesets where version='${base}' and status='active') then raise exception 'reviewed target and active base required';end if;
 update private.moderation_rulesets set status='retired' where version='${base}' and status='active';
 update private.moderation_rulesets set status='active',activated_at=now() where version='${version}';
 ${audit('activate')}`;
 if(operation==='rollback')action=`
 if not exists(select 1 from private.moderation_rulesets where version='${version}' and status='active') then raise exception 'lexical ruleset is not active';end if;
 update private.moderation_rulesets set status='retired' where version='${version}';
 update private.moderation_rulesets set status='active',activated_at=now() where version='${base}' and status='retired';if not found then raise exception 'base unavailable';end if;
 ${audit('rollback')}`;
 return `-- Authorized operator configuration release ${release}; no identity impersonation.\nbegin;\nset local lock_timeout='5s';\ndo $release$\ndeclare configs jsonb:=$configs$${config}$configs$::jsonb;\nbegin\nperform pg_advisory_xact_lock(400040);\nif (select auto_approve from private.moderation_settings) is distinct from false then raise exception 'auto approval must remain off';end if;\n${action}\nend;\n$release$;\ncommit;\nselect version,status from private.moderation_rulesets where version in ('${base}','${version}') order by version;\n`;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [operation,release]=process.argv.slice(2),sql=lexicalReleaseSQL(operation,release);await mkdir('artifacts/moderation-lexical-v2',{recursive:true});const path='artifacts/moderation-lexical-v2/'+operation+'.sql';await writeFile(path,sql,{mode:0o600});console.log(JSON.stringify({operation,path,bytes:Buffer.byteLength(sql),network_calls:0}));
}
