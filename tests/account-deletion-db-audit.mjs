import assert from 'node:assert/strict';
// Offline synthetic fixtures only. Called after restoring the real schema/ACLs.
export async function auditAccountDeletion(db, users, sourceListing) {
  const owner='60000000-0000-4000-8000-000000000006', listing='d6000000-0000-4000-8000-000000000006';
  const token='a'.repeat(64), rotated='b'.repeat(64);
  const image=`listings/${owner}/${listing}/12345678901234567890-12345678-1234-4123-8123-123456789012.jpg`;
  const avatar=`avatars/${owner}/test.png`;
  const role=async (name,sql,args=[])=>{await db.exec('set role '+name);try{return await db.query(sql,args);}finally{await db.exec('reset role');}};
  const begin=(who=owner,cap=token)=>role('service_role','select public.begin_account_deletion($1,$2)',[who,cap]);
  const advance=async(cap=token,keys=[]) => (await role('service_role','select public.advance_account_deletion($1,$2) as data',[cap,keys])).rows[0].data;
  const finish=(cap=token)=>role('service_role','select public.finish_account_deletion($1)',[cap]);
  await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2::jsonb)',[owner,JSON.stringify({display_name:'Synthetic erase owner'})]);
  await db.query('update public.profiles set avatar_path=$2 where id=$1',[owner,avatar]);
  await db.query("update public.profile_private set contact_phone_e164='+77001112233' where user_id=$1",[owner]);
  await db.query(`insert into public.listings(id,owner_id,category_id,settlement_id,slug,title,description,currency_code,status)
    select $1,$2,category_id,settlement_id,'erasure-fixture','Erasure fixture','Synthetic description for deletion',currency_code,'draft'
    from public.listings where id=$3`,[listing,owner,sourceListing]);
  await db.query("insert into public.listing_contacts(listing_id,contact_name,contact_phone_e164,allow_messages,allow_phone) values($1,'Synthetic','+77001112233',true,true)",[listing]);
  await db.query('insert into public.listing_images(listing_id,storage_key) values($1,$2)',[listing,image]);
  const conversation=(await db.query('insert into public.conversations(listing_id,created_by,participant_low_id,participant_high_id) values($1,$2,least($2::uuid,$3::uuid),greatest($2::uuid,$3::uuid)) returning id',[listing,owner,users.buyer])).rows[0].id;
  await db.query("insert into public.conversation_participants(conversation_id,user_id) values($1,$2),($1,$3)",[conversation,owner,users.buyer]);
  // Existing guarded sender SQL is deliberately not bypassed with a real session.
  await db.query("insert into public.messages(conversation_id,sender_id,body) values($1,$2,'Synthetic message preserved for peer')",[conversation,owner]);
  for (const who of ['anon','authenticated']) {
    await assert.rejects(role(who,'select public.begin_account_deletion($1,$2)',[owner,token]),/permission denied/);
    await assert.rejects(role(who,'select public.advance_account_deletion($1)',[token]),/permission denied/);
    await assert.rejects(role(who,'select public.finish_account_deletion($1)',[token]),/permission denied/);
  }
  await assert.rejects(role('service_role','select * from private.account_deletions'),/permission denied/);
  await db.query("insert into public.city_premium_accounts(owner_id,display_name) values($1,'Synthetic account')",[owner]);
  await assert.rejects(begin(),/assisted deletion/);
  assert.equal((await db.query('select status from public.profiles where id=$1',[owner])).rows[0].status,'active');
  assert.equal((await db.query('select count(*)::int as n from private.account_deletions')).rows[0].n,0);
  await db.query('delete from public.city_premium_accounts where owner_id=$1',[owner]);
  await assert.rejects(begin(users.admin),/assisted deletion/);
  await db.query("update public.listing_images set storage_key='avatars/foreign/avatar.png' where listing_id=$1",[listing]);
  await assert.rejects(begin(),/ownership unresolved/);
  await db.query('update public.listing_images set storage_key=$2 where listing_id=$1',[listing,image]);
  await assert.rejects(db.query("insert into public.reports(reporter_id,reason_code) values($1,'spam')",[users.buyer]),/report target required/);
  await db.query("insert into public.reports(reporter_id,listing_id,reported_user_id,reason_code) values($1,$2,null,'spam'),($1,null,$3,'spam'),($1,$2,$3,'spam')",[users.buyer,listing,owner]);
  await begin();
  assert.equal((await db.query('select status from public.profiles where id=$1',[owner])).rows[0].status,'deleted');
  assert.equal((await db.query('select contact_phone_e164 from public.profile_private where user_id=$1',[owner])).rows[0].contact_phone_e164,null);
  for(const table of ['listings','listing_contacts','listing_images']) {
    const column=table==='listings'?'id':'listing_id';
    assert.equal((await db.query(`select count(*)::int n from public.${table} where ${column}=$1`,[listing])).rows[0].n,0);
  }
  assert.equal((await db.query('select count(*)::int n from public.listings where id=$1',[sourceListing])).rows[0].n,1);
  await assert.rejects(db.query("insert into public.city_premium_accounts(owner_id,display_name) values($1,'Late premium')",[owner]),/account unavailable/);
  await assert.rejects(db.query("insert into public.user_roles(user_id,role) values($1,'support')",[owner]),/account unavailable/);
  await assert.rejects(db.query(`insert into public.listings(owner_id,category_id,settlement_id,slug,title,description,status)
    select $1,category_id,settlement_id,'late-listing','Late listing','Synthetic late insert','draft' from public.listings where id=$2`,[owner,sourceListing]),/account unavailable/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  assert.equal((await role('authenticated',"update public.profiles set display_name='Restored' where id=$1 returning id",[owner])).rows.length,0);
  assert.equal((await role('authenticated',"update public.profile_private set contact_phone_e164='+77001112233' where user_id=$1 returning user_id",[owner])).rows.length,0);
  // A report arriving during the external cleanup phase must not strand Auth deletion.
  await db.query("insert into public.reports(reporter_id,reported_user_id,reason_code) values($1,$2,'spam')",[users.buyer,owner]);
  assert.deepEqual((await advance()).keys,[avatar,image]);
  await assert.rejects(finish(),/not finished/);
  // Reconfirming while Auth still exists resumes the same durable job.
  await begin(owner,rotated);await assert.rejects(advance(token),/unavailable/);
  assert.deepEqual((await advance(rotated,['not-an-owned-key'])).keys,[avatar,image]);
  assert.deepEqual((await advance(rotated,[avatar,image])).keys,[]);
  await assert.rejects(finish(rotated),/not finished/);
  await db.query('delete from auth.users where id=$1',[owner]); // Offline Auth API outcome shim.
  await finish(rotated);await finish(rotated);
  assert.equal((await db.query("select count(*)::int n from public.reports where reporter_id=$1 and listing_id is null and reported_user_id is null",[users.buyer])).rows[0].n,4);
  assert.deepEqual(await advance(rotated),{status:'completed',userId:null,keys:[]});
  assert.equal((await db.query('select count(*)::int n from public.profiles where id=$1',[owner])).rows[0].n,0);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users.buyer]);
  const kept=(await role('authenticated','select id,status,participant_low_id,participant_high_id from public.conversations where id=$1',[conversation])).rows[0];
  assert.equal(kept.status,'closed');assert.ok(kept.participant_low_id===null||kept.participant_high_id===null);
  assert.equal((await role('authenticated','select body,sender_id from public.messages where conversation_id=$1',[conversation])).rows[0].sender_id,null);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  assert.equal((await role('authenticated','select private.current_profile_is_active() as ok')).rows[0].ok,false);
  console.log('PASS: account deletion ACLs, blockers, owned key queue, retry, Auth gate, peer preservation; synthetic fixtures only.');
}
