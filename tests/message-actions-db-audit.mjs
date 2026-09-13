import assert from "node:assert/strict";

// Run on the real migrated PostgreSQL schema in the isolated security suite.
export async function auditMessageActions(db, users, conversationId) {
  const ids = ["d1000000-0000-4000-8000-000000000001", "d2000000-0000-4000-8000-000000000002"];
  const as = async (role, id, sql, args = []) => {
    await db.exec("set role " + role);
    try { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]); return await db.query(sql,args); }
    finally { await db.exec("reset role"); }
  };
  const call = (id,sql,args=[]) => as("authenticated",id,sql,args);
  const edit = (user,id,body,stamp=null) => call(user,"select * from public.edit_listing_message($1,$2,$3,$4)",[conversationId,id,body,stamp]);
  const remove = (user,id) => call(user,"select * from public.delete_listing_message($1,$2)",[conversationId,id]);
  for (const [index,user] of [users.buyer,users.owner].entries()) {
    const other = index === 0 ? users.owner : users.buyer, id=ids[index];
    const original=(await call(user,"select * from public.send_listing_message($1,$2,$3)",[conversationId,id,"Original synthetic text"])).rows[0];
    for (const outsider of [other,users.admin,users.suspended]) {
      await assert.rejects(edit(outsider,id,"stolen"),e=>e.code==='42501');
      await assert.rejects(remove(outsider,id),e=>e.code==='42501');
    }
    await assert.rejects(as('anon',null,"select public.edit_listing_message($1,$2,'stolen')",[conversationId,id]),e=>e.code==='42501');
    await assert.rejects(as('anon',null,"select public.delete_listing_message($1,$2)",[conversationId,id]),e=>e.code==='42501');
    await assert.rejects(call(user,"update public.messages set sender_id=$1,body='spoof' where id=$2",[other,id]),e=>e.code==='42501');
    await assert.rejects(call(user,"delete from public.messages where id=$1",[id]),e=>e.code==='42501');
    await assert.rejects(call(user,"select public.delete_listing_message($1,$2)",[ids[1-index],id]),e=>e.code==='42501');
    for (const invalid of ["", " \n\t", "я".repeat(4001)]) await assert.rejects(edit(user,id,invalid),e=>e.code==='22023');
    const changed=(await edit(user,id,"  Изменённый текст 😀\nстрока 2  ")).rows[0];
    assert.equal(changed.body,"Изменённый текст 😀\nстрока 2");
    assert.equal(changed.id,id); assert.equal(changed.sender_id,user); assert.deepEqual(changed.created_at,original.created_at); assert.ok(changed.edited_at);
    assert.deepEqual((await edit(user,id,changed.body)).rows[0].edited_at,changed.edited_at,"retry is idempotent");
    await assert.rejects(edit(user,id,"stale device"),e=>e.code==='40001');
    const known=[{id,edited_at:null,deleted_at:null}];
    const sync=()=>call(other,"select * from public.sync_listing_message_changes($1,$2::jsonb)",[conversationId,JSON.stringify(known)]);
    assert.equal((await sync()).rows[0].body,changed.body,"peer recovers an edit missed during disconnect");
    const deleted=(await remove(user,id)).rows[0]; assert.ok(deleted.deleted_at); assert.equal(deleted.body,'[deleted]');
    assert.deepEqual((await remove(user,id)).rows[0].deleted_at,deleted.deleted_at,"delete retry is idempotent");
    assert.equal((await sync()).rows[0].body,'[deleted]',"reconnect cannot retrieve deleted body");
    assert.equal((await call(other,"select body from public.messages where id=$1",[id])).rows[0].body,'[deleted]',"direct API sees no original body");
    await assert.rejects(edit(user,id,"resurrect",deleted.edited_at),e=>e.code==='42501');
    assert.equal((await db.query("select count(*)::int n from public.messages where id=$1",[id])).rows[0].n,1);
  }
  await assert.rejects(call(users.buyer,"select * from public.sync_listing_message_changes($1,$2::jsonb)",[conversationId,JSON.stringify(Array(101).fill({id:ids[0]}))]),e=>e.code==='22023');
  await assert.rejects(call(users.admin,"select * from public.sync_listing_message_changes($1,'[]')",[conversationId]),e=>e.code==='42501');
  assert.ok((await db.query("select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='messages'")).rows.length);
  assert.equal((await db.query("select relreplident from pg_class where oid='public.messages'::regclass")).rows[0].relreplident,'d','Realtime old row uses primary key only');
}
