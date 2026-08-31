"use client";

import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";
import { useEffect } from "react";
import { useI18n } from "@/components/i18n-provider";
import { publishBrowserAuthEvent } from "@/lib/auth/events";

export function AuthResultContent({ next }: { next: string }) {
  const { t } = useI18n();
  useEffect(() => publishBrowserAuthEvent("signup-confirmed"), []);
  return <main className="auth-page"><section className="auth-card auth-result-card" role="status">
    <span className="auth-result-icon"><CheckCircle2 size={34} /></span>
    <h1>{t("auth.confirmationSuccessTitle")}</h1>
    <p>{t("auth.confirmationSuccessNote")}</p>
    <div className="auth-result-actions">
      <Link className="primary-action" href={next}>{t("auth.returnToMarketo")}</Link>
      <button className="secondary-button" type="button" onClick={() => window.close()}><X size={17} />{t("auth.closeTab")}</button>
    </div>
  </section></main>;
}
