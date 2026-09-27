import test from 'node:test';
import assert from 'node:assert/strict';
import {moderationWeb} from './helpers/moderation-web.mjs';

test('compiled moderation API: one scoped RPC, lazy history, no shared cache and role checks',async()=>{
 const f=await moderationWeb();
 const request=async(path,cookie=f.cookie)=>{
  f.clear();const response=await f.worker.fetch(new Request('http://localhost'+path,{headers:{cookie}}),f.env,f.ctx);
  return {response,body:await response.json(),calls:f.calls()};
 };
 for(const [path,rpc] of [['/api/admin/moderation?view=queue&filter=technical','moderation_dashboard'],['/api/admin/moderation?view=case&id='+f.id,'moderation_case']]){
  const r=await request(path);assert.equal(r.response.status,200);assert.match(r.response.headers.get('cache-control'),/private, no-store/);assert.equal(r.calls.length,4);assert.equal(r.calls.filter(p=>p.includes('/rpc/')&&!p.endsWith('/get_my_account_profile')).length,1);assert.ok(r.calls.some(p=>p.endsWith('/'+rpc)));assert.ok(!JSON.stringify(r.body).includes('automatic_trace'));
 }
 f.setStaff(false);
 for(const view of ['queue','case','audit','metrics']){const r=await request('/api/admin/moderation?view='+view+'&id='+f.id);assert.equal(r.response.status,403);assert.ok(!r.calls.some(p=>p.includes('/moderation_')||p.endsWith('/get_listing_moderation')));}
 const anonymous=await request('/api/admin/moderation?view=queue','');assert.equal(anonymous.response.status,401);assert.ok(!anonymous.calls.some(p=>p.includes('/moderation_')));
});
