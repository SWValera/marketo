import type { Plugin } from "vite";

function replaceOnce(source: string, from: string, to: string) {
  if (source.split(from).length !== 2) throw new Error("vinext navigation contract changed: " + from.slice(0, 90));
  return source.replace(from, to);
}

// Reproducible, fail-closed adapter for the installed vinext 0.0.50 implementation.
// Never edit node_modules or dist. Test this transformation against the real file.
export function transformNavigationRead(source: string, id: string) {
  if (id.endsWith("/vinext/dist/shims/navigation.js")) {
    source = 'import { isReusablePage, isPrivatePage } from "/lib/navigation/page-read.ts";\n' + source;
    source = replaceOnce(source, 'function prefetchRscResponse(rscUrl, fetchPromise, interceptionContext = null, mountedSlotsHeader = null) {', 'function prefetchRscResponse(rscUrl, fetchPromise, interceptionContext = null, mountedSlotsHeader = null) {\n if (isPrivatePage(rscUrl)) { fetchPromise.then(response => response.body?.cancel()).catch(() => {}); return; }');
    source = replaceOnce(source, 'buffer: await response.arrayBuffer(),', 'buffer: await response.arrayBuffer().then(buffer => { if (!isReusablePage(buffer)) throw new Error("Failed prefetch"); return buffer; }),');
    source = replaceOnce(source, 'priority: "low"', 'priority: "low", signal: AbortSignal.timeout(8000)');
    source = replaceOnce(source, 'const fullHref = toBrowserNavigationHref(prefetchHref, window.location.href, __basePath);', 'const fullHref = toBrowserNavigationHref(prefetchHref, window.location.href, __basePath);\n if (isPrivatePage(fullHref)) return;');
    source = replaceOnce(source, 'entry.pending = fetchPromise.then(async (response) => {', 'entry.pending = fetchPromise.then(async (response) => {\n if (cache.get(cacheKey) !== entry) { await response.body?.cancel(); return; }');
    source = replaceOnce(source, 'else {\n\t\t\tprefetched.delete(cacheKey);\n\t\t\tcache.delete(cacheKey);', 'else {\n if (cache.get(cacheKey) !== entry) return;\n\t\t\tprefetched.delete(cacheKey);\n\t\t\tcache.delete(cacheKey);');
    source = replaceOnce(source, '}).catch(() => {\n\t\tprefetched.delete(cacheKey);', '}).catch(() => {\n if (cache.get(cacheKey) !== entry) return;\n\t\tprefetched.delete(cacheKey);');
    source = replaceOnce(source, "function consumePrefetchResponse(", "async function consumePrefetchResponse(");
    source = replaceOnce(source, 'if (entry.pending || entry.outcome !== "cache-seeded") return null;', 'if (Date.now() - entry.timestamp >= 3e4) { cache.delete(cacheKey); getPrefetchedUrls().delete(cacheKey); return null; }\n if (entry.pending) await entry.pending;\n\tif (cache.get(cacheKey) !== entry || entry.outcome !== "cache-seeded") return null;');
    return source;
  }
  if (!id.endsWith("/vinext/dist/server/app-browser-entry.js")) return null;
  source = 'import { createPageNavigation, isReusablePage, isPrivatePage } from "/lib/navigation/page-read.ts";\n' + source;
  source = replaceOnce(source, 'function getVisitedResponse(rscUrl, interceptionContext, mountedSlotsHeader, navigationKind) {', 'function getVisitedResponse(rscUrl, interceptionContext, mountedSlotsHeader, navigationKind) {\n if (isPrivatePage(rscUrl)) return null;');
  source = replaceOnce(source, 'window.__VINEXT_RSC_NAVIGATE__ = async function navigateRsc(href, redirectDepth = 0, navigationKind = "navigate", historyUpdateMode, previousNextUrlOverride, programmaticTransition = false) {', 'window.__VINEXT_RSC_NAVIGATE__ = createPageNavigation(async function navigateRsc(href, redirectDepth = 0, navigationKind = "navigate", historyUpdateMode, previousNextUrlOverride, programmaticTransition = false, readOperation) {');
  source = replaceOnce(source, 'const navId = browserNavigationController.beginNavigation();', `const navId = browserNavigationController.beginNavigation();
    const cancelRead = () => {
      browserNavigationController.finalizeNavigation(navId, pendingRouterState);
      if (browserNavigationController.isCurrentNavigation(navId)) browserNavigationController.beginNavigation();
    };
    readOperation.signal.addEventListener("abort", cancelRead, { once: true });`);
  source = replaceOnce(source, 'const prefetchedResponse = consumePrefetchResponse(rscUrl, requestInterceptionContext, mountedSlotsHeader);', 'const prefetchedResponse = await readOperation.wait(consumePrefetchResponse(rscUrl, requestInterceptionContext, mountedSlotsHeader));');
  source = replaceOnce(source, 'else {\n\t\t\t\tawait waitForBrowserRouterStateReady();', 'else {\n\t\t\t\tawait readOperation.wait(waitForBrowserRouterStateReady());');
  source = replaceOnce(source, 'window.location.href = currentHref;\n\t\t\t\t\treturn;', 'throw new Error("Page redirect limit exceeded");');
  source = replaceOnce(source, 'if (!navResponse) navResponse = await fetch(rscUrl, {', 'if (!navResponse) navResponse = await fetch(rscUrl, { signal: readOperation.signal,');
  source = replaceOnce(source, 'if (!navResponse.ok || !isRscResponse || !navResponse.body) {', 'if ((!navResponse.ok && ![401, 403, 404].includes(navResponse.status)) || !isRscResponse || !navResponse.body) {');
  source = replaceOnce(source, 'const cacheBufferPromise = new Response(cacheBranch).arrayBuffer();', 'const cacheBufferPromise = new Response(cacheBranch).arrayBuffer();\n cacheBufferPromise.catch(() => {});');
  source = replaceOnce(source, 'storeVisitedResponseSnapshot(rscUrl, resolveVisitedResponseInterceptionContext(requestInterceptionContext, metadata.interceptionContext), {', 'if (!isPrivatePage(rscUrl) && isReusablePage(cacheBuffer)) storeVisitedResponseSnapshot(rscUrl, resolveVisitedResponseInterceptionContext(requestInterceptionContext, metadata.interceptionContext), {');
  source = replaceOnce(source, 'window.location.href = hardNavTarget;\n\t\t\t\t\treturn;', 'throw new Error("Page read failed: " + navResponse.status);');
  source = replaceOnce(source, 'if (!isPageUnloading) console.error("[vinext] RSC navigation error:", error);\n\t\t\twindow.location.href = currentHref;', 'throw error;');
  source = replaceOnce(source, 'browserNavigationController.finalizeNavigation(navId, pendingRouterState);\n\t\t}\n\t};', 'readOperation.signal.removeEventListener("abort", cancelRead);\n browserNavigationController.finalizeNavigation(navId, pendingRouterState);\n\t\t}\n\t});');
  return source;
}

export function navigationReadGuard(): Plugin {
  return { name: "marketo-navigation-read-guard", enforce: "pre", transform(source, id) {
    return transformNavigationRead(source, id.replaceAll("\\", "/").split("?")[0]);
  } };
}
