import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {normalizeListingPhotoForUpload} from '../lib/media/client-image-normalization.ts';

test('a 13 MB original goes to the normalizer without decoding pixels on the phone', async () => {
  const file = new File([new Uint8Array(13_000_000)], 'phone.HEIC', {type:'image/heic'});
  let calls = 0;
  const transport = async (url, init) => {
    calls++;
    assert.equal(url, '/api/photos/normalize');
    assert.equal(init.body, file);
    assert.equal(init.method, 'POST');
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(new Uint8Array(128), {headers:{'content-type':'image/jpeg'}});
  };
  const result = await normalizeListingPhotoForUpload(file, transport);
  assert.equal(calls, 1);
  assert.equal(result.type, 'image/jpeg');
  assert.equal(result.name, 'photo.jpg');
});

test('selection uses the same source format contract and does not decode originals locally', async () => {
  const source = await readFile(new URL('../components/publish-form.tsx', import.meta.url), 'utf8');
  const normalizer = await readFile(new URL('../lib/media/client-image-normalization.ts', import.meta.url), 'utf8');
  assert.match(source, /accept=\{photoSourceAccept\}/);
  assert.doesNotMatch(normalizer, /new Image\(|createImageBitmap|createElement\("canvas"\)/);
  assert.doesNotMatch(source, /file\.size > 12 \* 1024 \* 1024/);
});
