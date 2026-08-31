"use client";

import { LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { AuthForm, type AuthMode } from "@/components/auth-form";
import { BackButton } from "@/components/back-button";
import { useI18n } from "@/components/i18n-provider";
import type { AuthCallbackError } from "@/lib/auth/callback-error";

export function LoginContent({ mode, next, callbackError = null, passwordResetSuccess = false }: { mode: AuthMode; next: string; callbackError?: AuthCallbackError | null; passwordResetSuccess?: boolean }) {
  const { t } = useI18n();
  return <main className="auth-page"><section className="auth-card"><BackButton className="auth-back" fallback="/" label={t("auth.home")} /><div className="auth-brand"><span className="brand-mark">M</span></div><span className="section-kicker">{t("auth.eyebrow")}</span><h1>{mode === "update-password" ? t("auth.updatePasswordTitle") : t("auth.welcome")}</h1><p>{mode === "update-password" ? t("auth.updatePasswordDescription") : t("auth.description")}</p>{callbackError ? <div className="auth-feedback is-error" role="alert">{t(callbackError === "expired" ? "auth.errorCallbackExpired" : "auth.errorCallbackInvalid")}</div> : null}{passwordResetSuccess ? <div className="auth-feedback is-success" role="status">{t("auth.passwordResetSuccess")}</div> : null}<AuthForm initialMode={mode} next={next} /><div className="auth-benefits"><span><ShieldCheck size={18} /> {t("auth.safe")}</span><span><Smartphone size={18} /> {t("auth.devices")}</span><span><LockKeyhole size={18} /> {t("auth.privatePhone")}</span></div><small className="auth-terms">{t("auth.terms")}</small></section></main>;
}
