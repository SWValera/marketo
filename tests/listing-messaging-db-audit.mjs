import assert from "node:assert/strict";

export async function auditListingMessaging(db, users, listingId, conversationId, { protectedPhones = false } = {}) {
  const stranger = "99000000-0000-4000-8000-000000000009";
  await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{}')", [stranger]);
  const as = async (role, id, sql, args=[]) => {
    await db.exec("set role " + role);
    try { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]); return await db.query(sql,args); }
    finally { await db.exec("reset role"); }
  };
  const call = (id,sql,args=[]) => as("authenticated",id,sql,args);
  const options = () => as("anon",null,"select * from public.get_listing_contact_options($1)",[listingId]);
  await db.query("update public.listing_contacts set allow_messages=true,allow_phone=false,contact_phone_e164='+77001112233' where listing_id=$1",[listingId]);
  assert.deepEqual((await options()).rows, [{allow_messages:true,allow_phone:false,phone:null}]);
  await assert.rejects(as("anon",null,"select * from public.listing_contacts"),/permission denied/);
  await db.query("update public.listing_contacts set allow_phone=true where listing_id=$1",[listingId]);
  assert.equal((await options()).rows[0].phone,protectedPhones ? null : "+77001112233",
    "The legacy options RPC must keep phones private once release 0030 is installed");
  await assert.rejects(call(users.owner,"select public.get_or_create_listing_conversation($1)",[listingId]),/yourself/);
  await assert.rejects(as("anon",null,"select public.get_or_create_listing_conversation($1)",[listingId]),/permission denied/);
  await assert.rejects(call(users.suspended,"select public.get_or_create_listing_conversation($1)",[listingId]),/active profile/);
  assert.equal((await call(users.buyer,"select public.get_or_create_listing_conversation($1) as id",[listingId])).rows[0].id,conversationId);

  const send = (user,id,body) => call(user,"select * from public.send_listing_message($1,$2,$3)",[conversationId,id,body]);
  const first = "a1000000-0000-4000-8000-000000000001", reply = "a2000000-0000-4000-8000-000000000002";
  const row = (await send(users.buyer,first,"Здравствуйте!")).rows[0];
  assert.equal(row.sender_id,users.buyer);
  assert.equal((await send(users.buyer,first,"Здравствуйте!")).rows[0].id,first);
  assert.equal((await db.query("select count(*)::int as n from public.messages where id=$1",[first])).rows[0].n,1);
  await assert.rejects(send(users.buyer,first,"Другой текст"),/retry conflict/);
  await assert.rejects(send(stranger,reply,"Чужой диалог"),/unavailable/);
  await assert.rejects(send(users.suspended,reply,"test"),/unavailable/);
  await assert.rejects(send(users.buyer,reply," \n\t"),/invalid message/);
  await assert.rejects(send(users.buyer,reply,"я".repeat(4001)),/invalid message/);
  assert.equal((await call(stranger,"select id from public.messages where conversation_id=$1",[conversationId])).rows.length,0);
  assert.equal((await call(stranger,"select id from public.conversations where id=$1",[conversationId])).rows.length,0);
  await assert.rejects(call(stranger,"select public.mark_listing_conversation_read($1,$2)",[conversationId,first]),/unavailable/);
  await send(users.owner,reply,"Добрый день!");
  const inbox = user => call(user,"select public.get_my_conversation_inbox(1,20) as result");
  assert.ok((await inbox(users.buyer)).rows[0].result.items.find(x=>x.id===conversationId).unread_count > 0);
  assert.deepEqual((await inbox(stranger)).rows[0].result,{items:[],total:0});
  assert.deepEqual((await inbox(users.admin)).rows[0].result,{items:[],total:0},"staff inbox must not list other users' conversations");
  await call(users.buyer,"select public.mark_listing_conversation_read($1,$2)",[conversationId,reply]);
  assert.equal((await inbox(users.buyer)).rows[0].result.items.find(x=>x.id===conversationId).unread_count,0);
  await assert.rejects(call(users.buyer,
    "update public.conversation_participants set last_read_at=now()+interval '1 year' where conversation_id=$1 and user_id=$2",
    [conversationId,users.buyer]), error=>error.code==='42501');
  const marker=()=>db.query("select last_read_at from public.conversation_participants where conversation_id=$1 and user_id=$2",[conversationId,users.buyer]);
  const currentMarker=(await marker()).rows[0].last_read_at;
  await call(users.buyer,"select public.mark_listing_conversation_read($1,$2)",[conversationId,first]);
  assert.deepEqual((await marker()).rows[0].last_read_at,currentMarker,"older receipt must not move backward");
  await send(users.owner,"a8000000-0000-4000-8000-000000000008","Новое сообщение после прочтения");
  assert.equal((await inbox(users.buyer)).rows[0].result.items.find(x=>x.id===conversationId).unread_count,1);
  // Simulate a pre-release invalid marker as the isolated database administrator.
  await db.query("update public.conversation_participants set last_read_at=now()+interval '1 year' where conversation_id=$1 and user_id=$2",[conversationId,users.buyer]);
  await call(users.buyer,"select public.mark_listing_conversation_read($1,$2)",[conversationId,reply]);
  assert.deepEqual((await marker()).rows[0].last_read_at,currentMarker,"legacy future marker must recover to the stored message");
  assert.equal((await inbox(users.buyer)).rows[0].result.items.find(x=>x.id===conversationId).unread_count,1);
  assert.deepEqual((await call(users.buyer,"select public.get_my_conversation_inbox(2147483647,50) as result")).rows[0].result.items,[]);

  await db.query("update public.conversations set status='blocked' where id=$1",[conversationId]);
  await assert.rejects(send(users.buyer,"a3000000-0000-4000-8000-000000000003","blocked"),/unavailable/);
  await assert.rejects(call(users.buyer,"select public.get_or_create_listing_conversation($1)",[listingId]),/unavailable/);
  await db.query("update public.conversations set status='active' where id=$1",[conversationId]);
  await db.query("update public.listing_contacts set allow_messages=false where listing_id=$1",[listingId]);
  await assert.rejects(call(users.buyer,"select public.get_or_create_listing_conversation($1)",[listingId]),/unavailable/);
  await assert.rejects(send(users.buyer,"a3000000-0000-4000-8000-000000000003","disabled"),/unavailable/);
  await assert.rejects(call(users.buyer,"insert into public.messages(conversation_id,sender_id,body) values($1,$2,'direct bypass')",[conversationId,users.buyer]),/row-level security/);
  await db.query("update public.listing_contacts set allow_messages=true,allow_phone=false where listing_id=$1",[listingId]);
  await db.query("update public.profiles set status='suspended' where id=$1",[users.owner]);
  assert.deepEqual((await options()).rows,[]);
  await assert.rejects(send(users.buyer,"a3000000-0000-4000-8000-000000000003","disabled peer"),/unavailable/);
  await db.query("update public.profiles set status='active' where id=$1",[users.owner]);

  const base=(await db.query("select category_id,settlement_id from public.listings where id=$1",[listingId])).rows[0];
  const args=[base.category_id,base.settlement_id,"Contact consent test","Long test description",100,"KZT","Test seller","+77001112233",true,"[]",true];
  const sql="select * from public.save_listing_draft_with_contacts($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)";
  const created=(await call(users.owner,sql,[...args,null])).rows[0];
  assert.equal((await db.query("select allow_phone from public.listing_contacts where listing_id=$1",[created.listing_id])).rows[0].allow_phone,true);
  assert.deepEqual((await as("anon",null,"select * from public.get_listing_contact_options($1)",[created.listing_id])).rows,[],"draft phones stay private");
  await call(users.owner,sql,[...args.slice(0,10),false,created.listing_id]);
  assert.equal((await db.query("select allow_phone from public.listing_contacts where listing_id=$1",[created.listing_id])).rows[0].allow_phone,false);
  await assert.rejects(call(stranger,sql,[...args,created.listing_id]),error => error.code === "42501" && /not editable/.test(error.message));
  const before=(await db.query("select count(*)::int as n from public.listings")).rows[0].n;
  const invalid=[...args]; invalid[7]=null;
  await assert.rejects(call(users.owner,sql,[...invalid,null]),/constraint|phone/i);
  assert.equal((await db.query("select count(*)::int as n from public.listings")).rows[0].n,before,"failed consent must roll back the entire draft");
}
