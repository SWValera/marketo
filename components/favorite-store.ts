"use client";

import { addFavorite, listFavoriteListingIds, removeFavorite } from "@/lib/data/supabase/favorites";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

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
const listeners = new Set<() => void>();

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
