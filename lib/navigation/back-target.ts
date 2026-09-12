/** Return only an internal URL; never retain auth credentials as a return path. */
export function internalReturnPath(value: unknown, currentHref: string): string | null {
  if (typeof value !== "string" || !value || /[\\\u0000-\u0020\u007f]/.test(value) || value.startsWith("//")) return null;
  if (!value.startsWith("/") && !/^https?:\/\//.test(value)) return null;
  try {
    const current = new URL(currentHref), target = new URL(value, current.origin);
    if (target.origin !== current.origin || target.username || target.password) return null;
    if ([...target.searchParams.keys()].some(key => /^(code|token|token_hash|access_token|refresh_token)$/i.test(key))
      || /(?:^#|&)(access_token|refresh_token|token_hash)=/i.test(target.hash)) return null;
    return target.pathname + target.search + target.hash;
  } catch { return null; }
}

type BackContext = {
  currentHref: string;
  historyLength: number;
  /** undefined: Navigation API unavailable; null: no preceding same-origin entry. */
  previousEntry?: string | null;
  routerPrevious?: unknown;
  storedCurrent?: string | null;
  storedPrevious?: string | null;
  referrer?: string;
  fallback: string;
};

export function resolveBackTarget(context: BackContext): { kind: "back" } | { kind: "replace"; href: string } {
  const current = internalReturnPath(context.currentHref, context.currentHref);
  const different = (value: unknown) => {
    const path = internalReturnPath(value, context.currentHref);
    return path && path !== current ? path : null;
  };
  const previousEntry = different(context.previousEntry);
  const source = (context.storedCurrent === current ? different(context.storedPrevious) : null)
    ?? different(context.routerPrevious)
    ?? different(context.referrer);
  // Length alone includes blank/external entries and cannot prove an internal back step.
  if (context.historyLength > 1 && (previousEntry || (context.previousEntry === undefined && source))) return { kind: "back" };
  return { kind: "replace", href: previousEntry ?? source ?? internalReturnPath(context.fallback, context.currentHref) ?? "/" };
}

export function browserPreviousEntry(): string | null | undefined {
  const navigation = (window as Window & { navigation?: {
    currentEntry?: { index: number } | null;
    entries: () => Array<{ index: number; url: string | null }>;
  } }).navigation;
  if (!navigation?.currentEntry || navigation.currentEntry.index < 0) return undefined;
  return navigation.entries().find(entry => entry.index === navigation.currentEntry!.index - 1)?.url ?? null;
}
