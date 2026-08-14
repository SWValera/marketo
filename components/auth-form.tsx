"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export function AuthForm() {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  function requestCode() {
    if (phone.replace(/\D/g, "").length < 10) {
      setMessage(t("auth.invalidPhone"));
      return;
    }
    setMessage(t("auth.notConnected"));
  }

  return <>
    <label className="form-field"><span>{t("auth.phone")}</span><div className="phone-field"><span>🇰🇿 +7</span><input type="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setMessage(""); }} placeholder="700 000 00 00" inputMode="tel" autoComplete="tel" aria-describedby="auth-status" /></div></label>
    {message && <div id="auth-status" className="auth-feedback" role="status">{message}</div>}
    <button className="auth-submit" type="button" onClick={requestCode}>{t("common.continue")}</button>
  </>;
}
