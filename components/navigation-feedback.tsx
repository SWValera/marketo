"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { createNavigationRecovery } from "@/lib/navigation/recovery";

const NAVIGATION_START = "marketo:navigation-start";

export function announceNavigation(href: string) {
  window.dispatchEvent(new CustomEvent(NAVIGATION_START, { detail: href }));
}

export function NavigationFeedback() {
  const { t } = useI18n();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState(false);
  const finish = useRef(() => {});

  useEffect(() => {
    const recovery = createNavigationRecovery({
      currentHref: () => window.location.href,
      navigate: (href) => window.location.assign(href),
      onPending: (href) => setPending(href !== null),
    });
    finish.current = recovery.finish;
    const onStart = (event: Event) => {
      const href = (event as CustomEvent<unknown>).detail;
      if (typeof href === "string") recovery.begin(href);
    };
    window.addEventListener(NAVIGATION_START, onStart);
    window.addEventListener("pagehide", recovery.finish);
    return () => {
      window.removeEventListener(NAVIGATION_START, onStart);
      window.removeEventListener("pagehide", recovery.finish);
      recovery.finish();
      finish.current = () => {};
    };
  }, []);

  useEffect(() => { finish.current(); }, [pathname, search]);

  if (!pending) return null;
  return <div className="navigation-feedback" role="status" aria-live="polite">
    <span className="navigation-progress" aria-hidden="true" />
    <span className="navigation-status">{t("common.loading")}</span>
  </div>;
}
