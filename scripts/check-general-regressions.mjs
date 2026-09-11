import {readdir} from 'node:fs/promises';
import {createSitesEnvironment,projectRoot,runProcess,reportFailure} from './lib/sites-runtime.mjs';

// Explicitly the non-SQL regression group. npm test remains the complete entry
// point including all three PGlite suites; this script never labels itself that.
async function main(){
  const {environment}=createSitesEnvironment();
  environment.NEXT_PUBLIC_SUPABASE_URL='https://reference-test.supabase.co';
  environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_reference_test';
  environment.MARKETO_MEDIA_BUCKET_NAME='marketo-test-media';
  environment.MARKETO_IMAGE_PROCESSING='cloudflare';
  for(const key of ['NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','MARKETO_AUDIT_WORKER_ROOT','MARKETO_TEST_UNPATCHED','MARKETO_DB_AUDIT_SCOPE'])delete environment[key];
  await runProcess(process.execPath,['scripts/build-verified.mjs'],{environment,cwd:projectRoot,timeoutMilliseconds:600000,label:'fixture production build'});
  const sql=new Set(['supabase-security.test.mjs','supabase-migrations.test.mjs','premium-commercial-security.test.mjs']);
  const files=(await readdir('tests')).filter(x=>x.endsWith('.test.mjs')&&!sql.has(x)).sort();
  await runProcess(process.execPath,['--import','./scripts/lib/register-cloudflare-node-shim.mjs','--test','--test-concurrency=1',...files.map(x=>'tests/'+x)],{
    environment,cwd:projectRoot,timeoutMilliseconds:900000,label:'all non-SQL regression tests',
  });
}
main().catch(reportFailure);
