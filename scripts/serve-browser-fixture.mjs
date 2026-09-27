// Local production-artifact lab. All database traffic is synthetic; no live writes.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const artifact=resolve(process.env.JEVU_BROWSER_ARTIFACT??'dist');
process.env.JEVU_TEST_WORKER_URL=pathToFileURL(artifact+'/server/index.js').href;
const fixtureUrl=new URL('../tests/rendered-html.test.mjs',import.meta.url);
const source=(await readFile(fixtureUrl,'utf8')).split('test("Home streams')[0];
const fixture=await import('data:text/javascript;base64,'+Buffer.from(source.replaceAll('import.meta.url',JSON.stringify(fixtureUrl.href))+'\nexport {worker,env,ctx,ids,referenceTables};').toString('base64'));
const upstream=globalThis.fetch;
globalThis.fetch=async(...args)=>{await new Promise(r=>setTimeout(r,40));return upstream(...args);};
for(const row of fixture.referenceTables.listings)row.expires_at='2099-01-01T00:00:00Z';
const mime={'.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.html':'text/html'};
async function asset(path){
 const file=resolve(artifact+'/client','.'+path);
 if(!file.startsWith(artifact+'/client/'))return null;
 try{return new Response(await readFile(file),{headers:{'content-type':mime[extname(file)]??'application/octet-stream','cache-control':path==='/sw.js'?'no-store':'public, max-age=3600'}});}catch{return null;}
}
fixture.env.ASSETS.fetch=async request=>await asset(new URL(request.url).pathname)??new Response('Not found',{status:404});
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+server.address().port);
  let response;
  if(url.pathname==='/__fixture/info')response=Response.json({listing:'/listing/'+fixture.referenceTables.listings[0].id+'-'+fixture.referenceTables.listings[0].slug});
  else if(url.pathname==='/__fixture/upstream'){
   const target=new URL(url.searchParams.get('url')); // fixture upstream itself rejects all other hosts
   response=await globalThis.fetch(target);
  }else if(url.pathname.startsWith('/api/media/')){
   await new Promise(r=>setTimeout(r,120));
   response=new Response('<svg xmlns="http://www.w3.org/2000/svg" width="768" height="576"><rect width="768" height="576" fill="#72abc7"/><text x="50" y="100">Synthetic fixture</text></svg>',{headers:{'content-type':'image/svg+xml','cache-control':'public, max-age=3600'}});
  }else response=await asset(url.pathname)??await fixture.worker.fetch(new Request(url,{headers:req.headers}),fixture.env,fixture.ctx);
  res.writeHead(response.status,Object.fromEntries(response.headers));
  if(response.body)for await(const chunk of response.body)res.write(chunk);
  res.end();
 }catch(error){res.writeHead(500);res.end('Fixture failure');console.error(error.message);}
});
server.listen(Number(process.env.JEVU_BROWSER_PORT??4178),'127.0.0.1',()=>console.log('Production fixture: '+artifact+' port '+server.address().port));
