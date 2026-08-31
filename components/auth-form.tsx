"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  PENDING_AUTH_EMAIL_KEY,
  PENDING_AUTH_FLOW_KEY,
  publishBrowserAuthEvent,
  subscribeToBrowserAuthEvents,
} from "@/lib/auth/events";
import { authCallbackUrl, safeInternalPath } from "@/lib/auth/redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export type AuthMode = "login" | "register" | "recover" | "update-password";
type PendingFlow = "signup" | "recovery";

function authErrorKey(error: { message?: string; status?: number }) {
  const message = error.message?.toLowerCase() ?? "";
  if (error.status === 429) return "auth.errorRateLimited" as const;
  if (message.includes("email not confirmed")) return "auth.errorEmailNotConfirmed" as const;
  if (message.includes("invalid login credentials")) return "auth.errorInvalidCredentials" as const;
  if (message.includes("already registered") || message.includes("user already exists")) return "auth.errorAlreadyRegistered" as const;
  if (message.includes("password") && (message.includes("short") || message.includes("characters"))) return "auth.errorWeakPassword" as const;
  if (message.includes("email") && message.includes("invalid")) return "auth.errorInvalidEmail" as const;
  return "auth.errorGeneric" as const;
}

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function rememberPendingAuth(email: string, flow: PendingFlow | null) {
  try {
    window.sessionStorage.setItem(PENDING_AUTH_EMAIL_KEY, email);
    if (flow) window.sessionStorage.setItem(PENDING_AUTH_FLOW_KEY, flow);
    else window.sessionStorage.removeItem(PENDING_AUTH_FLOW_KEY);
  } catch {
    // The in-memory form remains usable when browser storage is blocked.
  }
}

function clearPendingFlow() {
  try {
    window.sessionStorage.removeItem(PENDING_AUTH_FLOW_KEY);
  } catch {
    // No sensitive value needs cleanup when storage is unavailable.
  }
}

export function AuthForm({ initialMode = "login", next = "/profile" }: { initialMode?: AuthMode; next?: string }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pendingFlow, setPendingFlow] = useState<PendingFlow | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const destination = safeInternalPath(next);

  useEffect(() => {
    let cancelled = false;
    try {
      const storedEmail = window.sessionStorage.getItem(PENDING_AUTH_EMAIL_KEY);
      const storedFlow = window.sessionStorage.getItem(PENDING_AUTH_FLOW_KEY);
      window.queueMicrotask(() => {
        if (cancelled) return;
        if (storedEmail && /^\S+@\S+\.\S+$/.test(storedEmail)) setEmail(storedEmail);
        if (initialMode !== "update-password" && (storedFlow === "signup" || storedFlow === "recovery")) {
          setMode(storedFlow === "signup" ? "register" : "recover");
          setPendingFlow(storedFlow);
        }
      });
    } catch {
      // Session storage is an enhancement, not an Auth dependency.
    }

    if (initialMode === "update-password") publishBrowserAuthEvent("recovery-ready");
    const unsubscribe = subscribeToBrowserAuthEvents((event) => {
      if (event.type === "signup-confirmed") {
        setPendingFlow(null);
        setMode("login");
        clearPendingFlow();
        setError("");
        setMessage(t("auth.confirmationDetected"));
      } else if (event.type === "recovery-ready") {
        setMessage(t("auth.recoveryReadyOtherTab"));
      } else if (event.type === "password-updated") {
        setPendingFlow(null);
        setMode("login");
        clearPendingFlow();
        setError("");
        setMessage(t("auth.passwordUpdatedOtherTab"));
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [initialMode, t]);

  function selectMode(value: Exclude<AuthMode, "update-password">) {
    setMode(value);
    setPendingFlow(null);
    clearPendingFlow();
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    setError("");
  }

  async function signIn() {
    const result = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: normalizedEmail(email),
      password,
    });
    if (result.error) throw result.error;
    clearPendingFlow();
    router.replace(destination);
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (mode !== "update-password" && !/^\S+@\S+\.\S+$/.test(normalizedEmail(email))) {
      setError(t("auth.errorInvalidEmail"));
      return;
    }
    if (mode === "register" && !displayName.trim()) {
      setError(t("auth.errorDisplayName"));
      return;
    }
    if ((mode === "register" || mode === "update-password") && password.length < 8) {
      setError(t("auth.errorWeakPassword"));
      return;
    }
    if ((mode === "register" || mode === "update-password") && password !== confirmPassword) {
      setError(t("auth.errorPasswordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const client = getSupabaseBrowserClient();
      if (mode === "login") {
        await signIn();
        return;
      }
      if (mode === "register") {
        const cleanEmail = normalizedEmail(email);
        const result = await client.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: authCallbackUrl(window.location.origin, destination, "signup"),
            data: { display_name: displayName.trim(), language: locale },
          },
        });
        if (result.error) throw result.error;
        if (result.data.session) {
          router.replace(destination);
          router.refresh();
          return;
        }
        rememberPendingAuth(cleanEmail, "signup");
        setPendingFlow("signup");
        setMessage(t("auth.registrationCheckEmail"));
        return;
      }
      if (mode === "recover") {
        const cleanEmail = normalizedEmail(email);
        const result = await client.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: authCallbackUrl(window.location.origin, "/login?password_reset=success", "recovery"),
        });
        if (result.error) throw result.error;
        rememberPendingAuth(cleanEmail, "recovery");
        setPendingFlow("recovery");
        setMessage(t("auth.recoverySent"));
        return;
      }
      const result = await client.auth.updateUser({ password });
      if (result.error) throw result.error;
      const userResult = await client.auth.getUser();
      if (userResult.data.user?.email) rememberPendingAuth(userResult.data.user.email, null);
      const signOutResult = await client.auth.signOut({ scope: "local" });
      if (signOutResult.error) throw signOutResult.error;
      publishBrowserAuthEvent("password-updated");
      setMessage(t("auth.passwordUpdated"));
      window.setTimeout(() => {
        router.replace(destination);
        router.refresh();
      }, 500);
    } catch (caught) {
      const authError = caught as { message?: string; status?: number };
      setError(t(authErrorKey(authError)));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!pendingFlow) return;
    setResending(true);
    setError("");
    setMessage("");
    try {
      const client = getSupabaseBrowserClient();
      if (pendingFlow === "signup") {
        const result = await client.auth.resend({
          type: "signup",
          email: normalizedEmail(email),
          options: { emailRedirectTo: authCallbackUrl(window.location.origin, destination, "signup") },
        });
        if (result.error) throw result.error;
      } else {
        const result = await client.auth.resetPasswordForEmail(normalizedEmail(email), {
          redirectTo: authCallbackUrl(window.location.origin, "/login?password_reset=success", "recovery"),
        });
        if (result.error) throw result.error;
      }
      setMessage(t("auth.emailResent"));
    } catch (caught) {
      setError(t(authErrorKey(caught as { message?: string; status?: number })));
    } finally {
      setResending(false);
    }
  }

  async function confirmedAndSignIn() {
    if (pendingFlow !== "signup") return;
    if (!password) {
      setPendingFlow(null);
      setMode("login");
      clearPendingFlow();
      setMessage(t("auth.enterPasswordAfterConfirmation"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signIn();
    } catch (caught) {
      setError(t(authErrorKey(caught as { message?: string; status?: number })));
    } finally {
      setLoading(false);
    }
  }

  return <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
    {mode !== "update-password" ? <div className="auth-mode-tabs" role="tablist" aria-label={t("auth.modeAria")}>
      {(["login", "register", "recover"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} className={mode === value ? "is-active" : ""} onClick={() => selectMode(value)}>{t(`auth.mode.${value}`)}</button>)}
    </div> : null}

    {pendingFlow ? <section className="auth-pending-state" aria-live="polite">
      <h2>{t("auth.checkEmailTitle")}</h2>
      <p>{t(pendingFlow === "signup" ? "auth.pendingSignupNote" : "auth.pendingRecoveryNote", { email: normalizedEmail(email) })}</p>
      <p className="auth-device-note">{t("auth.crossDeviceNote")}</p>
      {error ? <div id="auth-status" className="auth-feedback is-error" role="alert">{error}</div> : null}
      {message ? <div id="auth-status" className="auth-feedback is-success" role="status">{message}</div> : null}
      <div className="auth-pending-actions">
        <button className="secondary-button" type="button" disabled={resending} onClick={() => void resend()}>{resending ? t("auth.resending") : t("auth.resend")}</button>
        {pendingFlow === "signup" ? <button className="auth-submit" type="button" disabled={loading} onClick={() => void confirmedAndSignIn()}>{loading ? t("auth.loading") : t("auth.confirmedSignIn")}</button> : <button className="auth-submit" type="button" onClick={() => selectMode("login")}>{t("auth.backToLogin")}</button>}
      </div>
      <button className="auth-change-email" type="button" onClick={() => selectMode(pendingFlow === "signup" ? "register" : "recover")}>{t("auth.useAnotherEmail")}</button>
    </section> : <>
      {mode === "register" ? <label className="form-field"><span>{t("auth.displayName")}</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" maxLength={80} required /></label> : null}
      {mode !== "update-password" ? <label className="form-field"><span>{t("auth.email")}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.kz" autoComplete="email" inputMode="email" required /></label> : null}
      {mode === "login" || mode === "register" || mode === "update-password" ? <label className="form-field"><span>{mode === "update-password" ? t("auth.newPassword") : t("auth.password")}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /></label> : null}
      {mode === "register" || mode === "update-password" ? <label className="form-field"><span>{t("auth.confirmPassword")}</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label> : null}

      {error ? <div id="auth-status" className="auth-feedback is-error" role="alert">{error}</div> : null}
      {message ? <div id="auth-status" className="auth-feedback is-success" role="status">{message}</div> : null}
      <button className="auth-submit" type="submit" disabled={loading}>{loading ? t("auth.loading") : t(`auth.submit.${mode}`)}</button>
    </>}
  </form>;
}
