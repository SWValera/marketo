"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { markConversationRead, sendTextMessage } from "@/lib/data/supabase/chat";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ChatComposer({ conversationId, currentUserId }: { conversationId: string; currentUserId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void markConversationRead(getSupabaseBrowserClient(), conversationId, currentUserId).catch(() => {
      // A failed read marker must not hide an otherwise readable conversation.
    });
  }, [conversationId, currentUserId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage) {
      setStatus(t("messages.enterMessage"));
      return;
    }
    if (Array.from(cleanMessage).length > 4000) {
      setStatus(t("messages.messageTooLong"));
      return;
    }
    setSending(true);
    setStatus("");
    try {
      await sendTextMessage(getSupabaseBrowserClient(), conversationId, currentUserId, cleanMessage);
      setMessage("");
      setStatus(t("messages.sent"));
      router.refresh();
    } catch {
      setStatus(t("messages.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return <form className="chat-composer-wrap" onSubmit={(event) => void submit(event)}>
    <div className="chat-composer">
      <textarea rows={1} maxLength={4000} aria-label={t("messages.message")} placeholder={t("messages.placeholder")} value={message} onChange={(event) => { setMessage(event.target.value); setStatus(""); }} />
      <button className="send-button" type="submit" aria-label={t("messages.send")} disabled={sending}><Send size={19} /></button>
    </div>
    {status ? <small className="composer-status" role="status">{status}</small> : null}
  </form>;
}
