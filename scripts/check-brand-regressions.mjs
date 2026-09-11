import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSitesEnvironment,projectRoot,reportFailure,runProcess} from './lib/sites-runtime.mjs';

export async function checkBrandRegressions(environment){
  await runProcess(process.execPath,['--test','tests/brand.test.mjs'],{
    environment,cwd:projectRoot,timeoutMilliseconds:60000,label:'JEVU brand regression build gate',
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  checkBrandRegressions(createSitesEnvironment().environment).catch(reportFailure);
}
