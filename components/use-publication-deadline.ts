"use client";
import { useEffect, useSyncExternalStore } from "react";
import { millisecondsUntilServerDeadline, readInitialServerTime, readServerTime, refreshServerTime, subscribeServerTime } from "@/lib/lifecycle/server-clock";

/** Only a successful server response may confirm that a deadline has passed. */
export function useServerDeadlines(deadlines: readonly (string | null | undefined)[]) {
  const now = useSyncExternalStore(subscribeServerTime, readServerTime, readInitialServerTime);
  const next = Math.min(...deadlines.map((date) => Date.parse(date ?? "")).filter((date) => date > now));
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const confirmed = await refreshServerTime();
      // Keep the last server state during an outage; retry rather than consulting the phone clock.
      if (active && !confirmed) timer = setTimeout(check, 5000);
    };
    timer = setTimeout(check, now ? Math.min(millisecondsUntilServerDeadline(next) + 20, 2147483647) : 5000);
    return () => { active = false; clearTimeout(timer); };
  }, [now, next]);
  return now;
}

export function usePublicationDeadline(expiresAt?: string | null) {
  const now = useServerDeadlines([expiresAt]);
  const deadline = Date.parse(expiresAt ?? "");
  return now > 0 && Number.isFinite(deadline) && deadline <= now;
}
