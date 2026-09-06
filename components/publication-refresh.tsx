"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function PublicationRefresh({ expiresAt }: { expiresAt: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (!expiresAt) return;
    const deadline = Date.parse(expiresAt);
    if (!Number.isFinite(deadline)) return;
    let timer: ReturnType<typeof setTimeout>;
    let refreshed = false;
    const check = () => {
      clearTimeout(timer);
      if (refreshed) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) { refreshed = true; router.refresh(); }
      else timer = setTimeout(check, Math.min(remaining + 20, 2147483647));
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { clearTimeout(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [expiresAt, router]);
  return null;
}
