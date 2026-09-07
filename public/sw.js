const CACHE_NAME = "marketo-static-v10";
const CACHE_PREFIX = "marketo-static-";
// HTML and authenticated pages are deliberately never cached. Only the
// self-contained offline document, immutable/static assets and explicitly
// versioned public reference payloads are stored.
// The fallback is deliberately language-neutral and has no external assets,
// so it cannot retain a stale locale or render a broken offline shell.
const OFFLINE_URL = "/offline.html";
const APP_SHELL = [OFFLINE_URL];
// CacheStorage is optional: a blocked/quota-limited store must not block JS.
function optionalCache(work, milliseconds = 120) {
  let timer;
  return Promise.race([
    Promise.resolve().then(work),
    new Promise((resolve) => { timer = setTimeout(resolve, milliseconds); }),
  ]).catch(() => undefined).finally(() => clearTimeout(timer));
}
const openCache = () => optionalCache(() => caches.open(CACHE_NAME));
function network(request) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (request.signal?.aborted) onAbort();
  else request.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(onAbort, 15000);
  // Bound connection/header waiting only. Never truncate a streamed document
  // after its headers; the server bounds its own data requests independently.
  return fetch(request, { signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onAbort);
  });
}
const PUBLIC_REFERENCE_PATHS = new Set([
  "/api/reference/categories",
  "/api/reference/geography",
]);

function publicReferenceVersion(url) {
  if (!PUBLIC_REFERENCE_PATHS.has(url.pathname)) return null;
  const versions = url.searchParams.getAll("v");
  if (versions.length !== 1 || !versions[0]) return null;
  for (const key of url.searchParams.keys()) if (key !== "v") return null;
  return versions[0];
}

self.addEventListener("install", (event) => {
  event.waitUntil(optionalCache(async () => {
    const cache = await openCache();
    if (cache) await cache.addAll(APP_SHELL);
  }, 5000));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting().then(() => event.ports?.[0]?.postMessage({ activated: true })));
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    optionalCache(() => caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const referenceVersion = publicReferenceVersion(url);
  if (referenceVersion) {
    const result = (async () => {
      const cache = await openCache();
      const cached = cache && await optionalCache(() => cache.match(request));
      if (cached) return { response: cached, cacheWrite: Promise.resolve() };

      const response = await network(request);
      let cacheWrite = Promise.resolve();
      const responseVersion = response.headers?.get("x-marketo-reference-version");
      const contentType = response.headers?.get("content-type") ?? "";
      if (cache && response.ok && responseVersion === referenceVersion && contentType.includes("application/json")) {
        try {
          cacheWrite = optionalCache(() => cache.put(request, response.clone()));
        } catch {
          // A cache copy is optional; the successful public response remains authoritative.
        }
      }
      return { response, cacheWrite };
    })();
    event.respondWith(result.then(({ response }) => response));
    event.waitUntil(result.then(({ cacheWrite }) => cacheWrite).catch(() => undefined));
    return;
  }

  // Every other API route may be authenticated, personalized or mutable.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(network(request).catch(async () => {
      const cache = await openCache();
      return (cache && await optionalCache(() => cache.match(OFFLINE_URL))) || Response.error();
    }));
    return;
  }

  if (["image", "font", "script", "style"].includes(request.destination)) {
    const result = (async () => {
      const cache = await openCache();
      const cached = cache && await optionalCache(() => cache.match(request));
      if (cached) return { response: cached, cacheWrite: Promise.resolve() };

      const response = await network(request);
      let cacheWrite = Promise.resolve();
      if (cache && response.ok && (url.pathname.includes("/assets/") || ["image", "font"].includes(request.destination))) {
        try {
          const copy = response.clone();
          cacheWrite = optionalCache(() => cache.put(request, copy));
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
