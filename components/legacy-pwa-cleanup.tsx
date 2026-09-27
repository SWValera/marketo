"use client";

import { useEffect } from "react";
import { retireLegacyPwa } from "@/lib/browser/retire-pwa";

/** Temporary retirement only; never registers a worker or reloads a document. */
export function LegacyPwaCleanup() {
  useEffect(() => {
    const cleanup = () => {
      try { void retireLegacyPwa(navigator.serviceWorker, window.caches, location.origin); }
      catch { /* Optional browser storage must not prevent ordinary web use. */ }
    };
    const timer = window.setTimeout(cleanup, 0);
    window.addEventListener("online", cleanup);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", cleanup); };
  }, []);
  return null;
}
