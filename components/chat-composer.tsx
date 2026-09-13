"use client";
import { Check, Pencil, Send, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { editTextMessage, sendTextMessage, type MessageRow } from "@/lib/data/supabase/chat";
import type { ChatMessage } from "@/lib/chat/messages";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ChatComposer({ conversationId, currentUserId, disabled = false, onSent, editing, onEdited, onCancelEdit, onBusyChange }: {
  conversationId: string; currentUserId: string; disabled?: boolean; onSent: (message: MessageRow) => void;
  editing?: ChatMessage | null; onEdited?: (message: MessageRow) => void; onCancelEdit?: () => void; onBusyChange?: (busy:boolean) => void;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [editDraft, setEditDraft] = useState<{ id:string; body:string } | null>(null);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const flight = useRef(false);
  const attempt = useRef<{ id: string; body: string } | null>(null);
  const bodyValue = editing ? (editDraft?.id === editing.id ? editDraft.body : editing.body) : message;
  useLayoutEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(144, Math.max(48, node.scrollHeight))}px`;
    node.style.overflowY = node.scrollHeight > 144 ? "auto" : "hidden";
  }, [bodyValue]);
  useLayoutEffect(() => { if (editing) textarea.current?.focus({ preventScroll:true }); }, [editing]);
  const finishEdit = () => { setEditDraft(null); setStatus(""); onCancelEdit?.(); };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flight.current || disabled) return;
    const body = bodyValue.trim();
    if (!body) { setStatus(t("messages.enterMessage")); return; }
    if (Array.from(body).length > 4000) { setStatus(t("messages.messageTooLong")); return; }
    flight.current = true; setSending(true); onBusyChange?.(true); setStatus("");
    try {
      if (editing) {
        const row = await editTextMessage(getSupabaseBrowserClient(), conversationId, editing.id, body, editing.editedAt);
        onEdited?.(row); finishEdit();
      } else {
        if (!attempt.current || attempt.current.body !== body) attempt.current = { id: crypto.randomUUID(), body };
        const row = await sendTextMessage(getSupabaseBrowserClient(), conversationId, currentUserId, body, attempt.current.id);
        onSent(row); setMessage(""); attempt.current = null; setStatus(t("messages.sent"));
      }
    } catch { setStatus(t(editing ? "messages.editFailed" : "messages.sendFailed")); }
    finally { flight.current = false; setSending(false); onBusyChange?.(false); }
  }
  return <form className="chat-composer-wrap" onSubmit={event => void submit(event)}>
    {editing ? <div className="chat-edit-banner"><Pencil size={18} aria-hidden="true" /><span>{t("messages.editing")}</span>
      <button type="button" disabled={sending} aria-label={t("messages.cancelEdit")} onClick={finishEdit}><X size={20} /></button></div> : null}
    <div className="chat-composer">
      <textarea ref={textarea} rows={1} maxLength={8000} readOnly={sending} disabled={disabled} aria-label={t("messages.message")}
        placeholder={t("messages.placeholder")} value={bodyValue}
        onChange={event => { if (editing) setEditDraft({id:editing.id,body:event.target.value}); else setMessage(event.target.value); setStatus(""); }}
        onKeyDown={event => {
          if (event.key === "Escape" && editing && !sending) { event.preventDefault(); finishEdit(); }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} />
      <button className="send-button" type="submit" aria-label={t(editing ? "messages.saveEdit" : "messages.send")} disabled={sending || disabled || !bodyValue.trim()}>
        {editing ? <Check size={22} aria-hidden="true" /> : <Send size={22} aria-hidden="true" />}
      </button>
    </div>
    {status ? <p className="composer-status" role="status">{status}</p> : null}
    {disabled ? <p className="composer-status">{t("messages.closed")}</p> : null}
  </form>;
}
