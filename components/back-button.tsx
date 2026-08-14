"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { PREVIOUS_ROUTE_KEY } from "@/components/navigation-history";
import { useI18n } from "@/components/i18n-provider";

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
    const previousRoute = window.sessionStorage.getItem(PREVIOUS_ROUTE_KEY);
    const hasInternalHistory = Boolean(previousRoute && previousRoute !== window.location.pathname && window.history.length > 1);
    if (hasInternalHistory) router.back();
    else router.push(fallback);
  }

  return (
    <button type="button" className={`back-button ${className}`.trim()} onClick={goBack} aria-label={accessibleLabel}>
      <ChevronLeft size={21} aria-hidden="true" />
      <span>{accessibleLabel}</span>
    </button>
  );
}
