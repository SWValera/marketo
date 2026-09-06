// Focused executable PostgreSQL test of the messaging/contacts core.
// This is NOT a full production catalog clone or a production preflight.
import { readFile, readdir } from "node:fs/promises";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { createPGliteTestDatabase, closePGliteTestDatabase } from "./pglite-test-database.mjs";
import { auditListingMessaging } from "./listing-messaging-db-audit.mjs";
const db=await createPGliteTestDatabase({extensions:{pg_trgm,pgcrypto}});
const users={owner:"10000000-0000-4000-8000-000000000001",buyer:"20000000-0000-4000-8000-000000000002",admin:"40000000-0000-4000-8000-000000000004",suspended:"50000000-0000-4000-8000-000000000005"};
try {
  await db.exec(`
    create schema auth;
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    grant usage on schema auth to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create publication supabase_realtime;
  `);
  const directory=new URL("../supabase/migrations/",import.meta.url);
  for(const name of (await readdir(directory)).filter(name=>name.endsWith(".sql")).sort()) {
    const number=Number(name.slice(0,4));
    if(number<=12 || [14,16,23,29].includes(number)) {
      await db.exec(await readFile(new URL(name,directory),"utf8"));
      console.log("Applied core migration "+name.slice(0,4));
    }
  }
  await db.exec(`
    insert into public.locales(code,name_ru,name_kk) values('ru','Русский','Орыс');
    insert into public.countries(id,code,slug,name_ru,name_kk,currency_code,currency_symbol,phone_code)
      values('c1000000-0000-4000-8000-000000000001','KZ','test-kz','Test','Test','KZT','₸','+7');
    insert into public.regions(id,country_id,code,slug,name_ru,name_kk,kind)
      values('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','T','test-region','Test','Test','region');
    insert into public.settlements(id,region_id,slug,name_ru,name_kk,kind)
      values('c3000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000002','test-city','Test','Test','city');
    insert into public.categories(id,slug,name_ru,name_kk)
      values('c4000000-0000-4000-8000-000000000004','test-category','Test','Test');
  `);
  for(const [name,id] of Object.entries(users)) await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2::jsonb)",[id,JSON.stringify({display_name:name})]);
  await db.query("update public.profiles set status='suspended' where id=$1",[users.suspended]);
  await db.query("insert into public.user_roles(user_id,role) values($1,'admin')",[users.admin]);
  const listingId="d1000000-0000-4000-8000-000000000001";
  await db.query(`insert into public.listings(id,owner_id,category_id,settlement_id,slug,title,description,status,published_at,expires_at)
    values($1,$2,'c4000000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000003','messaging-test','Test listing','Test description for a listing','active',now(),now()+interval '1 month')`,[listingId,users.owner]);
  await db.query("insert into public.listing_contacts(listing_id,contact_name,allow_messages) values($1,'Test',true)",[listingId]);
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users.buyer]);
  const conversationId=(await db.query("select public.get_or_create_listing_conversation($1) as id",[listingId])).rows[0].id;
  await db.exec("reset role");
  await auditListingMessaging(db,users,listingId,conversationId);
  console.log("PASS: focused database contacts/messaging audit; full catalog clone remains separate.");
} finally { await closePGliteTestDatabase(db); }
