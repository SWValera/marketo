import assert from 'node:assert/strict';
import test from 'node:test';
import {Miniflare, createFetchMock} from 'miniflare';
import {resolve} from 'node:path';
import {readdir, readFile} from 'node:fs/promises';

// Runs the built route, not a copied handler. There is deliberately no Images
// mock: these requests must be denied before any decoder or persistent store.
test('built photo endpoint denies anonymous and cross-origin originals in workerd', async () => {
  const root = resolve(process.env.MARKETO_AUDIT_WORKER_ROOT || 'dist/server');
  const paths = (await readdir(root, {recursive:true})).filter(path => path.endsWith('.js') && path !== 'index.js');
  const modules = await Promise.all(['index.js', ...paths].map(async path => ({
    type:'ESModule', path:resolve(root, path), contents:await readFile(resolve(root, path), 'utf8'),
  })));
  const network = createFetchMock();
  network.disableNetConnect();
  const runtime = new Miniflare({
    host:'127.0.0.1',
    workers:[{
      // Windows local workerd HTTP transport resets chunked responses when a
      // Worker rejects a large unread body. Reproduced with a standalone 401
      // handler, without vinext. Buffer only in this test gateway, then call
      // the unchanged compiled application through a native service binding.
      // All application auth, action routing and multipart checks still run.
      name:'photo-test-transport',modules:true,compatibilityDate:'2026-05-22',fetchMock:network,
      script:'export default {async fetch(request,env){const body=request.body?await request.arrayBuffer():undefined;return env.APP.fetch(new Request(request,{body}));}}',
      serviceBindings:{APP:'photo-built-app'},
    },{
      name:'photo-built-app',modules,modulesRoot:root,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],fetchMock:network,
      bindings:{NEXT_PUBLIC_SUPABASE_URL:'https://reference-test.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_reference_test'},
      serviceBindings:{ASSETS:() => new Response('not found', {status:404})},
    }],
  });
  try {
    const localOrigin = (await runtime.ready).origin;
    async function postMultipart(path, form, origin) {
      const request = new Request(localOrigin+path, {method:'POST', body:form});
      const bytes = await request.arrayBuffer();
      return runtime.dispatchFetch(request.url, {method:'POST', redirect:'manual', body:bytes,
        headers:{origin, 'content-type':request.headers.get('content-type'), 'content-length':String(bytes.byteLength)}});
    }
    // This is intentionally > vinext's 1 MiB Server Action limit. Before the
    // routing fix same-origin uploads failed with generic 413 before API auth.
    // Cross-origin rejection must remain intact after bypassing action parsing.
    for (const [origin, status, error] of [
      [localOrigin, 401, 'authentication_required'],
      ['https://foreign.test', 403, 'cross_origin_request_denied'],
    ]) {
      const form = new FormData();
      for (let i=0; i<2; i++) form.append('photos', new File([new Uint8Array(600*1024)], 'phone.jpg', {type:'image/jpeg'}));
      const response = await postMultipart('/api/listings/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/images', form, origin);
      assert.equal(response.status, status, 'multipart API request must reach its own auth/CSRF checks');
      try { assert.equal((await response.json()).error, error); }
      catch(cause) {throw new Error(`Photo API response body failed after status ${response.status}; length=${response.headers.get('content-length')}; encoding=${response.headers.get('transfer-encoding')}`,{cause});}
    }
    // Page forms are not API handlers and must retain the small action limit.
    const form = new FormData();
    form.append('payload', new Blob([new Uint8Array(1200*1024)]));
    const page = await postMultipart('/', form, localOrigin);
    assert.equal(page.status, 413, 'page form retains the Server Action limit');
    await page.arrayBuffer();
    for (const [origin, status, error] of [
      ['https://jevu.kz', 401, 'authentication_required'],
      ['https://foreign.test', 403, 'cross_origin_request_denied'],
    ]) {
      const response = await runtime.dispatchFetch('https://jevu.kz/api/photos/normalize', {
        method:'POST', headers:{origin, 'content-type':'image/heic'}, body:new Uint8Array(64),
      });
      assert.equal(response.status, status);
      assert.equal((await response.json()).error, error);
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
  } finally {
    await runtime.dispose();
    await network.close();
  }
});
