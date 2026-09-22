/** Last confirmed server time. Device wall-clock time is never consulted. */
let confirmedAt = 0;
let receivedAt = 0;
let flight: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
export const readServerTime = () => confirmedAt;
export const readInitialServerTime = () => 0;

export function refreshServerTime(): Promise<boolean> {
  if (flight) return flight;
  flight = (async () => {
    try {
      const response = await fetch("/api/lifecycle/time", {
        cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) return false;
      const payload = await response.json() as { now?: unknown };
      if (typeof payload.now !== "number" || !Number.isFinite(payload.now) || payload.now <= 0) return false;
      confirmedAt = payload.now;
      receivedAt = performance.now();
      listeners.forEach((listener) => listener());
      return true;
    } catch { return false; }
    finally { flight = null; }
  })();
  return flight;
}

/** Monotonic elapsed time only schedules a read; it never expires an entitlement. */
export function millisecondsUntilServerDeadline(deadline: number) {
  return Math.max(0, deadline - confirmedAt - Math.max(0, performance.now() - receivedAt));
}
function resume() {
  if (document.visibilityState === "visible") void refreshServerTime();
}
export function subscribeServerTime(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    void refreshServerTime();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    }
  };
}
