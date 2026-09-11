"use client";
import { useEffect, useState } from "react";
import { classifyAuthCallbackError } from "@/lib/auth/callback-error";
import { BrandIcon } from "@/components/brand";

import { LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { AuthForm, type AuthMode } from "@/components/auth-form";
import { BackButton } from "@/components/back-button";
import { useI18n } from "@/components/i18n-provider";
import type { AuthCallbackError } from "@/lib/auth/callback-error";

export function LoginContent({ mode, next, callbackError = null, passwordResetSuccess = false, resumePending = true }: { mode: AuthMode; next: string; callbackError?: AuthCallbackError | null; passwordResetSuccess?: boolean; resumePending?: boolean }) {
  const { t } = useI18n();
  const [providerError, setProviderError] = useState<AuthCallbackError | null>(null);
  useEffect(() => {
    // Supabase verification failures may arrive as a fragment, invisible to HTTP.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (!fragment.has("error") && !fragment.has("error_code")) return;
    const error = classifyAuthCallbackError({ code: fragment.get("error_code") ?? "invalid" });
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    window.queueMicrotask(() => setProviderError(error));
  }, []);
  const displayedError = providerError ?? callbackError;
  const errorKey = displayedError === "expired" ? "auth.errorCallbackExpired" : displayedError === "rate_limited" ? "auth.errorRateLimited" : displayedError === "unavailable" ? "auth.errorGeneric" : "auth.errorCallbackInvalid";
  return <main id="main-content" tabIndex={-1} className="auth-page"><section className="auth-card"><BackButton className="auth-back" fallback="/" label={t("auth.home")} /><div className="auth-brand"><BrandIcon className="brand-mark" size={64} /></div><span className="section-kicker">{t("auth.eyebrow")}</span><h1>{mode === "update-password" ? t("auth.updatePasswordTitle") : t("auth.welcome")}</h1><p>{mode === "update-password" ? t("auth.updatePasswordDescription") : t("auth.description")}</p>{displayedError ? <div className="auth-feedback is-error" role="alert">{t(errorKey)}</div> : null}{passwordResetSuccess ? <div className="auth-feedback is-success" role="status">{t("auth.passwordResetSuccess")}</div> : null}<AuthForm initialMode={mode} next={next} resumePending={resumePending && !displayedError && !passwordResetSuccess} /><div className="auth-benefits"><span><ShieldCheck size={18} /> {t("auth.safe")}</span><span><Smartphone size={18} /> {t("auth.devices")}</span><span><LockKeyhole size={18} /> {t("auth.privatePhone")}</span></div><small className="auth-terms">{t("auth.terms")}</small></section></main>;
}
