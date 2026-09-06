import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as pagination from "../lib/data/pagination.ts";
import { mergeMessages } from "../lib/chat/messages.ts";
const source = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const modules = { "@/lib/data/pagination":pagination, "@/lib/media/public-url":{ publicMediaUrl:()=>null } };
const adapter={};
new Function("require","exports",ts.transpileModule(await source("lib/data/supabase/chat.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)
  (name=>{ assert.ok(name in modules,name); return modules[name]; },adapter);
const id="10000000-0000-4000-8000-000000000001", next="20000000-0000-4000-8000-000000000002";
function clientFixture(result) {
  const calls=[], query={};
  for(const method of ["select","eq","is","order","limit","or","abortSignal"]) query[method]=(...args)=>{calls.push([method,...args]);return query;};
  query.then=(resolve,reject)=>Promise.resolve(result).then(resolve,reject);
  return {calls,client:{from:(...args)=>{calls.push(["from",...args]);return query;},rpc:(...args)=>{calls.push(["rpc",...args]);return query;}}};
}
test("chat merges retries exactly once and preserves microsecond/tie order and read receipts",()=>{
  const item={id,body:"Текст",sentAt:"2026-09-06T10:00:00.000001+00:00",own:true,read:true};
  const latest={...item,id:next,sentAt:"2026-09-06T10:00:00.000002+00:00",read:false};
  const result=mergeMessages([latest,item],[{...item,read:false}]);
  assert.equal(result.length,2); assert.equal(result[0].id,id); assert.equal(result[0].read,true);
  assert.equal(mergeMessages([item],[{...item,body:"Текст\nс переносом"}])[0].body,"Текст\nс переносом");
});
test("send derives sender on server and keeps the same id for retries",async()=>{
  const f=clientFixture({data:[{id,body:"Hello",sender_id:"actor",created_at:"2026-09-06"}],error:null});
  await adapter.sendTextMessage(f.client,next,"actor"," Hello ",id);
  await adapter.sendTextMessage(f.client,next,"actor"," Hello ",id);
  const calls=f.calls.filter(c=>c[0]==="rpc");
  assert.equal(calls[0][1],"send_listing_message");
  assert.deepEqual(calls[0][2],{target_conversation_id:next,client_message_id:id,message_body:"Hello"});
  assert.deepEqual(calls[1][2],calls[0][2]);
  await assert.rejects(adapter.sendTextMessage(f.client,next,"actor"," ".repeat(4),id));
  await assert.rejects(adapter.sendTextMessage(f.client,next,"actor","я".repeat(4001),id));
  await assert.rejects(adapter.sendTextMessage(f.client,next,"actor","ok","not-a-uuid"));
});
test("history keyset uses both timestamp and id, is bounded, excludes deleted rows, rejects injected cursor",async()=>{
  const f=clientFixture({data:[],error:null});
  await adapter.readMessagePage(f.client,next,{after:{id,sentAt:"2026-09-06T10:00:00.123456+00:00"}});
  assert.ok(f.calls.some(c=>c[0]==="limit"&&c[1]===101));
  assert.ok(f.calls.some(c=>c[0]==="eq"&&c[1]==="conversation_id"&&c[2]===next));
  assert.ok(f.calls.some(c=>c[0]==="is"&&c[1]==="deleted_at"&&c[2]===null));
  assert.match(f.calls.find(c=>c[0]==="or")[1],/created_at.gt.*and\(created_at.eq.*id.gt/);
  await assert.rejects(adapter.readMessagePage(f.client,next,{after:{id,sentAt:"x),id.neq.null"}}));
});
test("read receipt acknowledges a stored message and never sends a client clock or user id",async()=>{
  const f=clientFixture({data:null,error:null});
  await adapter.markConversationRead(f.client,next,id);
  assert.deepEqual(f.calls[0],["rpc","mark_listing_conversation_read",{target_conversation_id:next,through_message_id:id}]);
});
test("inbox uses one scoped RPC, paginates, and distinguishes errors from no conversations",async()=>{
  const f=clientFixture({data:{items:[],total:25},error:null});
  assert.equal((await adapter.listUserConversations(f.client,"actor",{page:1,pageSize:20})).nextCursor,"2");
  assert.equal(f.calls.length,1);
  await assert.rejects(adapter.listUserConversations(clientFixture({data:null,error:{code:"08006"}}).client,"actor"));
});
test("phone consent defaults off, and private profile numbers are never a fallback",async()=>{
  const sql=await source("supabase/migrations/0029_listing_contacts_messaging.sql");
  const contact=await source("components/listing-contacts.tsx");
  assert.match(sql,/p_allow_phone boolean default false/);
  assert.match(sql,/case when contact.allow_phone then contact.contact_phone_e164 else null end/);
  assert.match(contact,/href=\{"tel:" \+ phone\}/);
  assert.doesNotMatch(contact,/profile_private|contact_phone_e164/);
  assert.match(await source("lib/publish/contract.ts"),/allowPhone: z.boolean\(\).default\(false\)/);
});
test("chat refresh stays local, pauses hidden tabs, protects repeated send and preserves failures",async()=>{
  const composer=await source("components/chat-composer.tsx"), poll=await source("components/use-chat-polling.ts");
  assert.match(composer,/if \(flight.current \|\| disabled\) return/);
  assert.match(composer,/attempt.current.body !== body/);
  assert.doesNotMatch(composer,/router.refresh|localStorage|sessionStorage/);
  assert.match(poll,/document.visibilityState === "visible" && navigator.onLine/);
  assert.match(poll,/stopped \|\| running \|\| !visible\(\)/);
  const page=await source("app/messages/new/page.tsx");
  assert.match(page,/StartConversation listingId/);
  assert.doesNotMatch(page,/getOrCreateListingConversation/,"GET rendering must not create chats");
});
