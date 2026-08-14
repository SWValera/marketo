"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

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
      if (!referrer || referrer.origin !== window.location.origin) sessionStorage.removeItem(PREVIOUS_ROUTE_KEY);
      sessionStorage.setItem(CURRENT_ROUTE_KEY, currentPath);
      return;
    }

    const previousPath = sessionStorage.getItem(CURRENT_ROUTE_KEY);
    if (previousPath && previousPath !== currentPath) sessionStorage.setItem(PREVIOUS_ROUTE_KEY, previousPath);
    sessionStorage.setItem(CURRENT_ROUTE_KEY, currentPath);
  }, [pathname]);

  return null;
}
