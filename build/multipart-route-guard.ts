import type { Plugin } from 'vite';

// vinext 0.0.50 tries to decode every multipart POST as a progressive Server
// Action BEFORE dispatching API routes. Its 1 MiB action limit therefore rejects
// valid photo uploads before our authenticated, bounded upload handler runs.
// Skip only the matched listing-photo route, which performs its own CSRF/auth
// checks and bounded multipart parsing. Leave every other endpoint/page alone.
// This app has no afterFiles/fallback rewrites to change that matched route.
export function transformMultipartRoute(source: string, id: string) {
  if (!id.endsWith('/vinext/dist/server/app-rsc-handler.js')) return null;
  const before = 'const progressiveActionResult = await options.handleProgressiveActionRequest({';
  if (source.split(before).length !== 2) {
    throw new Error('vinext multipart dispatch contract changed; review upload routing before building');
  }
  return source.replace(before,
    'const progressiveActionResult = /^\\/api\\/listings\\/[^/]+\\/images$/.test(cleanPathname) && options.matchRoute(cleanPathname)?.route.routeHandler ? null : await options.handleProgressiveActionRequest({');
}

export function multipartRouteGuard(): Plugin {
  return {name: 'jevu-multipart-route-guard', enforce: 'pre', transform(source, id) {
    return transformMultipartRoute(source, id.replaceAll('\\', '/').split('?')[0]);
  }};
}
