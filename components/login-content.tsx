"use client";

import { LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { BackButton } from "@/components/back-button";
import { useI18n } from "@/components/i18n-provider";

export function LoginContent() {
  const { t } = useI18n();
  return <main className="auth-page"><section className="auth-card"><BackButton className="auth-back" fallback="/" label={t("auth.home")} /><div className="auth-brand"><span className="brand-mark">M</span></div><span className="section-kicker">{t("auth.eyebrow")}</span><h1>{t("auth.welcome")}</h1><p>{t("auth.description")}</p><AuthForm /><div className="auth-benefits"><span><ShieldCheck size={18} /> {t("auth.safe")}</span><span><Smartphone size={18} /> {t("auth.devices")}</span><span><LockKeyhole size={18} /> {t("auth.privatePhone")}</span></div><small className="auth-terms">{t("auth.terms")}</small></section></main>;
}
