"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { PENDING_AUTH_FLOW_KEY } from "@/lib/auth/events";

export function RegistrationWaiter() {
  const { t } = useI18n();
  const [state, setState] = useState("waiting");
  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 60 * 60 * 1000;
    const controller = new AbortController();
    async function check() {
      if (stopped || inFlight) return;
      clearTimeout(timer);
      if (Date.now() >= deadline) { setState("expired"); return; }
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      inFlight = true;
      try {
        const timeout = new AbortController();
        const timeoutId = setTimeout(() => timeout.abort(), 25000);
        const abort = () => timeout.abort();
        controller.signal.addEventListener("abort", abort, { once: true });
        let result: Response;
        try {
          result = await fetch("/api/auth/registration/complete", { method: "POST", cache: "no-store", signal: timeout.signal });
        } finally {
          clearTimeout(timeoutId);
          controller.signal.removeEventListener("abort", abort);
        }
        const body = await result.json() as { state?: string };
        if (stopped) return;
        if (result.ok && body.state === "complete") {
          stopped = true;
          try { sessionStorage.removeItem(PENDING_AUTH_FLOW_KEY); } catch { /* optional storage */ }
          setState("complete");
          // Full navigation refreshes browser Auth state after server-set cookies.
          window.location.replace("/profile?registered=success");
          return;
        }
        if (result.ok && ["missing", "expired", "invalid"].includes(body.state ?? "")) {
          stopped = true;
          setState(body.state ?? "expired");
          return;
        }
      } catch { /* Network recovery retries on focus/online; no password is retained. */ }
      finally {
        inFlight = false;
        if (!stopped) timer = setTimeout(() => void check(), 4000);
      }
    }
    const resume = () => void check();
    resume();
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return <p role="status">{t(state === "complete" ? "auth.registeredSuccess" : state === "waiting" ? "auth.waitingAutomatic" : "auth.registrationResumeNote")}</p>;
}
