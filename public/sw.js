// Retirement endpoint for the former /sw.js registration (root scope).
// No fetch handler, app shell, offline fallback, push or background sync.
const LEGACY_PWA_CACHES = ["marketo-shell-v2", ...Array.from({ length: 8 }, (_, i) => `marketo-static-v${i + 3}`), "jevu-static-v1"];
function optional(work) {
  let timer;
  return Promise.race([Promise.resolve().then(work), new Promise(resolve => { timer = setTimeout(resolve, 1500); })])
    .catch(() => undefined).finally(() => clearTimeout(timer));
}
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // Existing open documents immediately get a controller with no interception.
    await optional(() => self.clients.claim());
    const names = await optional(() => caches.keys());
    await Promise.all((names || []).filter(name => LEGACY_PWA_CACHES.includes(name)).map(name => optional(() => caches.delete(name))));
    await optional(() => self.registration.unregister());
  })());
});
