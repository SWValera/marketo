"use client";
import { CheckCheck, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/components/chat-composer";
import { useChatPolling } from "@/components/use-chat-polling";
import { useI18n } from "@/components/i18n-provider";
import { mergeMessages, type ChatMessage } from "@/lib/chat/messages";
import { markConversationRead, readMessagePage, type MessageCursor, type MessageRow } from "@/lib/data/supabase/chat";
import type { Conversation } from "@/lib/data/types";
import { localeTag } from "@/lib/i18n/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ConversationThread({ conversation, currentUserId }: { conversation: Conversation; currentUserId: string }) {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState(conversation.messages);
  const [hasOlder, setHasOlder] = useState(Boolean(conversation.hasOlderMessages));
  const [olderBusy, setOlderBusy] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [seen, setSeen] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(true);
  const initialCursor = conversation.messages.at(-1);
  const cursor = useRef<MessageCursor | undefined>(initialCursor && { id: initialCursor.id, sentAt: initialCursor.sentAt });
  const oldest = useRef(conversation.messages[0]);
  const olderFlight = useRef(false);
  const readFlight = useRef(false);
  const acknowledged = useRef<string | null>(null);
  const map = (row: MessageRow): ChatMessage => ({ id:row.id, body:row.body, sentAt:row.created_at, own:row.sender_id === currentUserId, read:false });
  const date = new Intl.DateTimeFormat(localeTag(locale), { dateStyle:"short", timeStyle:"short" });

  const acknowledge = useCallback(async (id: string | undefined) => {
    if (!id || readFlight.current || acknowledged.current === id || document.visibilityState !== "visible") return;
    readFlight.current = true;
    try { await markConversationRead(getSupabaseBrowserClient(), conversation.id, id); acknowledged.current = id; }
    catch { /* Retry next visible refresh; never hide readable messages. */ }
    finally { readFlight.current = false; }
  }, [conversation.id]);
  useEffect(() => {
    const element = viewport.current;
    if (element && shouldScroll.current) element.scrollTop = element.scrollHeight;
    const last = cursor.current;
    if (atBottom && last) setSeen(last.id);
  }, [messages, atBottom]);
  useEffect(() => { if (seen) void acknowledge(seen); }, [seen, acknowledge]); // Acknowledge only after rendering visible messages.

  useChatPolling(currentUserId, async signal => {
    const client = getSupabaseBrowserClient();
    try {
      // Catch up in bounded keyset pages, including messages that arrived while offline.
      for (let batch = 0; batch < 3; batch++) {
        const page = await readMessagePage(client, conversation.id, { after:cursor.current, signal });
        if (signal.aborted) return;
        if (!cursor.current) setHasOlder(page.hasMore);
        if (page.rows.length) {
          if (!oldest.current) oldest.current = map(page.rows[0]);
          const latest = page.rows.at(-1)!;
          cursor.current = { id:latest.id, sentAt:latest.created_at };
          setMessages(current => mergeMessages(current, page.rows.map(map)));
        }
        if (!page.hasMore) break;
      }
      if (conversation.peerId) {
        const marker = await client.from("conversation_participants").select("last_read_at")
          .eq("conversation_id", conversation.id).eq("user_id", conversation.peerId).abortSignal(signal).maybeSingle();
        if (marker.error) throw marker.error;
        const readAt = marker.data?.last_read_at;
        if (readAt && !signal.aborted) setMessages(current => current.map(message =>
          message.own && !message.read && message.sentAt <= readAt ? { ...message, read:true } : message));
      }
      if (!signal.aborted) { setConnectionError(false); if (atBottom) void acknowledge(seen ?? undefined); }
    } catch (error) { if (!signal.aborted) setConnectionError(true); throw error; }
  }, 3000);

  async function loadOlder() {
    if (olderFlight.current || !hasOlder || !oldest.current) return;
    olderFlight.current = true; setOlderBusy(true); setHistoryError(false);
    const element = viewport.current;
    const height = element?.scrollHeight ?? 0, top = element?.scrollTop ?? 0;
    try {
      const page = await readMessagePage(getSupabaseBrowserClient(), conversation.id, { before:oldest.current, signal:AbortSignal.timeout(12000) });
      if (page.rows.length) oldest.current = map(page.rows[0]);
      shouldScroll.current = false;
      setMessages(current => mergeMessages(current, page.rows.map(map)));
      setHasOlder(page.hasMore);
      requestAnimationFrame(() => { if (element) element.scrollTop = top + element.scrollHeight - height; });
    } catch { setHistoryError(true); }
    finally { olderFlight.current = false; setOlderBusy(false); }
  }
  function onSent(row: MessageRow) {
    // Do NOT advance the receive cursor here: it could skip an incoming message.
    shouldScroll.current = true; setAtBottom(true);
    setMessages(current => mergeMessages(current, [map(row)]));
  }
  return <>
    {connectionError ? <p className="chat-connection-status" role="status">{t("messages.connectionLost")}</p> : null}
    <div className="chat-thread chat-live-thread" ref={viewport} aria-label={t("messages.heading")}
      onScroll={() => { const node=viewport.current; if (!node) return; const bottom=node.scrollHeight-node.scrollTop-node.clientHeight < 60; shouldScroll.current=bottom; setAtBottom(bottom); }}>
      {hasOlder ? <button type="button" className="secondary-button chat-history-button" disabled={olderBusy} onClick={() => void loadOlder()}>{olderBusy ? t("common.loading") : t("messages.loadOlder")}</button> : null}
      {historyError ? <p role="status">{t("messages.historyFailed")}</p> : null}
      <div className="chat-message-log" role="log" aria-live="polite" aria-relevant="additions" aria-label={t("messages.heading")}>
        {messages.length ? messages.map(message => <div className={"message-bubble " + (message.own ? "outgoing" : "incoming")} key={message.id}>
          <p>{message.body}</p><time dateTime={message.sentAt}>{date.format(new Date(message.sentAt))}
            {message.own && message.read ? <CheckCheck size={16} aria-label={t("messages.read")} /> : null}</time>
        </div>) : <p className="inline-feedback">{t("messages.noMessagesYet")}</p>}
      </div>
    </div>
    {!atBottom ? <button className="chat-jump-button" type="button" onClick={() => { shouldScroll.current=true; setAtBottom(true); viewport.current?.scrollTo({ top:viewport.current.scrollHeight }); }}><ChevronDown size={18} />{t("messages.toLatest")}</button> : null}
    <ChatComposer conversationId={conversation.id} currentUserId={currentUserId} disabled={conversation.canSend === false} onSent={onSent} />
  </>;
}
