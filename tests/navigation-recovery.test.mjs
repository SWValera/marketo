import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNavigationRecovery, NAVIGATION_RECOVERY_MS } from '../lib/navigation/recovery.ts';
import { metadataOrigin, SITE_ORIGIN, DIRECT_SITE_ORIGIN } from '../lib/site-origin.ts';

function fixture() {
  let href = 'https://marketo.test/';
  let id = 0;
  const timers = new Map(), navigations = [], pending = [];
  const controller = createNavigationRecovery({ currentHref: () => href, navigate: value => navigations.push(value), onPending: value => pending.push(value), clock: {
    schedule(fn, ms) { assert.equal(ms, NAVIGATION_RECOVERY_MS); timers.set(++id, fn); return id; },
    cancel(key) { timers.delete(key); },
  } });
  return { controller, timers, navigations, pending, commit(value) { href = value; } };
}

test('metadata uses the actual publication or an exact local preview host, never an unknown domain', () => {
  for (const host of [null, 'attacker.test', 'localhost.attacker.test', '127.0.0.1@attacker.test', 'localhost:99999']) assert.equal(metadataOrigin(host).origin, SITE_ORIGIN);
  assert.equal(metadataOrigin('127.0.0.1:5173').origin, 'http://127.0.0.1:5173');
  assert.equal(metadataOrigin('localhost').origin, 'http://localhost');
  assert.equal(metadataOrigin(new URL(DIRECT_SITE_ORIGIN).host).origin, DIRECT_SITE_ORIGIN);
  assert.equal(metadataOrigin(new URL(DIRECT_SITE_ORIGIN).host + '.attacker.test').origin, SITE_ORIGIN);
});

test('accepted navigation gives immediate feedback and recovers one stuck request', () => {
  const f = fixture();
  f.controller.begin('/category/transport');
  assert.equal(f.pending.at(-1), 'https://marketo.test/category/transport');
  assert.equal(f.navigations.length, 0);
  [...f.timers.values()][0]();
  assert.deepEqual(f.navigations, ['https://marketo.test/category/transport']);
  assert.equal(f.pending.at(-1), null);
  assert.equal(f.timers.size, 0);
});

test('completed and superseded transitions never redirect to an older target', () => {
  const f = fixture();
  f.controller.begin('/category/transport');
  const oldTimer = [...f.timers.values()][0];
  f.controller.begin('/profile');
  oldTimer();
  assert.deepEqual(f.navigations, []);
  assert.equal(f.timers.size, 1);
  f.commit('https://marketo.test/profile');
  [...f.timers.values()][0]();
  assert.deepEqual(f.navigations, []);
  f.controller.finish();
  assert.equal(f.timers.size, 0);
});

test('external links, hash-only links and unsafe schemes never start recovery', () => {
  const f = fixture();
  for (const href of ['https://other.test/profile', '//other.test/', 'javascript:alert(1)', '/#catalog', '/']) f.controller.begin(href);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.navigations, []);
});

test('query-only navigation is covered and cancellation removes the watchdog', () => {
  const f = fixture();
  f.commit('https://marketo.test/profile');
  f.controller.begin('/profile?tab=archive');
  assert.equal(f.timers.size, 1);
  f.controller.finish();
  assert.equal(f.timers.size, 0);
});

test('default timers do not call browser host functions with a custom clock receiver', () => {
  const schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout;
  const receivers = [];
  try {
    globalThis.setTimeout = function () { receivers.push(this); return 1; };
    globalThis.clearTimeout = function () { receivers.push(this); };
    const recovery = createNavigationRecovery({ currentHref: () => 'https://marketo.test/', navigate() {}, onPending() {} });
    recovery.begin('/profile');
    recovery.finish();
    assert.equal(receivers.length, 2);
    assert.ok(receivers.every(receiver => receiver === undefined || receiver === globalThis));
  } finally { globalThis.setTimeout = schedule; globalThis.clearTimeout = cancel; }
});

test('feedback is non-blocking and preserves caller cancellation and new-tab link behavior', async () => {
  const link = await readFile(new URL('../components/app-link.tsx', import.meta.url), 'utf8');
  const feedback = await readFile(new URL('../components/navigation-feedback.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(link, /onNavigate=\{/);
  assert.match(link, /prevented = true; event\.preventDefault\(\)/);
  assert.match(link, /!prevented && !props\.download/);
  assert.doesNotMatch(feedback, /\[pathname, search\]/);
  assert.match(feedback, /removeEventListener\(PAGE_READ_EVENT, onRead\)/);
  assert.match(css, /\.navigation-feedback \{[^}]*pointer-events: none/);
});
