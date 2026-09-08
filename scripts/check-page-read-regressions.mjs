import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSitesEnvironment,projectRoot,reportFailure,runProcess} from './lib/sites-runtime.mjs';

// These tests execute real source/runtime functions with synthetic transports.
// They never read live services or depend on the compiled public environment.
export async function checkPageReadRegressions(environment){
  const isolated={...environment};
  delete isolated.MARKETO_AUDIT_WORKER_ROOT;
  delete isolated.MARKETO_TEST_UNPATCHED;
  const names=['read-scope','loading-causality','page-navigation','attribute-loading',
    'error-page-retry','category-directory-retry','favorite-read','service-worker-deadline','service-worker','test-plan'];
  await runProcess(process.execPath,['--test','--test-concurrency=1',...names.map(name=>`tests/${name}.test.mjs`)],{
    environment:isolated,cwd:projectRoot,timeoutMilliseconds:60000,killAfterMilliseconds:3000,
    label:'page-read regression build gate',
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  checkPageReadRegressions(createSitesEnvironment().environment).catch(reportFailure);
}
