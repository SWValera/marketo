"use client";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { MessageKey } from "@/lib/i18n/messages";

export function DeleteAccountForm({resume = false}: {resume?: boolean}) {
  const {t} = useI18n();
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(resume);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const flight = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (flight.current || (!pending && (!confirmed || !password))) return;
    flight.current = true; setBusy(true); setError(null);
    let body: {resume?: boolean; password?: string; confirmation?: string} = pending ? {resume: true} : {password, confirmation: "DELETE"};
    setPassword("");
    try {
      // Preparation delivers an HttpOnly recovery cookie before external erasure.
      // Continue bounded batches automatically; a failure leaves a retry action.
      for (let batch = 0; batch < 10; batch++) {
      const response = await fetch("/api/account/delete", {method: "POST", credentials: "same-origin", cache: "no-store",
        headers: {"Content-Type": "application/json"}, body: JSON.stringify(body), signal: AbortSignal.timeout(60000)});
      delete body.password;
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid_response");
      const data = payload as {status?: unknown; error?: unknown};
      if (response.ok && data.status === "completed") {
        // Auth is already erased on the server; do not wait indefinitely on an old client lock.
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([getSupabaseBrowserClient().auth.signOut({scope: "local"}).catch(() => {}),
          new Promise<void>(resolve => { timer = setTimeout(resolve, 3000); })]);
        clearTimeout(timer);
        window.location.replace("/"); return;
      }
      if (data.status === "pending") {
        setPending(true); body = {resume: true};
        if (response.ok) continue;
        setError("accountDelete.retry"); return;
      }
      setPending(false);
      setError(data.error === "password_invalid" ? "accountDelete.passwordInvalid"
        : data.error === "assisted_deletion_required" ? "accountDelete.assisted"
        : data.error === "authentication_required" ? "accountDelete.signIn"
        : "accountDelete.unavailable");
      return;
      }
    } catch { setError("accountDelete.retry"); }
    finally { delete body.password; flight.current = false; setBusy(false); }
  }
  return <form className="account-delete-form" onSubmit={event => void submit(event)}>
    <div className="account-delete-warning"><Trash2 size={24} /><p>{t("accountDelete.warning")}</p></div>
    {pending ? <p role="status">{t("accountDelete.pending")}</p> : <>
      <label className="form-field"><span>{t("accountDelete.password")}</span><input type="password" autoComplete="current-password" value={password} maxLength={1024} onChange={event => setPassword(event.target.value)} required disabled={busy} /></label>
      <label className="account-delete-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required /><span>{t("accountDelete.confirm")}</span></label>
    </>}
    {error ? <p className="owner-listing-action-error" role="alert">{t(error)}</p> : null}
    <div className="form-actions"><button className="account-delete-submit" type="submit" disabled={busy || (!pending && (!confirmed || !password))}>{t(busy ? "common.loading" : pending ? "accountDelete.continue" : "accountDelete.submit")}</button>
      {!pending && !busy ? <a className="secondary-button" href="/profile">{t("common.cancel")}</a> : null}</div>
  </form>;
}
