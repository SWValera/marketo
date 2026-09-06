"use client";
import { useEffect, useState } from "react";

/** Rechecks on resume because mobile browsers suspend timers in the background. */
export function usePublicationDeadline(expiresAt?: string | null) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = expiresAt ? Date.parse(expiresAt) : NaN;
    const check = () => {
      clearTimeout(timer);
      if (!active) return;
      const remaining = deadline - Date.now();
      setExpired(Number.isFinite(remaining) && remaining <= 0);
      if (remaining > 0) timer = setTimeout(check, Math.min(remaining, 2147483647));
    };
    queueMicrotask(check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { active = false; clearTimeout(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [expiresAt]);
  return expired;
}
