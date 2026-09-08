import {writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const origin='https://marketo-staging.arshavin-ivan-mail-ru.workers.dev';
const phase=process.argv[2]??'before';
if(!['before','after'].includes(phase))throw new Error('before|after');
const results=[];
for(const path of ['/','/categories','/category/transport','/profile','/messages']){
  const samples=[];
  for(let i=0;i<20;i++){
    const start=performance.now();
    try{
      const response=await fetch(origin+path,{headers:{accept:'text/html'},signal:AbortSignal.timeout(15000)});
      const headers=performance.now()-start;
      const body=await response.text();
      samples.push({headers,bodyComplete:performance.now()-start,status:response.status,bytes:Buffer.byteLength(body),
        ray:response.headers.get('cf-ray'),cache:response.headers.get('cf-cache-status'),
        hasMain:body.includes('id="main-content"'),renderError:/data-dgst="[^"]+"|data-marketo-error="true"/.test(body)});
    }catch(error){samples.push({bodyComplete:performance.now()-start,error:error.name});}
  }
  const times=samples.map(s=>s.bodyComplete).sort((a,b)=>a-b);
  const result={path,n:20,p50:times[9],p95:times[18],max:times[19],errors:samples.filter(s=>s.error||s.status!==200||s.renderError).length,samples};
  results.push(result);console.log(JSON.stringify({path,p95:result.p95,errors:result.errors}));
}
await mkdir('artifacts/performance-20260908',{recursive:true});
await writeFile(`artifacts/performance-20260908/live-public-${phase}.json`,JSON.stringify({phase,origin,measuredAt:new Date().toISOString(),conditions:'Unauthenticated HTTP GET from this Windows host; full response body, not browser paint. No personal data or response bodies saved. Deployment correlation is recorded separately.',results},null,2));
