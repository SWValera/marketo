"use client";

import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { usePathname } from "next/navigation";
import { RetryPage } from "@/components/retry-page";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return <main id="main-content" tabIndex={-1} className="state-page" data-marketo-error="true"><section className="state-card"><span className="state-icon"><AlertTriangle /></span><h1>{t("state.error")}</h1><p>{t("state.errorNote")}</p><RetryPage href={pathname || "/"} onLoaded={reset} className="primary-button">{t("common.retry")}</RetryPage></section></main>;
}
