import {runProcess,projectRoot} from './lib/sites-runtime.mjs';
export function assertPhotoBuildConfiguration(environment) {
  if (environment.MARKETO_IMAGE_PROCESSING !== 'cloudflare') {
    throw new Error('Photo release blocked: verify staging Images entitlement and set MARKETO_IMAGE_PROCESSING=cloudflare before building. No upload fallback is enabled.');
  }
}
export async function checkPhotoRegressions(environment) {
  await runProcess(process.execPath,['--test','--test-concurrency=1',
    'tests/photo-build.test.mjs','tests/photo-client-contract.test.mjs','tests/photo-pipeline.test.mjs','tests/photo-preview.test.mjs','tests/photo-multipart-routing.test.mjs','tests/photo-service.test.mjs','tests/listing-gallery.test.mjs'],{
    environment,cwd:projectRoot,timeoutMilliseconds:90000,killAfterMilliseconds:3000,
    label:'photo pipeline regression build gate',
  });
}
