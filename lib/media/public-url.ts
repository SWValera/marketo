import { encodeMediaStoragePath } from "./storage-key.ts";

/** Only use after the listing has been proven active and public. */
export function publicMediaUrl(storageKey: string | null) {
  const path = encodeMediaStoragePath(storageKey);
  if (!path) return null;
  // Public listing status is mutable. Keeping delivery behind the application
  // route lets an archive/moderation decision revoke access immediately.
  return `/api/media/${path}`;
}

/** Draft, pending, rejected and owner/staff media must always pass session RLS. */
export function protectedMediaUrl(storageKey: string | null) {
  const path = encodeMediaStoragePath(storageKey);
  return path ? `/api/media/${path}` : null;
}
