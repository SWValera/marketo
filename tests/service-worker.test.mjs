import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function createWorkerHarness({
  match = async () => null,
  fetch = async () => ({ ok: true, clone: () => ({}) }),
  open,
  put = async () => undefined,
} = {}) {
  const handlers = new Map();
  const opened = [];
  const puts = [];
  const deleted = [];
  let claimed = false;
  const cache = {
    async addAll(paths) { opened.push({ addAll: paths }); },
    async match(request) { return match(request); },
    async put(request, response) { puts.push({ request, response }); return put(request, response); },
  };
  const caches = {
    async open(name) { opened.push({ name }); return open ? open(name, cache) : cache; },
    async match() { throw new Error("global cache matching is forbidden"); },
    async keys() { return ["foreign-application-cache", "marketo-static-v5", "marketo-static-v6", "marketo-static-v7", "marketo-static-v8", "marketo-static-v9", "marketo-static-v10", "jevu-static-v0", "jevu-static-v1"]; },
    async delete(name) { deleted.push(name); return true; },
  };
  const self = {
    location: { origin: "https://marketo.test" },
    clients: { async claim() { claimed = true; } },
    async skipWaiting() {},
    addEventListener(type, handler) { handlers.set(type, handler); },
  };
  vm.runInNewContext(workerSource, {
    URL,
    setTimeout,
    clearTimeout,
    AbortSignal,
    AbortController,
    Response: { error: () => ({ error: true }) },
    caches,
    fetch,
    self,
  });
  return { handlers, opened, puts, deleted, claimed: () => claimed };
}

function dispatchFetch(harness, request) {
  let responsePromise;
  const lifetimePromises = [];
  harness.handlers.get("fetch")({
    request,
    respondWith(value) { responsePromise = Promise.resolve(value); },
    waitUntil(value) { lifetimePromises.push(Promise.resolve(value)); },
  });
  return { response: responsePromise, lifetime: Promise.all(lifetimePromises) };
}

function headers(values) {
  const normalized = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return { get(name) { return normalized.get(name.toLowerCase()) ?? null; } };
}

for (const failure of ['reject', 'hang']) {
  for (const destination of ['script', 'reference']) {
    test(`CacheStorage open ${failure} cannot block ${destination} loading`, async () => {
      const network = {ok:true,clone:()=>({})};
      let calls=0;
      const harness=createWorkerHarness({
        open:async()=>{if(failure==='reject') throw new Error('storage unavailable');return new Promise(()=>{});},
        fetch:async()=>{calls++;return network;},
      });
      const event=dispatchFetch(harness,{
        url:'https://marketo.test'+(destination==='reference'?'/api/reference/categories?v=release-1':'/assets/app.js'),
        method:'GET',mode:'same-origin',destination:destination==='reference'?'':destination,
      });
      assert.equal(await event.response,network);
      await event.lifetime;
      assert.equal(calls,1);
    });
  }
}

test("service worker v10 serves static cache hits without an eager network request", async () => {
  const cached = { source: "cache" };
  let fetchCount = 0;
  const harness = createWorkerHarness({
    match: async () => cached,
    fetch: async () => { fetchCount += 1; return { ok: true }; },
  });
  const event = dispatchFetch(harness, {
    url: "https://marketo.test/assets/app.js",
    method: "GET",
    mode: "same-origin",
    destination: "script",
  });
  const response = await event.response;
  await event.lifetime;
  assert.equal(response, cached);
  assert.equal(fetchCount, 0);
  assert.equal(harness.puts.length, 0);
});

test("service worker v10 stores an eligible cache miss before resolving the response", async () => {
  const storedCopy = { source: "clone" };
  const network = { ok: true, clone: () => storedCopy };
  const harness = createWorkerHarness({ fetch: async () => network });
  const request = {
    url: "https://marketo.test/assets/app.js",
    method: "GET",
    mode: "same-origin",
    destination: "script",
  };
  const event = dispatchFetch(harness, request);
  assert.equal(await event.response, network);
  await event.lifetime;
  assert.ok(harness.opened.some((entry) => entry.name === "jevu-static-v1"));
  assert.deepEqual(harness.puts, [{ request, response: storedCopy }]);
});

test("service worker serves versioned public reference cache hits without network work", async () => {
  for (const path of ["/api/reference/categories?v=release-1", "/api/reference/geography?v=release-1"]) {
    const cached = { source: "public-reference-cache" };
    let fetchCount = 0;
    const harness = createWorkerHarness({
      match: async () => cached,
      fetch: async () => { fetchCount += 1; return { ok: true }; },
    });
    const request = {
      url: `https://marketo.test${path}`,
      method: "GET",
      mode: "same-origin",
      destination: "",
    };

    const event = dispatchFetch(harness, request);
    assert.equal(await event.response, cached);
    await event.lifetime;
    assert.equal(fetchCount, 0);
    assert.equal(harness.puts.length, 0);
  }
});

test("service worker stores only matching JSON versions from public reference endpoints", async () => {
  for (const path of ["/api/reference/categories?v=release-1", "/api/reference/geography?v=release-1"]) {
    const storedCopy = { source: "public-reference-clone" };
    const network = {
      ok: true,
      headers: headers({
        "content-type": "application/json; charset=utf-8",
        "x-marketo-reference-version": "release-1",
      }),
      clone: () => storedCopy,
    };
    const harness = createWorkerHarness({ fetch: async () => network });
    const request = {
      url: `https://marketo.test${path}`,
      method: "GET",
      mode: "same-origin",
      destination: "",
    };

    const event = dispatchFetch(harness, request);
    assert.equal(await event.response, network);
    await event.lifetime;
    assert.deepEqual(harness.puts, [{ request, response: storedCopy }]);
  }

  const mismatched = {
    ok: true,
    headers: headers({
      "content-type": "application/json",
      "x-marketo-reference-version": "release-older",
    }),
    clone: () => ({ source: "must-not-be-stored" }),
  };
  const harness = createWorkerHarness({ fetch: async () => mismatched });
  const event = dispatchFetch(harness, {
    url: "https://marketo.test/api/reference/categories?v=release-current",
    method: "GET",
    mode: "same-origin",
    destination: "",
  });
  assert.equal(await event.response, mismatched);
  await event.lifetime;
  assert.equal(harness.puts.length, 0);
});

test("service worker bypasses private, mutable and unversioned API routes and never caches navigation HTML", async () => {
  let fetchCount = 0;
  const navigation = { ok: true };
  const harness = createWorkerHarness({ fetch: async () => { fetchCount += 1; return navigation; } });
  for (const url of [
    "https://marketo.test/api",
    "https://marketo.test/api/listings",
    "https://marketo.test/api/auth/session",
    "https://marketo.test/api/reference/categories",
    "https://marketo.test/api/reference/geography?v=",
    "https://marketo.test/api/reference/categories/category-id/attributes?v=release-1",
    "https://marketo.test/api/reference/categories?v=release-1&extra=true",
  ]) {
    const apiEvent = dispatchFetch(harness, { url, method: "GET", mode: "same-origin", destination: "" });
    assert.equal(await apiEvent.response, undefined);
    await apiEvent.lifetime;
  }
  assert.equal(fetchCount, 0);

  const navigationEvent = dispatchFetch(harness, {
    url: "https://marketo.test/profile",
    method: "GET",
    mode: "navigate",
    destination: "document",
  });
  const response = await navigationEvent.response;
  assert.equal(response, navigation);
  assert.equal(fetchCount, 1);
  assert.equal(harness.puts.length, 0);
});

test("service worker keeps offline navigation fallback and lifecycle work attached to events", async () => {
  const offline = { source: "offline" };
  const harness = createWorkerHarness({
    match: async (request) => request === "/offline.html" ? offline : null,
    fetch: async () => { throw new Error("offline"); },
  });
  const navigationEvent = dispatchFetch(harness, {
    url: "https://marketo.test/publish",
    method: "GET",
    mode: "navigate",
    destination: "document",
  });
  assert.equal(await navigationEvent.response, offline);

  let installWork;
  harness.handlers.get("install")({ waitUntil(value) { installWork = value; } });
  await installWork;
  assert.ok(harness.opened.some((entry) => entry.name === "jevu-static-v1"));
  assert.ok(harness.opened.some((entry) => JSON.stringify(entry.addAll) === JSON.stringify(["/offline.html"])));

  let activateWork;
  harness.handlers.get("activate")({ waitUntil(value) { activateWork = value; } });
  await activateWork;
  assert.deepEqual(harness.deleted, ["marketo-static-v5", "marketo-static-v6", "marketo-static-v7", "marketo-static-v8", "marketo-static-v9", "marketo-static-v10", "jevu-static-v0"]);
  assert.equal(harness.claimed(), true);
});

test("service worker cache-write failure never breaks a successful network response", async () => {
  const network = { ok: true, clone: () => ({ source: "clone" }) };
  const harness = createWorkerHarness({
    fetch: async () => network,
    put: async () => { throw new Error("quota exceeded"); },
  });
  const event = dispatchFetch(harness, {
    url: "https://marketo.test/assets/app.js",
    method: "GET",
    mode: "same-origin",
    destination: "script",
  });
  assert.equal(await event.response, network);
  await assert.doesNotReject(event.lifetime);
  assert.equal(harness.puts.length, 1);
});

test("service worker cache-read failure falls back to the network", async () => {
  const network = { ok: true, clone: () => ({ source: "clone" }) };
  const harness = createWorkerHarness({
    match: async () => { throw new Error("cache unavailable"); },
    fetch: async () => network,
  });
  const event = dispatchFetch(harness, {
    url: "https://marketo.test/assets/app.js",
    method: "GET",
    mode: "same-origin",
    destination: "script",
  });
  assert.equal(await event.response, network);
  await event.lifetime;
});

test("service worker keeps cache lookup and write scoped to an asynchronous namespace open", async () => {
  let releaseOpen;
  const openGate = new Promise((resolve) => { releaseOpen = resolve; });
  let cloneCount = 0;
  const network = {
    ok: true,
    clone() { cloneCount += 1; return { source: "clone" }; },
  };
  const harness = createWorkerHarness({
    fetch: async () => network,
    open: async (_name, cache) => { await openGate; return cache; },
  });
  const event = dispatchFetch(harness, {
    url: "https://marketo.test/assets/app.js",
    method: "GET",
    mode: "same-origin",
    destination: "script",
  });
  releaseOpen();
  assert.equal(await event.response, network);
  assert.equal(cloneCount, 1);
  await event.lifetime;
  assert.equal(harness.puts.length, 1);
});

for (const path of ['/auth/callback?flow=recovery&code=fixture', '/auth/update-password', '/auth/result', '/auth/registration-confirmed', '/login?mode=recover', '/login/?password_reset=success']) {
  test(`auth navigation stays native without respondWith: ${path.split('?')[0]}`, async () => {
    const harness = createWorkerHarness({ fetch: async () => { throw new Error('SW must not fetch auth navigation'); } });
    const event = dispatchFetch(harness, { url:'https://marketo.test'+path, method:'GET', mode:'navigate', destination:'document', redirect:'manual' });
    assert.equal(event.response,undefined);
    await event.lifetime;
    assert.deepEqual(harness.opened,[]);
  });
}

test('protected-page redirects pass through unchanged without consuming or wrapping the response', async () => {
  const redirect = { type:'opaqueredirect', status:0, get body(){throw new Error('must not inspect redirect body');} };
  const harness = createWorkerHarness({ fetch:async(_request,init)=>{assert.equal(init.redirect,'manual');return redirect;} });
  const event=dispatchFetch(harness,{url:'https://marketo.test/profile',method:'GET',mode:'navigate',destination:'document'});
  assert.equal(await event.response,redirect);
  assert.deepEqual(harness.puts,[]);
});
