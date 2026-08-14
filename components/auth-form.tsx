"use client";

import { useState } from "react";

export function AuthForm() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  function requestCode() {
    if (phone.replace(/\D/g, "").length < 10) {
      setMessage("Введите номер из 10 цифр.");
      return;
    }
    setMessage("Отправка SMS будет доступна после подключения Supabase Auth. Код не отправлялся.");
  }

  return <>
    <label className="form-field"><span>Номер телефона</span><div className="phone-field"><span>🇰🇿 +7</span><input type="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setMessage(""); }} placeholder="700 000 00 00" inputMode="tel" autoComplete="tel" aria-describedby="auth-status" /></div></label>
    {message && <div id="auth-status" className="auth-feedback" role="status">{message}</div>}
    <button className="auth-submit" type="button" onClick={requestCode}>Продолжить</button>
  </>;
}
