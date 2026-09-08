export const PAGE_NAVIGATION_MS = 10_000;
export const PAGE_READ_EVENT = "marketo:page-read";
export function isPrivatePage(href: string) {
  const path = new URL(href, "https://marketo.invalid").pathname.replace(/\.rsc$/, "");
  return /^\/(?:profile|favorites|messages|notifications|settings|admin|help|login|auth|publish)(?:\/|$)/.test(path);
}
export type NavigationRead = { signal: AbortSignal; wait: <T>(promise: Promise<T>) => Promise<T> };
type State = { status: "loading" | "ready" | "error"; href: string };

export function waitForRead<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Coordinates reads, not writes. Same-target clicks share the original promise. */
export function createPageReadController({ notify, now = Date.now, milliseconds = PAGE_NAVIGATION_MS }: {
  notify: (state: State) => void; now?: () => number; milliseconds?: number;
}) {
  let active: { href: string; deadline: number; control: AbortController; promise: Promise<void> } | null = null;
  const resume = () => {
    if (active && now() >= active.deadline) active.control.abort(new DOMException("Page deadline exceeded", "TimeoutError"));
  };
  return {
    resume,
    // pagehide can enter BFCache. On return, retain a retryable interruption,
    // not a loading indicator whose operation has already been discarded.
    cancel() { active?.control.abort(new Error("Page read interrupted")); },
    run(href: string, load: (read: NavigationRead) => Promise<unknown>) {
      if (active?.href === href && !active.control.signal.aborted) return active.promise;
      active?.control.abort(new DOMException("Page superseded", "AbortError"));
      const control = new AbortController();
      const next = { href, deadline: now() + milliseconds, control, promise: Promise.resolve() };
      active = next;
      notify({ status: "loading", href });
      const timer = setTimeout(() => control.abort(new DOMException("Page deadline exceeded", "TimeoutError")), milliseconds);
      const read: NavigationRead = { signal: control.signal, wait: (promise) => waitForRead(promise, control.signal) };
      next.promise = read.wait(Promise.resolve().then(() => load(read))).then(() => {
        if (active === next) notify({ status: "ready", href });
      }, () => {
        if (active === next && control.signal.reason?.name !== "AbortError") notify({ status: "error", href });
      }).finally(() => { clearTimeout(timer); if (active === next) active = null; });
      return next.promise;
    },
  };
}

/** A failed RSC payload must not become a successful five-minute cache entry. */
export function isReusablePage(buffer: ArrayBuffer) {
  const text = new TextDecoder().decode(buffer);
  return !/(?:^|\n)[0-9a-f]+:E\{|"data-marketo-error"\s*:\s*(?:true|"true")/.test(text);
}

async function contentPainted(read: NavigationRead) {
  await read.wait(new Promise<void>((resolve, reject) => {
    let frame = 0;
    const abort = () => { cancelAnimationFrame(frame); reject(read.signal.reason); };
    read.signal.addEventListener("abort", abort, { once: true });
    const check = () => {
      const main = document.querySelector("#main-content");
      const busy = [...document.querySelectorAll('[aria-busy="true"]')].some(node => node.getClientRects().length > 0);
      if (main && !busy) {
        read.signal.removeEventListener("abort", abort);
        if (main.matches('[data-marketo-error]') || main.querySelector('[data-marketo-error]')) reject(new Error("Page content unavailable"));
        else resolve();
      }
      else frame = requestAnimationFrame(check);
    };
    // The router's commit promise includes one frame; wait for nested content too.
    frame = requestAnimationFrame(check);
  }));
}

type Navigate = (href: string, depth: number, kind: string, historyMode: unknown, previous: unknown, programmatic: boolean, read: NavigationRead) => Promise<unknown>;
export function createPageNavigation(navigate: Navigate) {
  const controller = createPageReadController({ notify: state => window.dispatchEvent(new CustomEvent(PAGE_READ_EVENT, { detail: state })) });
  const resume = () => { if (document.visibilityState === "visible") controller.resume(); };
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("pageshow", resume);
  window.addEventListener("online", resume);
  window.addEventListener("pagehide", () => controller.cancel());
  return (href: string, depth = 0, kind = "navigate", historyMode?: unknown, previous?: unknown, programmatic = false, onLoaded?: () => void) => {
    const target = new URL(href, window.location.href);
    return controller.run(target.pathname + target.search, async read => {
      await navigate(href, depth, kind, historyMode, previous, programmatic, read);
      read.signal.throwIfAborted();
      // Same-route error boundaries keep their key. Reset only after the fresh
      // payload commits, never against the original rejected React tree.
      onLoaded?.();
      await contentPainted(read);
    });
  };
}
