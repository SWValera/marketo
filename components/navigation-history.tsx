"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { safeDeleteBrowserStorage, safeReadBrowserStorage, safeWriteBrowserStorage } from "@/lib/browser/storage";
import { browserPreviousEntry, internalReturnPath } from "@/lib/navigation/back-target";

export const CURRENT_ROUTE_KEY = "marketo:current-route";
export const PREVIOUS_ROUTE_KEY = "marketo:previous-route";

export function NavigationHistory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const mounted = useRef(false);

  useEffect(() => {
    function remember() {
      const href = window.location.href;
      const currentPath = internalReturnPath(href, href) ?? window.location.pathname;
      const storedCurrent = safeReadBrowserStorage("sessionStorage", CURRENT_ROUTE_KEY);
      const storedPrevious = safeReadBrowserStorage("sessionStorage", PREVIOUS_ROUTE_KEY);
      const candidate = mounted.current ? storedCurrent
        : internalReturnPath(browserPreviousEntry(), href)
          // A reload preserves the full source, including filters and an anchor.
          ?? (storedCurrent === currentPath ? storedPrevious : null)
          ?? internalReturnPath(window.history.state?.__vinext_previousNextUrl, href)
          ?? internalReturnPath(document.referrer, href);
      const previous = internalReturnPath(candidate, href);
      if (previous && previous !== currentPath) safeWriteBrowserStorage("sessionStorage", PREVIOUS_ROUTE_KEY, previous);
      else if (!mounted.current) safeDeleteBrowserStorage("sessionStorage", PREVIOUS_ROUTE_KEY);
      safeWriteBrowserStorage("sessionStorage", CURRENT_ROUTE_KEY, currentPath);
      mounted.current = true;
    }
    remember();
    window.addEventListener("hashchange", remember);
    return () => window.removeEventListener("hashchange", remember);
  }, [pathname, search]);

  return null;
}
