import assert from 'node:assert/strict';
import test from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {fetchWithDeadline} from '../lib/http/fetch-deadline.ts';
import {createNavigationRecovery} from '../lib/navigation/recovery.ts';

test('expired transport is not retried with a fresh per-attempt deadline',async()=>{
  const originalFetch=globalThis.fetch,originalTimeout=globalThis.setTimeout;
  let calls=0;
  globalThis.setTimeout=(callback,_ms,...args)=>originalTimeout(callback,0,...args);
  globalThis.fetch=async()=>{calls++;throw new DOMException('operation expired','TimeoutError');};
  try {
    const client=createClient('https://test.invalid','public-fixture',{global:{fetch:fetchWithDeadline},auth:{persistSession:false,autoRefreshToken:false}});
    await client.from('categories').select('id');
    assert.equal(calls,1,'TimeoutError must not start another full-budget attempt');
  }finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;}
});

test('repeated click does not replace the original navigation deadline',()=>{
  let timers=0;const active=new Map();
  const recovery=createNavigationRecovery({currentHref:()=> 'https://marketo.test/',navigate:()=>{},onPending:()=>{},clock:{
    schedule(fn,ms){active.set(++timers,{fn,ms});return timers;},cancel(id){active.delete(id);},
  }});
  recovery.begin('/profile');const first=[...active.keys()][0];
  recovery.begin('/profile');assert.equal([...active.keys()][0],first);
  recovery.finish();
});
