import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {transformMultipartRoute} from '../build/multipart-route-guard.ts';

const id = '/node_modules/vinext/dist/server/app-rsc-handler.js';
const installed = await readFile(new URL('../node_modules/vinext/dist/server/app-rsc-handler.js', import.meta.url), 'utf8');

// Execute the actual installed dispatch expression; integration tests also run
// this branch in the compiled Worker, including real action parsing and CSRF.
async function progressiveCalls(source, routeHandler, path='/api/listings/id/images') {
  const start = source.indexOf('const progressiveActionResult =');
  const end = source.indexOf('if (progressiveActionResult instanceof Response)', start);
  assert.ok(start > 0 && end > start);
  let calls = 0;
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  await new AsyncFunction('options', 'actionId', 'cleanPathname', 'contentType', 'middlewareContext', 'request',
    source.slice(start, end))({
      matchRoute: () => routeHandler === null ? null : {route: {routeHandler}},
      handleProgressiveActionRequest: async () => { calls++; return null; },
    }, null, path, 'multipart/form-data', {}, new Request('https://jevu.test'));
  return calls;
}

test('real vinext source reproduces API/action misrouting; adapter changes only matched route handlers', async () => {
  assert.equal(await progressiveCalls(installed, {}), 1, 'baseline intercepts API uploads');
  const patched = transformMultipartRoute(installed, id);
  assert.equal(await progressiveCalls(patched, {}), 0, 'API owns body limits and parsing');
  assert.equal(await progressiveCalls(patched, undefined), 1, 'page forms keep action safeguards');
  assert.equal(await progressiveCalls(patched, null), 1, 'unknown paths do not bypass action safeguards');
  assert.equal(await progressiveCalls(patched, {}, '/api/other'), 1, 'unrelated API behavior is unchanged');
});

test('adapter fails closed on dependency drift and is included in the normal Vite build', async () => {
  assert.equal(transformMultipartRoute(installed, '/app/api/listings/route.ts'), null);
  assert.throws(() => transformMultipartRoute('changed framework', id), /contract changed/);
  assert.throws(() => transformMultipartRoute(installed + installed, id), /contract changed/);
  const config = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /multipartRouteGuard\(\)/);
});
