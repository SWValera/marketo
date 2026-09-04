const CACHE_NAME = "marketo-static-v7";
const CACHE_PREFIX = "marketo-static-";
// HTML and authenticated pages are deliberately never cached. Only the
// self-contained offline document and immutable/static assets are stored.
// The fallback is deliberately language-neutral and has no external assets,
// so it cannot retain a stale locale or render a broken offline shell.
const OFFLINE_URL = "/offline.html";
const APP_SHELL = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting().then(() => event.ports?.[0]?.postMessage({ activated: true })));
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET"
    || url.origin !== self.location.origin
    || url.pathname === "/api"
    || url.pathname.startsWith("/api/")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }));
    return;
  }

  if (["image", "font", "script", "style"].includes(request.destination)) {
    const result = (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request).catch(() => undefined);
      if (cached) return { response: cached, cacheWrite: Promise.resolve() };

      const response = await fetch(request);
      let cacheWrite = Promise.resolve();
      if (response.ok && (url.pathname.includes("/assets/") || ["image", "font"].includes(request.destination))) {
        try {
          const copy = response.clone();
          cacheWrite = cache.put(request, copy).catch(() => undefined);
        } catch {
          // A cache copy is optional; the successful network response remains authoritative.
        }
      }
      return { response, cacheWrite };
    })();
    event.respondWith(result.then(({ response }) => response));
    event.waitUntil(result.then(({ cacheWrite }) => cacheWrite).catch(() => undefined));
  }
});
