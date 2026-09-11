// Brand canonical target; deployment/DNS ownership is configured separately.
// Unknown request hosts must not be reflected into metadata URLs.
export const SITE_ORIGIN = 'https://jevu.kz';
export const DIRECT_SITE_ORIGIN = 'https://marketo-staging.arshavin-ivan-mail-ru.workers.dev';

export function metadataOrigin(_host?: string | null) {
  return new URL(SITE_ORIGIN);
}

export function installationOrigin(host: string | null) {
  // Installation assets must belong to the same verified host as the app.
  if (host === new URL(DIRECT_SITE_ORIGIN).host) return new URL(DIRECT_SITE_ORIGIN);
  if (host && /^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(host)) {
    try { return new URL(`http://${host}`); } catch { /* Invalid local port. */ }
  }
  return new URL(SITE_ORIGIN);
}

/** Host-exact redirect, preserving path/query and never trusting forwarded hosts. */
export function canonicalRedirect(input: string) {
  const url = new URL(input);
  if (url.hostname !== 'www.jevu.kz' && !(url.hostname === 'jevu.kz' && url.protocol === 'http:')) return null;
  url.protocol = 'https:'; url.hostname = 'jevu.kz'; url.port = '';
  return url;
}
