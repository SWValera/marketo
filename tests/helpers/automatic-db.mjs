import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {lexicalReleaseSQL} from '../../scripts/prepare-moderation-lexical-ruleset.mjs';
import {lexicalConfigs,LEXICAL_RULESET_VERSION,LEXICAL_BASE_VERSION} from '../../lib/moderation/rulesets/lexical-v1.ts';
export const users={seller:'81000000-0000-4000-8000-000000000001',owner:'82000000-0000-4000-8000-000000000002',moderator:'83000000-0000-4000-8000-000000000003',stranger:'84000000-0000-4000-8000-000000000004'};
/** Entire database is isolated, including auth identities. Never uses Supabase. */
export async function automaticDatabase(){
 const db=new PGlite({extensions:{pg_trgm,pgcrypto}});
 try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;grant usage on schema auth to anon,authenticated,service_role;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create publication supabase_realtime;`);
 for(const name of(await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
 const as=async(user,sql,args=[])=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');try{return await db.query(sql,args);}finally{await db.exec('reset role');}};
 const service=async(sql,args=[])=>{await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role service_role');try{return await db.query(sql,args);}finally{await db.exec('reset role');}};
 const prior={configs:lexicalConfigs,version:LEXICAL_RULESET_VERSION,base:LEXICAL_BASE_VERSION};
 await db.exec(lexicalReleaseSQL('prepare','automatic-fixture',prior));await db.exec(lexicalReleaseSQL('activate','automatic-fixture',prior));await db.exec(lexicalReleaseSQL('prepare','automatic-fixture'));await db.exec(lexicalReleaseSQL('activate','automatic-fixture'));
 await db.exec("insert into public.countries(code,slug,name_ru,name_kk,currency_code,currency_symbol,phone_code) values('KZ','fixture-kz','KZ','KZ','KZT','T','+7') on conflict do nothing;insert into public.locales(code,name_ru,name_kk) values('ru','Russian','Russian') on conflict do nothing;");
 const country=(await db.query("select id from public.countries where code='KZ'")).rows[0].id;
 const region=(await db.query("insert into public.regions(country_id,code,slug,name_ru,name_kk,kind) values($1,'auto-fixture','auto-fixture','Test','Test','region') returning id",[country])).rows[0].id;
 const city=(await db.query("insert into public.settlements(region_id,slug,name_ru,name_kk,kind) values($1,'auto-fixture','Test','Test','city') returning id",[region])).rows[0].id;
 const cats={};for(const [slug,ru,kk] of [['car','Автомобили','Автокөліктер'],['phone','Телефоны','Телефондар'],['furniture','Мебель','Жиһаз'],['book','Книги','Кітаптар'],['other','Прочее','Басқа']])cats[slug]=(await db.query("insert into public.categories(slug,name_ru,name_kk) values($1,$2,$3) returning id",['auto-fixture-'+slug,ru,kk])).rows[0].id;
 for(const id of Object.values(users))await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{\"display_name\":\"Synthetic fixture\"}')",[id]);
 await db.query("insert into public.user_roles(user_id,role) values($1,'admin'),($1,'moderator'),($2,'moderator')",[users.owner,users.moderator]);
 await as(users.owner,"select public.moderation_admin('settings',$1)",[{automatic_enabled:true,auto_approve:true,auto_reject:true,reason:'Isolated automated release fixtures'}]);
 let seq=0;
 const make=async({title='Обычный телефон',description='Телефон в хорошем состоянии. Синтетическое объявление.',category='phone',seller=users.seller}={})=>{
  const id=(await as(seller,"insert into public.listings(owner_id,category_id,settlement_id,slug,title,description) values($1,$2,$3,$4,$5,$6) returning id",[seller,cats[category],city,'auto-fixture-'+seq++,title,description])).rows[0].id;
  await as(seller,"insert into public.listing_contacts(listing_id,contact_name) values($1,'Fixture')",[id]);await db.query("insert into public.listing_images(listing_id,storage_key,sort_order) values($1,$2,0)",[id,'listings/'+id+'/fixture.jpg']);return id;
 };
 const submit=(id,seller=users.seller)=>as(seller,'select public.submit_listing_with_promotion_choice($1,null)',[id]);
 const claim=async()=>(await service('select public.claim_moderation_job() job')).rows[0].job;
 const finish=async(job,value)=>(await service('select public.finish_moderation_job($1,$2,$3) outcome',[job.id,job.claim_token,value])).rows[0].outcome;
 const record=async(job,meta)=>{const n=(await service("select public.moderation_shadow_job('reserve',$1,$2,$3) n",[job.id,job.claim_token,{model:meta.model,eligible_since:job.automatic_since}])).rows[0].n;if(n===null)throw Error('fixture_budget_exhausted');await service("select public.moderation_shadow_job('record',$1,$2,$3)",[job.id,job.claim_token,{attempt:n,...meta}]);};
 const hash=async id=>(await db.query('select private.moderation_hash(private.moderation_content($1)) hash',[id])).rows[0].hash;
 return {db,as,service,make,submit,claim,finish,record,hash,users};
 }catch(error){await db.close();throw error;}
}
