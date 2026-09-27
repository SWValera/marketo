// Loopback-only compiled artifact test. Synthetic owner, no external I/O.
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';import {pathToFileURL} from 'node:url';
import {moderationWeb} from '../tests/helpers/moderation-web.mjs';
const artifact=resolve(process.env.JEVU_BROWSER_ARTIFACT??'dist');process.env.JEVU_TEST_WORKER_URL=pathToFileURL(artifact+'/server/index.js').href;
const f=await moderationWeb({latency:120}),mime={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
const asset=async path=>{const file=resolve(artifact+'/client','.'+path);if(!file.startsWith(artifact+'/client/'))return null;try{return new Response(await readFile(file),{headers:{'content-type':mime[extname(file)]??'application/octet-stream'}});}catch{return null;}};
f.env.ASSETS.fetch=async req=>await asset(new URL(req.url).pathname)??new Response(null,{status:404});
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1:4188');let response;
 if(u.pathname==='/__fixture/info')response=Response.json({id:f.id,calls:f.calls()});
 else if(u.pathname==='/__fixture/reset'){f.clear();response=Response.json({ok:true});}
 else if(u.pathname==='/__fixture/fail'){f.failMutation(u.searchParams.get('on')==='true');response=Response.json({ok:true});}
 else if(u.pathname==='/__fixture/upstream'){const target=new URL(u.searchParams.get('url'));target.hostname=new URL(process.env.JEVU_TEST_PUBLIC_SUPABASE_URL??'https://reference-test.supabase.co').hostname;response=await globalThis.fetch(target);}
 else if(u.pathname.startsWith('/api/media/'))response=new Response('<svg xmlns="http://www.w3.org/2000/svg" width="768" height="576"><rect width="768" height="576" fill="#789"/><text x="40" y="100">Synthetic television</text></svg>',{headers:{'content-type':'image/svg+xml'}});
 else{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);response=await asset(u.pathname)??await f.worker.fetch(new Request(u,{method:req.method,headers:{...req.headers,cookie:f.cookie},...(body.length?{body}: {})}),f.env,f.ctx);}
 res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)for await(const c of response.body)res.write(c);res.end();
 }catch(e){res.writeHead(500);res.end('Fixture failure');console.error(e.message);}});server.listen(4188,'127.0.0.1',()=>console.log('Isolated moderation fixture ready'));
