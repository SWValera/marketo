import assert from 'node:assert/strict';
import test from 'node:test';
import {automaticDatabase} from './helpers/automatic-db.mjs';

test('anonymous joined detail preserves listing/child RLS through edits, archive, deletion and expiry',async()=>{
 const f=await automaticDatabase();const {db}=f;
 try{
  const visible=await f.make(),privateId=await f.make();
  const category=(await db.query('select category_id from public.listings where id=$1',[visible])).rows[0].category_id;
  const attribute=(await db.query("insert into public.category_attributes(category_id,key,label_ru,label_kk,data_type) values($1,'fixture_quantity','Количество','Саны','number') returning id",[category])).rows[0].id;
  await db.query('insert into public.listing_attribute_values(listing_id,attribute_id,number_value) values($1,$3,10),($2,$3,99)',[visible,privateId,attribute]);
  await db.query("update public.listings set status='active',published_at=now(),expires_at=now()+interval '30 days' where id=$1",[visible]);
  const read=async()=>{
   await db.exec('set role anon');
   try{return(await db.query(`select l.id,l.title,v.number_value,a.label_ru,a.label_kk
     from public.listings l left join public.listing_attribute_values v on v.listing_id=l.id
     left join public.category_attributes a on a.id=v.attribute_id
     where l.id in ($1,$2) order by l.id`,[visible,privateId])).rows;}finally{await db.exec('reset role');}
  };
  let rows=await read();assert.equal(rows.length,1);assert.equal(rows[0].id,visible);assert.equal(rows[0].number_value,'10');assert.equal(rows[0].label_kk,'Саны');
  await db.query("update public.listings set title='Обновлённый тестовый телефон' where id=$1",[visible]);rows=await read();assert.equal(rows[0].title,'Обновлённый тестовый телефон');
  for(const change of ["status='archived'","deleted_at=now()","expires_at=now()-interval '1 second'"]){
   await db.query("update public.listings set status='active',deleted_at=null,expires_at=now()+interval '1 day' where id=$1",[visible]);
   // Simulate elapsed time only in this disposable database. The lifecycle guard
   // correctly forbids shortening an already published listing's expiry.
   const elapsed=change.startsWith('expires_at');
   if(elapsed)await db.exec('alter table public.listings disable trigger listings_publication_period');
   try{await db.query('update public.listings set '+(elapsed?"published_at=now()-interval '31 days',":"")+change+' where id=$1',[visible]);}
   finally{if(elapsed)await db.exec('alter table public.listings enable trigger listings_publication_period');}
   if(elapsed)assert.equal((await db.query('select expires_at < statement_timestamp() as expired from public.listings where id=$1',[visible])).rows[0].expired,true);
   assert.deepEqual(await read(),[],change);
   await db.exec('set role anon');
   try{assert.equal((await db.query('select count(*)::int n from public.listing_attribute_values where listing_id in ($1,$2)',[visible,privateId])).rows[0].n,0,change+' hides direct children too');}finally{await db.exec('reset role');}
  }
 }finally{await db.close();}
});
