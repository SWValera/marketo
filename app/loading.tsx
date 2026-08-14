"use client";

import { useI18n } from "@/components/i18n-provider";

export default function Loading() {
  const { t } = useI18n();
  return <main className="loading-skeleton" aria-busy="true" aria-label={t("common.loading")}><div className="skeleton-line" /><div className="skeleton-card" /></main>;
}
