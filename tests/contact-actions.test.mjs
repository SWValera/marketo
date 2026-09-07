import assert from 'node:assert/strict';
import test from 'node:test';
import {hooks,tick,deferred} from './support/client-hooks.mjs';
const id='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
async function start() {
  const tasks=[];const h=await hooks('components/start-conversation.tsx','StartConversation',{
    '@/lib/supabase/browser':{getSupabaseBrowserClient:()=>({})},'@/lib/data/supabase/chat':{getOrCreateListingConversation:(client,listingId,signal)=>{const t={...deferred(),listingId,signal};tasks.push(t);return t.promise;}}});
  return {h,tasks};
}
test('start double click, ignored transport timeout, retry, stale result',async()=>{
  const {h,tasks}=await start();try{h.render();h.button().props.onClick();h.button().props.onClick();h.render();assert.equal(tasks.length,1);assert.equal(h.button().props.disabled,true);
    h.fire();await tick();h.render();assert.equal(tasks[0].signal.aborted,true);assert.match(h.text(),/startFailed/);assert.equal(h.button().props.disabled,false);
    h.button().props.onClick();tasks[1].resolve(other);await tick();tasks[0].resolve(id);await tick();assert.deepEqual(h.navigations,['/messages/'+other]);assert.equal(h.timers.size,0);
  }finally{h.unmount();}
});
test('start listing change and unmount discard results',async()=>{
  const {h,tasks}=await start();h.render();h.button().props.onClick();h.render({listingId:other});await tick();h.render({listingId:other});
  tasks[0].resolve(id);await tick();assert.equal(tasks[0].signal.aborted,true);assert.deepEqual(h.navigations,[]);
  h.button().props.onClick();assert.equal(tasks[1].listingId,other);h.unmount();tasks[1].resolve(other);await tick();assert.equal(h.lateWrites,0);assert.equal(h.timers.size,0);assert.deepEqual(h.navigations,[]);
});
test('self-chat, unavailable listing, and expired authentication have distinct recovery',async()=>{
  for(const [code,key,login] of [['22023','startSelf',false],['42501','startUnavailable',false],['PGRST301','signIn',true]]){
    const {h,tasks}=await start();try{h.render();h.button().props.onClick();tasks[0].reject(new Error('synthetic',{cause:{code}}));await tick();h.render();
      assert.ok(h.text().includes(key));assert.equal(h.nodes(n=>n.type==='a').length,login?1:0);assert.equal(h.button().props.disabled,code==='22023');
    }finally{h.unmount();}
  }
});
async function contacts(){const tasks=[];const h=await hooks('components/listing-contacts.tsx','ListingContacts',{'@/lib/supabase/browser':{getSupabaseBrowserClient:()=>({rpc:()=>({abortSignal:signal=>{const t={...deferred(),signal};tasks.push(t);return t.promise;}})})}});return {h,tasks};}
test('contacts auth-lock timeout releases dock and retry renders both actions',async()=>{
  const {h,tasks}=await contacts();try{h.render();h.fire();await tick();h.render();assert.match(h.text(),/contactsFailed/);h.button().props.onClick();h.render();
    tasks[1].resolve({data:[{allow_messages:true,allow_phone:true}],error:null});await tick();h.render();assert.equal(h.nodes(n=>n.type==='a').length,1);assert.equal(h.nodes(n=>n.type==='phone').length,1);assert.equal(h.timers.size,0);
  }finally{h.unmount();}
});
test('contacts navigation and unmount ignore stale results',async()=>{
  const {h,tasks}=await contacts();h.render();h.render({listingId:other});tasks[0].resolve({data:[{allow_phone:true,allow_messages:true}],error:null});await tick();h.render({listingId:other});assert.match(h.text(),/contactsLoading/);
  h.unmount();tasks[1].resolve({data:[],error:null});await tick();assert.equal(h.lateWrites,0);assert.equal(h.timers.size,0);
});
test('logout timeout/error never report success; duplicate click and retry are safe',async()=>{
  for(const timeout of [true,false]){const tasks=[];const h=await hooks('components/logout-button.tsx','LogoutButton',{'@/lib/supabase/browser':{getSupabaseBrowserClient:()=>({auth:{signOut:options=>{const t={...deferred(),options};tasks.push(t);return t.promise;}}})}});
    try{h.render();h.button().props.onClick();h.button().props.onClick();assert.equal(tasks.length,1);assert.deepEqual(tasks[0].options,{scope:'local'});
      if(timeout)h.fire();else tasks[0].resolve({error:new Error('synthetic')});await tick();h.render();assert.match(h.text(),/auth.errorGeneric/);assert.equal(h.button().props.disabled,false);assert.deepEqual(h.navigations,[]);
      tasks[0].resolve({error:null});await tick();assert.deepEqual(h.navigations,[]);h.button().props.onClick();tasks[1].resolve({error:null});await tick();assert.deepEqual(h.navigations,['/']);assert.equal(h.timers.size,0);
    }finally{h.unmount();}
  }
});
