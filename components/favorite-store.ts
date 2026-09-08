"use client";

export type FavoriteStoreSnapshot = {
  authenticated: boolean;
  error: boolean;
  ids: ReadonlySet<string>;
  ready: boolean;
};

const initialSnapshot: FavoriteStoreSnapshot = {
  authenticated: false,
  error: false,
  ids: new Set<string>(),
  ready: false,
};

let snapshot = initialSnapshot;
let loadPromise: Promise<FavoriteStoreSnapshot> | null = null;
let dependenciesPromise: Promise<{
  addFavorite: typeof import("@/lib/data/supabase/favorites").addFavorite;
  getSupabaseBrowserClient: typeof import("@/lib/supabase/browser").getSupabaseBrowserClient;
  listFavoriteListingIds: typeof import("@/lib/data/supabase/favorites").listFavoriteListingIds;
  removeFavorite: typeof import("@/lib/data/supabase/favorites").removeFavorite;
}> | null = null;
const listeners = new Set<() => void>();
let snapshotUserId: string | null = null;
let generation = 0;
let activeRead: AbortController | null = null;
let authSubscribed = false;

function invalidateFavoriteStore() {
  generation++;
  activeRead?.abort(new DOMException("Account changed", "AbortError"));
  activeRead = null;
  loadPromise = null;
  snapshotUserId = null;
  publish(initialSnapshot);
}

function watchFavoriteAccount(client: ReturnType<typeof import("@/lib/supabase/browser").getSupabaseBrowserClient>) {
  if (authSubscribed) return;
  authSubscribed = true;
  // Notification identity only invalidates. Reads still require getUser().
  client.auth.onAuthStateChange((event, session) => {
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
    if (event === "SIGNED_IN" && session?.user.id === snapshotUserId) return;
    invalidateFavoriteStore();
    // Never await a Supabase call inside its Auth callback/lock.
    queueMicrotask(() => { if (listeners.size) void loadFavoriteStore(); });
  });
}

function loadFavoriteDependencies() {
  if (dependenciesPromise) return dependenciesPromise;
  const request = Promise.all([
    import("@/lib/data/supabase/favorites"),
    import("@/lib/supabase/browser"),
  ]).then(([favorites, browser]) => ({
    addFavorite: favorites.addFavorite,
    getSupabaseBrowserClient: browser.getSupabaseBrowserClient,
    listFavoriteListingIds: favorites.listFavoriteListingIds,
    removeFavorite: favorites.removeFavorite,
  })).catch((error) => {
    if (dependenciesPromise === request) dependenciesPromise = null;
    throw error;
  });
  dependenciesPromise = request;
  return request;
}

function publish(next: FavoriteStoreSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function readFavoriteStore() {
  return snapshot;
}

export function readServerFavoriteStore() {
  return initialSnapshot;
}

export function subscribeFavoriteStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadFavoriteStore() {
  if (snapshot.ready && !snapshot.error) return Promise.resolve(snapshot);
  if (loadPromise) return loadPromise;
  const epoch = generation;
  const controller = new AbortController();
  activeRead = controller;
  const deadline = Date.now() + 9000;
  const expire = () => controller.abort(new DOMException("Favorite read deadline", "TimeoutError"));
  const timer = setTimeout(expire, 9000);
  const resume = () => { if (Date.now() >= deadline) expire(); };
  window.addEventListener("pageshow", resume);
  window.addEventListener("online", resume);
  document.addEventListener("visibilitychange", resume);
  const stopped = new Promise<never>((_resolve, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true }));
  const work = (async () => {
      const { getSupabaseBrowserClient, listFavoriteListingIds } = await loadFavoriteDependencies();
      controller.signal.throwIfAborted();
      const client = getSupabaseBrowserClient();
      watchFavoriteAccount(client);
      const userResult = await client.auth.getUser();
      // getUser has no per-call AbortSignal; late Auth results cannot commit.
      controller.signal.throwIfAborted();
      if (userResult.error && userResult.error.name !== "AuthSessionMissingError") throw userResult.error;
      if (!userResult.data.user) {
        snapshotUserId = null;
        return { ...initialSnapshot, ready: true };
      }
      snapshotUserId = userResult.data.user.id;
      const rows = await listFavoriteListingIds(client, userResult.data.user.id, controller.signal);
      controller.signal.throwIfAborted();
      const loaded: FavoriteStoreSnapshot = {
        authenticated: true,
        error: false,
        ids: new Set(rows.map((row) => row.listing_id)),
        ready: true,
      };
      return loaded;
  })();
  const request = Promise.race([work, stopped]).then(loaded => {
      if (epoch !== generation || controller.signal.aborted) return snapshot;
      publish(loaded);
      return loaded;
    }).catch(() => {
      if (epoch !== generation) return snapshot;
      if (controller.signal.aborted) dependenciesPromise = null;
      const failed: FavoriteStoreSnapshot = {
        authenticated: false,
        error: true,
        ids: new Set<string>(),
        ready: true,
      };
      publish(failed);
      return failed;
    }).finally(() => {
      clearTimeout(timer);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      if (activeRead === controller) activeRead = null;
      if (loadPromise === request) loadPromise = null;
    });
  loadPromise = request;
  return request;
}

export async function toggleFavoriteListing(listingId: string) {
  const current = await loadFavoriteStore();
  if (!current.authenticated) return current.error ? "error" as const : "authentication_required" as const;
  const epoch = generation;
  const { addFavorite, getSupabaseBrowserClient, removeFavorite } = await loadFavoriteDependencies();
  const client = getSupabaseBrowserClient();
  const userResult = await client.auth.getUser();
  if (userResult.error) return "error" as const;
  if (!userResult.data.user) return "authentication_required" as const;
  if (epoch !== generation || userResult.data.user.id !== snapshotUserId) {
    invalidateFavoriteStore();
    return "error" as const;
  }
  const nextIds = new Set(current.ids);
  try {
    if (nextIds.has(listingId)) {
      await removeFavorite(client, userResult.data.user.id, listingId);
      if (epoch !== generation) return "error" as const;
      nextIds.delete(listingId);
      publish({ authenticated: true, error: false, ids: nextIds, ready: true });
      return "removed" as const;
    }
    await addFavorite(client, userResult.data.user.id, listingId);
    if (epoch !== generation) return "error" as const;
    nextIds.add(listingId);
    publish({ authenticated: true, error: false, ids: nextIds, ready: true });
    return "added" as const;
  } catch {
    return "error" as const;
  }
}
