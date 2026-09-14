"use client";

import { useMemo, useSyncExternalStore } from "react";
import { createShowcaseClock, type ShowcaseClockEnvironment } from "@/lib/showcase-clock";

const browserClock: ShowcaseClockEnvironment = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (timer) => window.clearTimeout(timer),
  isVisible: () => !document.hidden,
  subscribeActivity: (listener) => {
    const resume = () => listener(!document.hidden);
    const suspend = () => listener(false);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", suspend);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", suspend);
    };
  },
};

export function useShowcaseTimeline(pageCount: number, paused: boolean, scope: string) {
  const clock = useMemo(
    () => createShowcaseClock({ pageCount, paused, scope }, browserClock),
    [pageCount, paused, scope],
  );
  const page = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getServerSnapshot);
  return { page, selectPage: clock.selectPage };
}
