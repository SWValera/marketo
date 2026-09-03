export type RequestRoutingDecision = "continue" | "not-found" | "refresh-session";

const PROTECTED_APP_PATHS = [
  "/admin",
  "/favorites",
  "/messages",
  "/notifications",
  "/profile",
  "/publish",
  "/settings",
] as const;

const SESSION_API_PATHS = [
  "/api/admin",
] as const;

// These pages stay public, but their server-rendered UI reads the optional
// current account. Refresh only their document requests so cookie rotation can
// be persisted without adding Auth work to every public marketplace route.
const PUBLIC_SESSION_CONTEXT_PATHS = new Set(["/help"]);

const PUBLIC_ASSET_PREFIXES = ["/_next", "/assets", "/icons"] as const;

const PUBLIC_ROOT_ASSETS = new Set([
  "/favicon.svg",
  "/file.svg",
  "/globe.svg",
  "/manifest.webmanifest",
  "/marketo-app-icon.svg",
  "/marketo-favicon-v2.svg",
  "/marketo-maskable.svg",
  "/robots.txt",
  "/sitemap.xml",
  "/sw.js",
  "/window.svg",
]);

const ASSET_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "css",
  "eot",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "js",
  "json",
  "map",
  "mjs",
  "mp3",
  "mp4",
  "ogg",
  "otf",
  "pdf",
  "png",
  "svg",
  "ttf",
  "txt",
  "webm",
  "webmanifest",
  "webp",
  "woff",
  "woff2",
  "xml",
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DOCUMENT_READ_METHODS = new Set(["GET", "HEAD"]);
const ROUTE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canonicalizeRouteUuid(value: string) {
  return ROUTE_UUID.test(value) ? value.toLowerCase() : null;
}

function cleanPathname(pathname: string) {
  const separatorIndex = pathname.search(/[?#]/);
  const withoutQuery = separatorIndex === -1 ? pathname : pathname.slice(0, separatorIndex);
  const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
}

function matchesPath(pathname: string, basePath: string) {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export function normalizeRscPathname(pathname: string) {
  const clean = cleanPathname(pathname);
  if (clean === "/.rsc") return "/";
  return clean.endsWith(".rsc") ? clean.slice(0, -4) || "/" : clean;
}

export function isKnownPublicAssetPath(pathname: string) {
  const clean = cleanPathname(pathname);
  return PUBLIC_ROOT_ASSETS.has(clean)
    || /^\/sitemap-\d+\.xml$/.test(clean)
    || PUBLIC_ASSET_PREFIXES.some((prefix) => matchesPath(clean, prefix));
}

export function needsSupabaseSessionRefresh(pathname: string, method: string) {
  const clean = normalizeRscPathname(pathname);
  const normalizedMethod = method.toUpperCase();

  if (!SAFE_METHODS.has(normalizedMethod)) return true;
  if (DOCUMENT_READ_METHODS.has(normalizedMethod) && PUBLIC_SESSION_CONTEXT_PATHS.has(clean)) return true;
  if (matchesPath(clean, "/auth") || matchesPath(clean, "/login")) return true;
  if (PROTECTED_APP_PATHS.some((prefix) => matchesPath(clean, prefix))) return true;
  if (SESSION_API_PATHS.some((prefix) => matchesPath(clean, prefix))) return true;

  // GET /api/listings is the public catalog feed. Nested listing endpoints
  // expose owner drafts and therefore require a refreshed authenticated session.
  return clean.startsWith("/api/listings/");
}

export function isUnknownAssetLikePath(pathname: string) {
  const clean = cleanPathname(pathname);
  if (clean === "/.rsc" || clean.endsWith(".rsc")) return false;
  if (isKnownPublicAssetPath(clean)) return false;
  if (matchesPath(clean, "/api/media")) return false;
  if (matchesPath(clean, "/.well-known")) return true;

  const finalSegment = clean.slice(clean.lastIndexOf("/") + 1);
  const extensionIndex = finalSegment.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === finalSegment.length - 1) return false;
  return ASSET_EXTENSIONS.has(finalSegment.slice(extensionIndex + 1).toLowerCase());
}

export function classifyRequestRouting(pathname: string, method: string): RequestRoutingDecision {
  if (isKnownPublicAssetPath(pathname)) return "continue";
  if (needsSupabaseSessionRefresh(pathname, method)) return "refresh-session";
  if (isUnknownAssetLikePath(pathname)) return "not-found";
  return "continue";
}
