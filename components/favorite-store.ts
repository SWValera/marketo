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

function loadFavoriteDependencies() {
  dependenciesPromise ??= Promise.all([
    import("@/lib/data/supabase/favorites"),
    import("@/lib/supabase/browser"),
  ]).then(([favorites, browser]) => ({
    addFavorite: favorites.addFavorite,
    getSupabaseBrowserClient: browser.getSupabaseBrowserClient,
    listFavoriteListingIds: favorites.listFavoriteListingIds,
    removeFavorite: favorites.removeFavorite,
  })).catch((error) => {
    dependenciesPromise = null;
    throw error;
  });
  return dependenciesPromise;
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
  loadPromise = (async () => {
    try {
      const { getSupabaseBrowserClient, listFavoriteListingIds } = await loadFavoriteDependencies();
      const client = getSupabaseBrowserClient();
      const userResult = await client.auth.getUser();
      if (userResult.error) throw userResult.error;
      if (!userResult.data.user) {
        const anonymous: FavoriteStoreSnapshot = { ...initialSnapshot, ready: true };
        publish(anonymous);
        return anonymous;
      }
      const rows = await listFavoriteListingIds(client, userResult.data.user.id);
      const loaded: FavoriteStoreSnapshot = {
        authenticated: true,
        error: false,
        ids: new Set(rows.map((row) => row.listing_id)),
        ready: true,
      };
      publish(loaded);
      return loaded;
    } catch {
      const failed: FavoriteStoreSnapshot = {
        authenticated: false,
        error: true,
        ids: new Set<string>(),
        ready: true,
      };
      publish(failed);
      return failed;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

export async function toggleFavoriteListing(listingId: string) {
  const current = await loadFavoriteStore();
  if (!current.authenticated) return current.error ? "error" as const : "authentication_required" as const;
  const { addFavorite, getSupabaseBrowserClient, removeFavorite } = await loadFavoriteDependencies();
  const client = getSupabaseBrowserClient();
  const userResult = await client.auth.getUser();
  if (userResult.error) return "error" as const;
  if (!userResult.data.user) return "authentication_required" as const;
  const nextIds = new Set(current.ids);
  try {
    if (nextIds.has(listingId)) {
      await removeFavorite(client, userResult.data.user.id, listingId);
      nextIds.delete(listingId);
      publish({ authenticated: true, error: false, ids: nextIds, ready: true });
      return "removed" as const;
    }
    await addFavorite(client, userResult.data.user.id, listingId);
    nextIds.add(listingId);
    publish({ authenticated: true, error: false, ids: nextIds, ready: true });
    return "added" as const;
  } catch {
    return "error" as const;
  }
}
