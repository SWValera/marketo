// Read-only smoke: drain full responses. A 200 shell alone is not success.
import assert from 'node:assert/strict';
const base=new URL(process.argv[2]??'http://127.0.0.1:5186');
assert.ok(['127.0.0.1','localhost','marketo-staging.arshavin-ivan-mail-ru.workers.dev'].includes(base.hostname));
const results=[];
async function read(path,headers={}) {
  const start=Date.now();
  const response=await fetch(new URL(path,base),{headers,signal:AbortSignal.timeout(15000)});
  const body=await response.text();
  assert.equal(response.status,200,path);
  results.push({path,milliseconds:Date.now()-start,bytes:Buffer.byteLength(body)});
  return body;
}
try {
  const home=await read('/?source=pwa&mode=standalone');
  assert.match(home,/category-tile/);assert.match(home,/Транспорт/);
  assert.doesNotMatch(home,/data-dgst="[^"]+"/);
  const manifestLink=home.match(/<link[^>]*rel="manifest"[^>]*href="([^"]+)"/);
  assert.ok(manifestLink,'manifest link');
  assert.equal(new URL(manifestLink[1],base).origin,base.origin,'PWA manifest must be same-origin');
  const manifest=JSON.parse(await read('/manifest.webmanifest'));
  assert.equal(new URL(manifest.start_url,base).origin,base.origin);
  assert.equal(new URL(manifest.start_url,base).pathname,'/');
  assert.match(await read('/sw.js'),/marketo-static-v10/);
  const catalog=JSON.parse(await read('/api/reference/categories?v=2026-09-05.1'));
  assert.equal(catalog.categories.length,1358);
  for(const [path,text] of [['/categories','Транспорт'],['/category/transport','Легковые автомобили'],
    ['/category/electronics','Электроника'],['/search','Каталог'],['/profile','Войдите'],
    ['/messages','Войдите'],['/favorites','Войдите'],['/login','Добро пожаловать'],['/help','Помощь']]) {
    const html=await read(path);assert.ok(html.includes(text),path+' expected content');
    assert.doesNotMatch(html,/data-dgst="[^"]+"/,path+' server error');
  }
  for(const path of ['/.rsc?_rsc=','/category/transport.rsc?_rsc=']) {
    const rsc=await read(path,{rsc:'1',accept:'text/x-component'});
    assert.match(rsc,/Транспорт/);
  }
  // Simulate leaving the initial page early, then reopening the installed app.
  for(let i=0;i<3;i++) {
    const response=await fetch(new URL('/?source=pwa&mode=standalone',base),{signal:AbortSignal.timeout(15000)});
    await response.body.cancel();
  }
  assert.match(await read('/'),/category-tile/);
  const assets=[...new Set([...home.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map(m=>m[1]))];
  for(const path of assets) {
    assert.equal(new URL(path,base).origin,base.origin);
    const body=await read(path);assert.doesNotMatch(body,/<!DOCTYPE html>/i,path+' must be an asset');
  }
  console.log(JSON.stringify({status:'PASS',origin:base.origin,categories:catalog.categories.length,results},null,2));
} catch(error) {
  console.log(JSON.stringify({status:'FAIL',origin:base.origin,reason:error.message,results},null,2));
  process.exitCode=1;
}
