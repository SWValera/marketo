type NavigationTarget = { href: string; from: string };
type RecoveryClock = {
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel: (handle: ReturnType<typeof setTimeout>) => void;
};

export const NAVIGATION_RECOVERY_MS = 10000;

/** A stuck client transition may recover with one normal same-origin GET. */
export function createNavigationRecovery({ currentHref, navigate, onPending, clock = {
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: (handle) => clearTimeout(handle),
} }: {
  currentHref: () => string;
  navigate: (href: string) => void;
  onPending: (href: string | null) => void;
  clock?: RecoveryClock;
}) {
  let target: NavigationTarget | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function finish() {
    if (timer !== undefined) clock.cancel(timer);
    timer = undefined;
    target = null;
    onPending(null);
  }
  return {
    begin(href: string) {
      const from = new URL(currentHref());
      const to = new URL(href, from);
      if (to.origin !== from.origin || !['http:', 'https:'].includes(to.protocol)) return;
      if (to.pathname === from.pathname && to.search === from.search) return;
      finish();
      const next = { href: to.href, from: from.href };
      target = next;
      onPending(next.href);
      timer = clock.schedule(() => {
        if (target !== next) return;
        const unchanged = currentHref() === next.from;
        finish();
        if (unchanged) navigate(next.href);
      }, NAVIGATION_RECOVERY_MS);
    },
    finish,
  };
}
