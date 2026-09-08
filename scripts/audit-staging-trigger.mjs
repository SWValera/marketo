// Read-only check. Existing Wrangler credential is used only for Cloudflare API
// authentication. Never print it, full configuration, environment vars or tokens.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const account='d3e060f3105cfe9ba9059b44375a76d1';
const config=await readFile(join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml'),'utf8');
const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw new Error('Existing Wrangler authorization unavailable');
async function get(path){
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
  const body=await response.json();
  if(!response.ok||!body.success)throw new Error('Cloudflare read failed: '+response.status+' codes '+(body.errors??[]).map(e=>e.code).join(','));
  return body.result;
}
try{
  const scripts=await get('/workers/scripts');
  const worker=scripts.find(s=>s.id==='marketo-staging');
  if(!worker?.tag)throw new Error('Requested Worker not found');
  const triggers=await get('/builds/workers/'+encodeURIComponent(worker.tag)+'/triggers');
  const safeCommand=c=>/^(?:npm (?:run build|ci)|npx wrangler (?:deploy|versions upload))$/.test(c??'')?c:'custom command: inspection required';
  const result={worker:worker.id,checkedAt:new Date().toISOString(),triggers:triggers.map(t=>({id:t.trigger_uuid,branch_includes:t.branch_includes,branch_excludes:t.branch_excludes,build:safeCommand(t.build_command),deploy:safeCommand(t.deploy_command),root:t.root_directory,fields:Object.keys(t)}))};
  await writeFile('artifacts/performance-20260908/staging-trigger.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}catch(error){console.log(JSON.stringify({verified:false,reason:error.message}));process.exitCode=1;}
