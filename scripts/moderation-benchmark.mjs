// Explicit --real opt-in. Default execution is offline and costs nothing.
import {readFile,writeFile,mkdir,open,unlink,symlink,rm,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {loadBenchmark} from '../tests/moderation/benchmark/validate.mjs';
import {summarize} from '../tests/moderation/benchmark/contract.mjs';
import {parseOptions,selectCases,sanitizedResult,metrics} from './lib/moderation-benchmark-core.mjs';
import {readLedger,saveLedger,reserve} from './lib/moderation-benchmark-budget.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),sha=v=>createHash('sha256').update(v).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function loadRules(){
 const source=await readFile(join(root,'supabase/migrations/0040_automated_moderation.sql'),'utf8');
 const pattern=/values\('([a-z_]+)','([^']*)','([^']*)','[^']*','[^']*','semantic_and_offer','(high|critical)','(REJECTED|HUMAN_REVIEW)','(\{[^\n]+?\})','(JEVU_POLICY|LEGAL_REVIEW_REQUIRED)'/g;
 const rules=[...source.matchAll(pattern)].map((m,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),code:m[1],title_ru:m[2],title_kk:m[3],severity:m[4],action:m[5],config:JSON.parse(m[6]),legal_status:m[7],enabled:true,applicable_categories:[]}));
 if(rules.length<10)throw Error('Rule seed extraction failed');return rules;
}
async function productionCheck(worker){
 let token;
 for(const path of [join(homedir(),'.config/.wrangler/config/default.toml'),join(homedir(),'Library/Preferences/.wrangler/config/default.toml')]){
  try{token=(await readFile(path,'utf8')).match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];if(token)break;}catch{}
 }
 if(!token)throw Error('Authorized Wrangler OAuth unavailable');
 const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${worker.account_id}/workers/scripts/${worker.name}/settings`,{headers:{authorization:'Bearer '+token}});token=null;
 if(!res.ok)throw Error('Read-only production config check failed');
 const body=await res.json(),bindings=body.result?.bindings??[];
 const value=name=>bindings.find(b=>b.name===name)?.text;
 if(value('MODERATION_EXTERNAL_AI_ENABLED')!=='false'||value('MODERATION_AI_ENABLED')!=='false'||value('MODERATION_AI_SHADOW_MODE')!=='true')throw Error('Production safe flags not confirmed');
 if(!bindings.some(b=>b.name==='OPENAI_API_KEY'&&b.type==='secret_text'))throw Error('OPENAI_API_KEY missing');
 return {external_ai:false,ai_enabled:false,shadow:true,key_present:true,model:value('MODERATION_AI_MODEL')};
}
async function run(){
 process.chdir(root);
 const options=parseOptions(process.argv.slice(2)),benchmark=await loadBenchmark();
 const sampleSource=await readFile(join(benchmark.root,'first-run-30.json'),'utf8');
 if(options.sample)options.ids=JSON.parse(sampleSource).ids;
 const selected=selectCases(benchmark.cases,options);
 if(!selected.length)throw Error('Empty benchmark selection');
 const selection={mode:options.dryRun?'DRY_RUN':'REAL',...summarize(selected),ids:selected.map(c=>c.id)};
 if(options.dryRun){console.log(JSON.stringify(selection,null,2));return;}
 const directory=join(root,'artifacts/moderation-benchmark');await mkdir(directory,{recursive:true});
 execFileSync('git',['check-ignore','--quiet',directory+'/budget.json']);
 const lock=await open(join(directory,'run.lock'),'wx',0o600);let child,temp;
 const results=[];let runDir;
 let interrupted=false;const terminate=()=>{interrupted=true;child?.kill('SIGTERM');};
 process.once('SIGINT',terminate);process.once('SIGTERM',terminate);
 try{
  const ledger=await readLedger(directory);
  // Prior isolated smoke audit contains metadata only; import once, no keys.
  try{const previous=JSON.parse(await readFile(join(root,'artifacts/moderation-real-smoke-2026-09-26.json'),'utf8'));
   if(!ledger.prior.some(p=>p.source==='smoke-2026-09-26')){
    if(previous.total.api_calls!==previous.calls.length)throw Error('Prior call count mismatch');
    ledger.prior.push({source:'smoke-2026-09-26',date:previous.checked_at.slice(0,10),calls:previous.total.api_calls});
   }
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const imagesSource=await readFile(join(benchmark.root,'images/manifest.json'),'utf8');
  const digest=sha(benchmark.manifest.cases_sha256+sha(imagesSource)+sha(sampleSource));
  const date=new Date().toISOString().slice(0,10),runId=new Date().toISOString().replaceAll(':','-');
  // Preflight the whole requested batch without consuming reservations yet.
  const simulation=structuredClone(ledger);for(const c of selected)reserve(simulation,{id:c.id,date,runId,rerun:options.rerun,digest});
  const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  const authLog=join(directory,'auth-discard.log');try{await symlink('/dev/null',authLog);}catch(e){if(e.code!=='EEXIST')throw e;}
  // Let Wrangler refresh its existing OAuth session; never print credentials.
  execFileSync(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'whoami'],{stdio:'ignore',env:{...process.env,WRANGLER_LOG_PATH:authLog,WRANGLER_SEND_METRICS:'false'}});
  const preview={name:config.name,account_id:'d3e060f3105cfe9ba9059b44375a76d1'};
  const production=await productionCheck(preview);
  if(production.model!==config.vars.MODERATION_AI_MODEL)throw Error('Model differs from deployed configuration');
  const model=production.model;if(!/^gpt-[a-z0-9.-]{1,70}$/.test(model))throw Error('Unsupported configured model format');
  runDir=join(directory,runId);temp=join(runDir,'preview');await mkdir(temp,{recursive:true});
  const rules=await loadRules(),nonce=randomBytes(32).toString('hex');
  const frozen={...selection,benchmark_version:benchmark.manifest.benchmark_version,cases_sha256:benchmark.manifest.cases_sha256,images_manifest_sha256:sha(imagesSource),sample_sha256:sha(sampleSource),digest,model,production,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),created_at:new Date().toISOString(),rules_sha256:sha(JSON.stringify(rules)),labels:'SYNTHETIC_EXPECTED_NOT_HUMAN_REVIEWED',retry_policy:'none',record_mutations:0};
  await writeFile(join(runDir,'frozen.json'),JSON.stringify(frozen,null,2)+'\n',{flag:'wx',mode:0o600});
  const entry=`import {createBenchmarkWorker} from ${JSON.stringify(join(root,'scripts/lib/moderation-benchmark-worker.mjs'))};\nexport default createBenchmarkWorker(${JSON.stringify({cases:selected,images:benchmark.images,rules,nonce,expiresAt:Date.now()+45*60*1000,model})});\n`;
  await writeFile(join(temp,'worker.mjs'),entry,{mode:0o600});
  await writeFile(join(temp,'wrangler.json'),JSON.stringify({...preview,main:'worker.mjs',compatibility_date:config.compatibility_date,compatibility_flags:config.compatibility_flags,images:{binding:'MARKETO_IMAGES'},vars:{MODERATION_EXTERNAL_AI_ENABLED:'false',MODERATION_AI_ENABLED:'false',MODERATION_AI_SHADOW_MODE:'true',MODERATION_AI_MODEL:model}}),{mode:0o600});
  const log=join(temp,'discard.log');await symlink('/dev/null',log);
  child=spawn(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--remote','--config',join(temp,'wrangler.json'),'--ip','127.0.0.1','--port','8794','--inspector-port','9294','--log-level','warn','--show-interactive-dev-session=false'],{cwd:root,stdio:'ignore',env:{...process.env,WRANGLER_LOG_PATH:log,WRANGLER_SEND_METRICS:'false'}});
  const url='http://127.0.0.1:8794',headers={authorization:'Bearer '+nonce,'content-type':'application/json'};
  let health;
  for(let i=0;i<90;i++){if(child.exitCode!==null)throw Error('Preview process stopped');try{const r=await fetch(url+'/health',{headers,signal:AbortSignal.timeout(1000)});if(r.ok){health=await r.json();break;}}catch{}await wait(1000);}
  if(!health?.key_present||health.production_external_ai||!health.shadow||health.auto_approve||health.ai_only_reject||health.model!==model)throw Error('Preview safety/key check failed');
  console.log(JSON.stringify({phase:'preview_ready',...selection,prior_calls_today:ledger.prior.filter(p=>p.date===date).reduce((n,p)=>n+p.calls,0)}));
  let failures=0;
  for(const c of selected){
   if(interrupted)break;
   const fixtures={};for(const ref of new Set([...c.image_fixture_refs,...c.duplicate_reference_refs??[]]))fixtures[ref]=(await readFile(join(benchmark.root,ref))).toString('base64');
   reserve(ledger,{id:c.id,date:new Date().toISOString().slice(0,10),runId,rerun:options.rerun,digest});await saveLedger(directory,ledger);
   let raw;
   try{const response=await fetch(url+'/evaluate',{method:'POST',headers,body:JSON.stringify({id:c.id,fixtures}),signal:AbortSignal.timeout(60000)});raw=response.ok?await response.json():{provider_status:'transport_error',actual_calls:null};}
   catch{raw={provider_status:'transport_error',actual_calls:null};}
   // The preview already projects; project again across the trust boundary.
   const result=sanitizedResult(c,raw);results.push(result);
   await appendFile(join(runDir,'results.jsonl'),JSON.stringify(result)+'\n',{mode:0o600});
   await writeFile(join(runDir,'metrics.json'),JSON.stringify(metrics(results),null,2)+'\n',{mode:0o600});
   console.log(JSON.stringify({case_id:c.id,status:result.provider_status,shadow:result.shadow_recommendation,calls:result.actual_calls}));
   failures=result.provider_status==='success'?0:failures+1;
   if(['configuration_missing','provider_4xx','provider_rate_limit'].includes(result.provider_status)||failures>=3)break;
  }
  console.log(JSON.stringify({results_directory:runDir,...metrics(results)},null,2));
  if(results.length!==selected.length||results.some(r=>!r.schema_valid))process.exitCode=1;
 }finally{
  terminate();if(child&&child.exitCode===null)await Promise.race([new Promise(r=>child.once('exit',r)),wait(5000)]);
  if(child&&child.exitCode===null)child.kill('SIGKILL');
  if(temp)await rm(temp,{recursive:true,force:true});
  process.removeListener('SIGINT',terminate);process.removeListener('SIGTERM',terminate);
  await lock.close();await unlink(join(directory,'run.lock'));
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(()=>{console.error('Benchmark stopped safely; inspect sanitized results/budget. No automatic retries.');process.exitCode=1;});
