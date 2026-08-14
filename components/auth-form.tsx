"use client";

import { useState } from "react";

export function AuthForm() {
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);

  function requestCode() {
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Введите номер из 10 цифр.");
      return;
    }
    setError("");
    setStage("code");
  }

  return stage === "phone" ? (
    <>
      <label className="form-field"><span>Номер телефона</span><div className="phone-field"><span>🇰🇿 +7</span><input type="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setError(""); }} placeholder="700 123 45 67" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(error)} /></div></label>
      {error && <div className="auth-feedback error" role="alert">{error}</div>}
      <button className="auth-submit" type="button" onClick={requestCode}>Получить код</button>
    </>
  ) : (
    <>
      <div className="auth-code-copy">Код отправлен на <strong>+7 {phone}</strong></div>
      <label className="form-field"><span>Код из SMS</span><input className="otp-field" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="• • • • • •" aria-label="Код из шести цифр" /></label>
      <button className="auth-submit" type="button" disabled={code.length !== 6}>Войти в Marketo</button>
      <div className="auth-inline-actions"><button type="button" onClick={() => { setStage("phone"); setCode(""); setResent(false); }}>Изменить номер</button><button type="button" onClick={() => setResent(true)}>{resent ? "Код отправлен" : "Отправить код ещё раз"}</button></div>
    </>
  );
}
