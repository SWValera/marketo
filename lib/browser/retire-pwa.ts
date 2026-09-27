// Exact cache names recovered from the published /sw.js history, not all storage.
export const LEGACY_PWA_CACHES = ["marketo-shell-v2", ...Array.from({ length: 8 }, (_, i) => `marketo-static-v${i + 3}`), "jevu-static-v1"];
export const LEGACY_PWA_SCRIPT = "/sw.js";

async function optional<T>(work: () => Promise<T>, milliseconds = 3000): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | number | undefined;
  try { return await Promise.race([Promise.resolve().then(work), new Promise<undefined>(resolve => { timer = setTimeout(resolve, milliseconds); })]); }
  catch { return undefined; }
  finally { clearTimeout(timer); }
}

export function isLegacyPwaRegistration(registration: ServiceWorkerRegistration, origin: string) {
  try {
    if (registration.scope !== new URL("/", origin).href) return false;
    const workers = [registration.active, registration.waiting, registration.installing].filter((worker): worker is ServiceWorker => Boolean(worker));
    return workers.length > 0 && workers.every(worker => {
      const url = new URL(worker.scriptURL);
      return url.origin === origin && url.pathname === LEGACY_PWA_SCRIPT;
    });
  } catch { return false; }
}

async function finishInstalling(registration: ServiceWorkerRegistration) {
  const worker = registration.installing ?? registration.waiting;
  if (!worker || worker.state === "activated" || worker.state === "redundant") return;
  await new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); worker.removeEventListener("statechange", changed); resolve(); };
    const changed = () => { if (worker.state === "activated" || worker.state === "redundant") done(); };
    const timer = setTimeout(done, 3000);
    worker.addEventListener("statechange", changed);
    changed();
  });
}

let retiring: Promise<void> | undefined;
export function retireLegacyPwa(serviceWorkers?: ServiceWorkerContainer, storage?: CacheStorage, origin?: string): Promise<void> {
  if (retiring) return retiring;
  retiring = (async () => {
    const cleanupCaches = async () => {
      if (!storage) return;
      const names = await optional(() => storage.keys());
      await Promise.all((names ?? []).filter(name => LEGACY_PWA_CACHES.includes(name)).map(name => optional(() => storage.delete(name))));
    };
    const cleanupWorkers = async () => {
      if (!serviceWorkers || !origin) return;
      const registrations = await optional(() => serviceWorkers.getRegistrations());
      await Promise.all((registrations ?? []).filter(registration => isLegacyPwaRegistration(registration, origin)).map(async registration => {
        // The existing registration fetches the replacement script. Its install
        // and activate handlers take over open tabs without discarding forms.
        await optional(() => registration.update(), 5000);
        await finishInstalling(registration);
        await optional(() => registration.unregister());
      }));
    };
    await Promise.all([cleanupWorkers(), cleanupCaches()]);
  })().catch(() => undefined).finally(() => { retiring = undefined; });
  return retiring;
}
