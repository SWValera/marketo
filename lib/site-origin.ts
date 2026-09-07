// Verified current publication. Unknown request hosts must not be reflected
// into canonical, image or icon URLs; custom domains require an explicit update.
export const SITE_ORIGIN = 'https://marketo-kz.sw-valera.chatgpt.site';
export const DIRECT_SITE_ORIGIN = 'https://marketo-staging.arshavin-ivan-mail-ru.workers.dev';

export function metadataOrigin(host: string | null) {
  // Installation assets must belong to the same verified host as the app.
  if (host === new URL(DIRECT_SITE_ORIGIN).host) return new URL(DIRECT_SITE_ORIGIN);
  if (host && /^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(host)) {
    try { return new URL(`http://${host}`); } catch { /* Invalid local port. */ }
  }
  return new URL(SITE_ORIGIN);
}
