"use client";
import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// Only one request batch at a time. Background tabs/offline devices do not poll.
export function useChatPolling(userId: string, refresh: (signal: AbortSignal) => Promise<void>, interval: number) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; }, [refresh]);
  useEffect(() => {
    let stopped = false, running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const visible = () => document.visibilityState === "visible" && navigator.onLine;
    const schedule = (delay: number) => { clearTimeout(timer); if (!stopped && visible()) timer = setTimeout(() => void run(), delay); };
    async function run() {
      if (stopped || running || !visible()) return;
      running = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      let delay = interval;
      try { await latest.current(controller.signal); } catch { delay = Math.max(15000, interval); }
      finally { clearTimeout(timeout); running = false; schedule(delay); }
    }
    function wake() { if (visible()) schedule(0); else { clearTimeout(timer); controller?.abort(); } }
    const auth = getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_OUT" || event === "SIGNED_IN") && session?.user.id !== userId) {
        stopped = true; clearTimeout(timer); controller?.abort();
        window.location.replace("/login?next=" + encodeURIComponent("/messages"));
      }
    });
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake); window.addEventListener("offline", wake);
    schedule(interval);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); auth.data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake); window.removeEventListener("offline", wake); };
  }, [interval, userId]);
}
