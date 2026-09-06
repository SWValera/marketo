"use client";
import { Send } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { sendTextMessage, type MessageRow } from "@/lib/data/supabase/chat";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ChatComposer({ conversationId, currentUserId, disabled = false, onSent }: {
  conversationId: string; currentUserId: string; disabled?: boolean; onSent: (message: MessageRow) => void;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const flight = useRef(false);
  const attempt = useRef<{ id: string; body: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flight.current || disabled) return;
    const body = message.trim();
    if (!body) { setStatus(t("messages.enterMessage")); return; }
    if (Array.from(body).length > 4000) { setStatus(t("messages.messageTooLong")); return; }
    flight.current = true; setSending(true); setStatus("");
    if (!attempt.current || attempt.current.body !== body) attempt.current = { id: crypto.randomUUID(), body };
    try {
      const row = await sendTextMessage(getSupabaseBrowserClient(), conversationId, currentUserId, body, attempt.current.id);
      onSent(row); setMessage(""); attempt.current = null; setStatus(t("messages.sent"));
    } catch { setStatus(t("messages.sendFailed")); }
    finally { flight.current = false; setSending(false); }
  }
  return <form className="chat-composer-wrap" onSubmit={event => void submit(event)}>
    <div className="chat-composer">
      <textarea rows={2} maxLength={8000} disabled={sending || disabled} aria-label={t("messages.message")}
        placeholder={t("messages.placeholder")} value={message}
        onChange={event => { setMessage(event.target.value); setStatus(""); }}
        onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      <button className="send-button" type="submit" aria-label={t("messages.send")} disabled={sending || disabled || !message.trim()}><Send size={20} /></button>
    </div>
    {status ? <p className="composer-status" role="status">{status}</p> : null}
    {disabled ? <p className="composer-status">{t("messages.closed")}</p> : null}
  </form>;
}
