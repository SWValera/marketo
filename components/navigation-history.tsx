"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { safeDeleteBrowserStorage, safeReadBrowserStorage, safeWriteBrowserStorage } from "@/lib/browser/storage";

export const CURRENT_ROUTE_KEY = "marketo:current-route";
export const PREVIOUS_ROUTE_KEY = "marketo:previous-route";

export function NavigationHistory() {
  const pathname = usePathname();
  const mounted = useRef(false);

  useEffect(() => {
    const currentPath = pathname || "/";
    if (!mounted.current) {
      mounted.current = true;
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (!referrer || referrer.origin !== window.location.origin) safeDeleteBrowserStorage("sessionStorage", PREVIOUS_ROUTE_KEY);
      safeWriteBrowserStorage("sessionStorage", CURRENT_ROUTE_KEY, currentPath);
      return;
    }

    const previousPath = safeReadBrowserStorage("sessionStorage", CURRENT_ROUTE_KEY);
    if (previousPath && previousPath !== currentPath) safeWriteBrowserStorage("sessionStorage", PREVIOUS_ROUTE_KEY, previousPath);
    safeWriteBrowserStorage("sessionStorage", CURRENT_ROUTE_KEY, currentPath);
  }, [pathname]);

  return null;
}
