"use client";

import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return <main id="main-content" tabIndex={-1} className="state-page"><section className="state-card"><span className="state-icon"><AlertTriangle /></span><h1>{t("state.error")}</h1><p>{t("state.errorNote")}</p><button className="primary-button" onClick={reset}>{t("common.retry")}</button></section></main>;
}
