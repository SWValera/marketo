import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';

async function harness(){
  const state={user:'a',getUser:null,writes:0,authListener:null,now:0,blockRows:false,readSignal:null};const timers=new Map(),events=new Map();let id=0;
  const client={auth:{getUser:()=>state.getUser?state.getUser():Promise.resolve({data:{user:{id:state.user}},error:null}),onAuthStateChange(fn){state.authListener=fn;return {data:{subscription:{unsubscribe(){}}}};}}};
  const exports={};const source=await readFile(resolve(process.env.MARKETO_AUDIT_WORKER_ROOT??'.','components/favorite-store.ts'),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports,Set,Map,Promise,AbortController,DOMException,Date:{now:()=>state.now},queueMicrotask,
    setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(key){timers.delete(key);},
    window:{addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);}},
    document:{visibilityState:'visible',addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);}},
    require(name){
      if(name.includes('/supabase/browser'))return {getSupabaseBrowserClient:()=>client};
      if(name.includes('/supabase/favorites'))return {listFavoriteListingIds:async(_client,userId,signal)=>{state.readSignal=signal;if(state.blockRows)return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));return [{listing_id:userId+'-listing'}];},addFavorite:async()=>{state.writes++;},removeFavorite:async()=>{state.writes++;}};
      throw new Error('Unexpected dependency '+name);
    },
  });
  return {state,exports,timers,events};
}
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};

test('a real SDK missing session is a guest, while an Auth outage remains an error',async()=>{
  const h=await harness();
  const client=createClient('https://reference-test.supabase.co','sb_publishable_reference_test',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async()=>{throw new Error('Guest check must not need the network');}},
  });
  h.state.getUser=()=>client.auth.getUser();
  const guest=await h.exports.loadFavoriteStore();
  assert.equal(guest.error,false);assert.equal(guest.authenticated,false);
  assert.equal(await h.exports.toggleFavoriteListing('fixture'),'authentication_required');
  const failed=await harness();
  failed.state.getUser=async()=>({data:{user:null},error:{name:'AuthApiError',status:503}});
  assert.equal((await failed.exports.loadFavoriteStore()).error,true);
  assert.equal(await failed.exports.toggleFavoriteListing('fixture'),'error');
});

test('actual favorite store cannot reuse one account identifiers for another account',async()=>{
  const h=await harness();await h.exports.loadFavoriteStore();
  assert.deepEqual([...h.exports.readFavoriteStore().ids],['a-listing']);
  h.state.user='b';h.state.authListener?.('SIGNED_IN',{user:{id:'b'}});
  await h.exports.loadFavoriteStore();
  assert.deepEqual([...h.exports.readFavoriteStore().ids],['b-listing']);
  h.state.user='c';
  assert.equal(await h.exports.toggleFavoriteListing('b-listing'),'error','verified identity change must stop a write against stale favorite state');
  assert.equal(h.state.writes,0);
});

test('actual favorite store releases unabortable Auth waiting and ignores its late result',async()=>{
  const h=await harness();let finish;h.state.getUser=()=>new Promise(resolve=>finish=resolve);
  const first=h.exports.loadFavoriteStore();await flush();
  const deadline=[...h.timers.values()].find(timer=>timer.ms<=10000);
  assert.ok(deadline,'favorite read needs one total deadline, including dependency and Auth waiting');
  deadline.fn();assert.equal((await first).error,true);
  h.state.getUser=null;h.state.user='b';await h.exports.loadFavoriteStore();
  finish({data:{user:{id:'a'}},error:null});await flush();
  assert.deepEqual([...h.exports.readFavoriteStore().ids],['b-listing']);
  assert.equal(h.timers.size,0,'finished reads release their timers');
});

test('favorite read checks wall-clock expiry after background and aborts the supported list transport',async()=>{
  const h=await harness();h.state.blockRows=true;
  const pending=h.exports.loadFavoriteStore();await flush();
  assert.ok(h.state.readSignal);
  h.state.now=10000;h.events.get('visibilitychange')();
  assert.equal((await pending).error,true);
  assert.equal(h.state.readSignal.aborted,true);
  assert.equal(h.events.size,0);
});
