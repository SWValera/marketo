"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { PAGE_READ_EVENT } from "@/lib/navigation/page-read";
import { RetryPage } from "@/components/retry-page";

const NAVIGATION_START = "marketo:navigation-start";

export function announceNavigation(href: string) {
  window.dispatchEvent(new CustomEvent(NAVIGATION_START, { detail: href }));
}

export function NavigationFeedback() {
  const { t } = useI18n();
  const [state, setState] = useState<{ status: string; href: string } | null>(null);

  useEffect(() => {
    const onRead = (event: Event) => {
      setState((event as CustomEvent<{ status: string; href: string }>).detail);
    };
    window.addEventListener(PAGE_READ_EVENT, onRead);
    return () => window.removeEventListener(PAGE_READ_EVENT, onRead);
  }, []);

  if (!state || state.status === "ready") return null;
  return <div className="navigation-feedback" role="status" aria-live="polite">
    {state.status === "loading" ? <><span className="navigation-progress" aria-hidden="true" /><span className="navigation-status">{t("common.loading")}</span></>
      : <span className="navigation-status" style={{ pointerEvents: "auto" }}>{t("state.errorNote")} <RetryPage href={state.href} preserveCurrentQuery={false}>{t("common.retry")}</RetryPage></span>}
  </div>;
}
