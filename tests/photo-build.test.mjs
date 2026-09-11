import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {assertPhotoBuildConfiguration} from '../scripts/check-photo-regressions.mjs';

test('an upload build cannot silently ship without explicit Images configuration', async () => {
  for (const value of [undefined, '', 'false', 'local']) {
    assert.throws(() => assertPhotoBuildConfiguration({MARKETO_IMAGE_PROCESSING:value}), /Photo release blocked/);
  }
  assert.doesNotThrow(() => assertPhotoBuildConfiguration({MARKETO_IMAGE_PROCESSING:'cloudflare'}));
  const script = await readFile(new URL('../scripts/build-verified.mjs', import.meta.url), 'utf8');
  assert.ok(script.indexOf('assertPhotoBuildConfiguration(environment)') < script.indexOf('await checkPageReadRegressions(environment)'));
});
