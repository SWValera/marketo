import assert from "node:assert/strict";
import test from "node:test";
import { mergeMessages, swipeIntent } from "../lib/chat/messages.ts";
const initial={id:"1",body:"original",sentAt:"2026-09-13T00:00:00.000001Z",own:true,read:true};
const edited={...initial,body:"edited",editedAt:"2026-09-13T00:01:00.000002Z"};
const deleted={...edited,body:"[deleted]",deletedAt:"2026-09-13T00:02:00Z"};
test("out-of-order history, realtime and retries never undo edits or soft deletion",()=>{
  for (const batch of [[initial,edited,initial],[edited,initial,edited]]) assert.equal(mergeMessages([],batch)[0].body,"edited");
  for (const batch of [[deleted,edited,initial],[initial,deleted,edited],[edited,initial,deleted]]) {
    const rows=mergeMessages([],batch); assert.equal(rows.length,1); assert.equal(rows[0].body,""); assert.ok(rows[0].deletedAt); assert.equal(rows[0].read,true);
  }
  assert.equal(mergeMessages([edited],[{...edited,editedAt:"2026-09-13T00:01:00.000001Z",body:"older microsecond"}])[0].body,"edited");
});
test("new arrivals and old page reconciliation preserve order and 100+ messages",()=>{
  const batch=Array.from({length:150},(_,i)=>({...initial,id:String(i).padStart(3,'0'),body:String(i)}));
  const changed={...batch[20],body:"edit",editedAt:edited.editedAt};
  const rows=mergeMessages(mergeMessages(batch,[changed]),batch.slice().reverse());
  assert.equal(rows.length,150); assert.equal(rows[20].body,'edit'); assert.deepEqual(rows.map(x=>x.id),batch.map(x=>x.id));
});
test("swipe threshold distinguishes vertical scroll, jitter and a deliberate horizontal gesture",()=>{
  assert.equal(swipeIntent(-12,2),'pending'); assert.equal(swipeIntent(-45,7),'left');
  assert.equal(swipeIntent(45,7),'right'); assert.equal(swipeIntent(-25,48),'scroll');
  assert.equal(swipeIntent(-40,35),'pending');
});
