import assert from 'node:assert/strict';
import test from 'node:test';
import {withPageReadScope,requestMemo,requestCache,fetchWithinRead,readScope} from '../lib/http/read-scope.ts';
import {getRequestUser} from '../lib/auth/request-user.ts';

test('verified identity is shared only inside one read; failures are not retried within it',async()=>{
  let calls=0;
  const client={auth:{async getUser(){calls++;return {data:{user:{id:String(calls)}},error:null};}}};
  const seen=[];
  for(let i=0;i<2;i++){
    const res=await withPageReadScope(new Request('https://test.invalid/'),async()=>{
      const [a,b]=await Promise.all([getRequestUser(client),getRequestUser(client)]);
      assert.equal(a,b);seen.push(a.data.user.id);
      return new Response('ok');
    });await res.text();
  }
  assert.equal(calls,2);assert.notEqual(seen[0],seen[1]);
});

test('metadata and content share a failed loader only until the incoming request ends',async()=>{
  let calls=0;
  const loader=requestCache(async()=>{calls++;throw new Error('fixture');});
  for(let i=0;i<2;i++){
    const res=await withPageReadScope(new Request('https://test.invalid/'),async()=>{
      await assert.rejects(loader());await assert.rejects(loader());
      return new Response('ok');
    });await res.text();
  }
  assert.equal(calls,2);
});

for(const stage of ['headers','body'])test(`one read budget includes stalled ${stage}`,async()=>{
  const start=Date.now();
  await assert.rejects(async()=>{
    const response=await withPageReadScope(new Request('https://test.invalid/'),async()=>{
      if(stage==='headers')return new Promise(()=>{});
      return new Response(new ReadableStream({start(){}}));
    },30);
    await response.text();
  },{name:'AbortError'});
  assert.ok(Date.now()-start<250);
});

test('sequential child fetches inherit one deadline and transport cancellation',async()=>{
  const original=globalThis.fetch;let aborted=false;
  globalThis.fetch=(_input,init)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(new Response('ok')),25);
    init.signal.addEventListener('abort',()=>{aborted=true;clearTimeout(timer);reject(init.signal.reason);},{once:true});
  });
  try{
    await assert.rejects(async()=>{
      const response=await withPageReadScope(new Request('https://test.invalid/'),async()=>{
        const deadline=readScope().deadline;
        await(await fetchWithinRead('https://test.invalid/a')).text();
        assert.equal(readScope().deadline,deadline);
        return fetchWithinRead('https://test.invalid/b');
      },40);await response.text();
    });
    assert.equal(aborted,true);
  }finally{globalThis.fetch=original;}
});

test('concurrent requests never share private pending values',async()=>{
  let calls=0;
  const read=()=>withPageReadScope(new Request('https://test.invalid/'),async()=>new Response(String(await requestMemo('private',async()=>++calls))));
  const values=await Promise.all([read(),read()].map(async r=>(await r).text()));
  assert.deepEqual(values.sort(),['1','2']);
});
