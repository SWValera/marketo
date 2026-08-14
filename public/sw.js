const CACHE_NAME = "marketo-static-v4";
const APP_SHELL = ["/offline", "/manifest.webmanifest", "/favicon.svg"];

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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("/offline")),
    );
    return;
  }

  if (["image", "font", "script", "style"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok && (url.pathname.includes("/assets/") || ["image", "font"].includes(request.destination))) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        });
        return cached || network;
      }),
    );
  }
});
