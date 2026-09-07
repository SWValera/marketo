import assert from 'node:assert/strict';
// Native PostgreSQL only; all fixtures and connections belong to a new local clone.
export async function auditAccountDeletionConcurrency({query,pg,waitFor}) {
  const cases=[];
  const seed=async n=>{
    const id=`71000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
    await query(`insert into auth.users(id,raw_user_meta_data) values('${id}','{"display_name":"Synthetic race"}');`);
    return id;
  };
  const listing=id=>`insert into public.listings(owner_id,category_id,settlement_id,slug,title,description,status)
    values('${id}','c4000000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000003','synthetic-race','Synthetic race','Synthetic only','draft');`;
  const sqls={listing,role:id=>`insert into public.user_roles(user_id,role) values('${id}','support');`,
    premium:id=>`insert into public.city_premium_accounts(owner_id,display_name) values('${id}','Synthetic premium');`,
    profile:id=>`set local role authenticated;set local request.jwt.claim.sub='${id}';update public.profiles set display_name='Late edit' where id='${id}';`,
    phone:id=>`set local role authenticated;set local request.jwt.claim.sub='${id}';update public.profile_private set contact_phone_e164='+77001112233' where user_id='${id}';`};
  let n=0;
  for(const [kind,sql] of Object.entries(sqls)) {
    const id=await seed(++n), label='deletion-late-'+kind;
    const coordinator=pg(`begin;set local statement_timeout='25s';select public.begin_account_deletion('${id}',md5('${id}')||md5('${id}'));
\\echo DELETION_LOCKED
`,{keepOpen:true});
    await waitFor(()=>coordinator.output().includes('DELETION_LOCKED'),'Deletion lock not ready');
    const writer=pg(`set application_name='${label}';begin;set local statement_timeout='25s';${sql(id)}commit;`);
    await waitFor(async()=>await query(`select count(*) from pg_stat_activity where application_name='${label}' and wait_event_type='Lock';`)==='1','Late '+kind+' did not wait for profile lock');
    coordinator.child.stdin.end('commit;\n\\q\n');assert.equal((await coordinator.done).code,0);
    const result=await writer.done;
    if(['profile','phone'].includes(kind)) assert.equal(result.code,0,result.err);
    else {assert.notEqual(result.code,0);assert.match(result.err,/account unavailable/);}
    assert.equal(await query(`select count(*) from public.listings where owner_id='${id}';`),'0');
    assert.equal(await query(`select count(*) from public.user_roles where user_id='${id}';`),'0');
    assert.equal(await query(`select count(*) from public.city_premium_accounts where owner_id='${id}';`),'0');
    assert.equal(await query(`select status='deleted' and display_name<>'Late edit' from public.profiles where id='${id}';`),'t');
    assert.equal(await query(`select contact_phone_e164 is null from public.profile_private where user_id='${id}';`),'t');
    cases.push(kind+': blocked or no-op after deletion commits');
  }
  // The opposite ordering must abort before the profile is anonymized.
  for(const kind of ['role','premium']) {
    const id=await seed(++n), label='deletion-after-'+kind;
    const coordinator=pg(`begin;${sqls[kind](id)}
\\echo ASSIGNMENT_LOCKED
`,{keepOpen:true});
    await waitFor(()=>coordinator.output().includes('ASSIGNMENT_LOCKED'),'Assignment lock not ready');
    const eraser=pg(`set application_name='${label}';set statement_timeout='25s';select public.begin_account_deletion('${id}',md5('${id}')||md5('${id}'));`);
    await waitFor(async()=>await query(`select count(*) from pg_stat_activity where application_name='${label}' and wait_event_type='Lock';`)==='1','Deletion did not wait for assignment');
    coordinator.child.stdin.end('commit;\n\\q\n');assert.equal((await coordinator.done).code,0);
    const result=await eraser.done;assert.notEqual(result.code,0);assert.match(result.err,/assisted deletion/);
    assert.equal(await query(`select status from public.profiles where id='${id}';`),'active');
    assert.equal(await query(`select count(*) from private.account_deletions where user_id='${id}';`),'0');
    cases.push(kind+': committed assignment blocks deletion before mutation');
  }
  return {passed:cases.length,cases};
}
