import assert from 'node:assert/strict';
import test from 'node:test';
import {runAccountDeletionBatch} from '../lib/account/deletion.ts';
const user='10000000-0000-4000-8000-000000000001';
const key=`listings/${user}/20000000-0000-4000-8000-000000000002/test-image.jpg`;
function fixture({keys=[key],status='pending',mediaFailure=false,authFailure=false,finishFailure=false}={}) {
  const calls=[]; let remaining=keys,authGone=false,state=status;
  const deps={
    rpc: async(name,args)=>{calls.push([name,args]);
      if(name==='advance_account_deletion') {remaining=remaining.filter(k=>!args.p_deleted_keys.includes(k));return {data:{status:state,userId:state==='completed'?null:user,keys:remaining.slice(0,100)},error:null};}
      assert.equal(name,'finish_account_deletion');assert.equal(authGone,true);assert.equal(remaining.length,0);
      if(finishFailure){finishFailure=false;return {data:null,error:Error('retry finish')};}
      state='completed';return {data:null,error:null};
    },
    deleteMedia:async keys=>{calls.push(['media',keys]);if(mediaFailure){mediaFailure=false;throw Error('R2 unavailable');}},
    deleteAuth:async id=>{calls.push(['auth',id]);assert.equal(remaining.length,0);if(authFailure){authFailure=false;throw Error('Auth unavailable');}authGone=true;},
  };
  return {deps,calls,run:()=>runAccountDeletionBatch(deps,'a'.repeat(64))};
}
test('account deletion orders R2 before acknowledgement, Auth before finished',async()=>{
  const f=fixture();assert.equal(await f.run(),'completed');
  assert.deepEqual(f.calls.map(c=>c[0]),['advance_account_deletion','media','advance_account_deletion','auth','finish_account_deletion']);
  assert.equal(f.calls[3][1],user);
});
test('already-completed retries perform no destructive operation',async()=>{
  const f=fixture({keys:[],status:'completed'});assert.equal(await f.run(),'completed');assert.equal(f.calls.length,1);
});
test('untrusted/foreign media keys never reach R2 or Auth',async()=>{
  for(const bad of ['../secret','avatars/other-user/a.png',`avatars/${user}/../a.png`,`listings/${user}/invalid/key.png`]){
    const f=fixture({keys:[bad]});await assert.rejects(f.run(),/invalid_deletion_key/);assert.equal(f.calls.length,1);
  }
});
test('R2 failure retains queue; retry safely repeats removal',async()=>{
  const f=fixture({mediaFailure:true});await assert.rejects(f.run());assert.equal(f.calls.some(c=>c[0]==='auth'),false);
  assert.equal(f.calls.filter(c=>c[0]==='advance_account_deletion').length,1);
  assert.equal(await f.run(),'completed');assert.equal(f.calls.filter(c=>c[0]==='media').length,2);
});
test('Auth and final SQL failures are resumable without claiming completion',async()=>{
  for(const option of ['authFailure','finishFailure']){
    const f=fixture({[option]:true});await assert.rejects(f.run());assert.equal(await f.run(),'completed');
    assert.equal(f.calls.filter(c=>c[0]==='media').length,1);
  }
});
test('large accounts use bounded batches and defer Auth deletion to last batch',async()=>{
  const f=fixture({keys:Array.from({length:105},(_,n)=>`avatars/${user}/image-${n}.png`)});
  assert.equal(await f.run(),'pending');assert.equal(f.calls.some(c=>c[0]==='auth'),false);
  assert.equal(await f.run(),'completed');assert.equal(f.calls.find(c=>c[0]==='media')[1].length,100);
});
