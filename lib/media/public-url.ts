function mediaPath(storageKey: string | null) {
  if (!storageKey || /^(?:https?:|data:|javascript:)/i.test(storageKey)) return null;
  return storageKey.split("/").map(encodeURIComponent).join("/");
}

/** Only use after the listing has been proven active and public. */
export function publicMediaUrl(storageKey: string | null) {
  const path = mediaPath(storageKey);
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}/${path}` : `/api/media/${path}`;
}

/** Draft, pending, rejected and owner/staff media must always pass session RLS. */
export function protectedMediaUrl(storageKey: string | null) {
  const path = mediaPath(storageKey);
  return path ? `/api/media/${path}` : null;
}
