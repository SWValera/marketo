import '../scripts/lib/register-cloudflare-node-shim.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const {photoFailure} = await import('../lib/media/photo-service.ts');

test('provider HEIC decode rejection is a file error, not an unavailable service', () => {
  for (const code of [9412, 9516]) {
    assert.deepEqual(photoFailure(Object.assign(new Error('private provider detail'), {code})),
      {error:'unsupported_image_content', status:400});
  }
});

test('provider limits and unavailable service remain distinct without exposing details', () => {
  assert.deepEqual(photoFailure(Object.assign(new Error('private detail'), {code:9413})),
    {error:'photo_processor_limit', status:413});
  assert.deepEqual(photoFailure(new Error('private provider detail')),
    {error:'photo_processing_unavailable', status:503});
});
