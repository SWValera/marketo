"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { CURRENT_ROUTE_KEY, PREVIOUS_ROUTE_KEY } from "@/components/navigation-history";
import { useI18n } from "@/components/i18n-provider";
import { safeReadBrowserStorage } from "@/lib/browser/storage";
import { browserPreviousEntry, resolveBackTarget } from "@/lib/navigation/back-target";

export function BackButton({
  fallback,
  label,
  className = "",
  onBack,
}: {
  fallback: string;
  label?: string;
  className?: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const accessibleLabel = label ?? t("common.back");

  function goBack() {
    if (onBack) {
      onBack();
      return;
    }
    const target = resolveBackTarget({
      currentHref: window.location.href,
      historyLength: window.history.length,
      previousEntry: browserPreviousEntry(),
      routerPrevious: window.history.state?.__vinext_previousNextUrl,
      storedCurrent: safeReadBrowserStorage("sessionStorage", CURRENT_ROUTE_KEY),
      storedPrevious: safeReadBrowserStorage("sessionStorage", PREVIOUS_ROUTE_KEY),
      referrer: document.referrer,
      fallback,
    });
    if (target.kind === "back") router.back();
    else router.replace(target.href);
  }

  return (
    <button type="button" className={`back-button ${className}`.trim()} onClick={goBack} aria-label={accessibleLabel}>
      <ChevronLeft size={21} aria-hidden="true" />
      <span>{accessibleLabel}</span>
    </button>
  );
}
