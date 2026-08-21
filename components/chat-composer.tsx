"use client";

import { Paperclip, Send } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export function ChatComposer() {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState("");
  const [status, setStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) {
      setStatus(t("messages.enterMessage"));
      return;
    }
    setStatus(t("messages.accountRequired"));
  }

  return <form className="chat-composer-wrap" onSubmit={submit}>
    <div className="chat-composer">
      <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setAttachment(event.target.files?.[0]?.name ?? ""); setStatus(""); }} />
      <button type="button" aria-label={t("messages.attach")} onClick={() => inputRef.current?.click()}><Paperclip size={20} /></button>
      <textarea rows={1} aria-label={t("messages.message")} placeholder={t("messages.placeholder")} value={message} onChange={(event) => { setMessage(event.target.value); setStatus(""); }} />
      <button className="send-button" type="submit" aria-label={t("messages.send")}><Send size={19} /></button>
    </div>
    {attachment ? <small className="composer-attachment">{t("messages.attachment", { name: attachment })}</small> : null}
    {status ? <small className="composer-status" role="status">{status}</small> : null}
  </form>;
}
