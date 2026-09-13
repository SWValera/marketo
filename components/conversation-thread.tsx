"use client";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessageRow } from "@/components/chat-message";
import { ChatComposer } from "@/components/chat-composer";
import { useChatPolling } from "@/components/use-chat-polling";
import { useI18n } from "@/components/i18n-provider";
import { mergeMessages, type ChatMessage } from "@/lib/chat/messages";
import { deleteTextMessage, syncMessageChanges, markConversationRead, readMessagePage, type MessageCursor, type MessageRow } from "@/lib/data/supabase/chat";
import type { Conversation } from "@/lib/data/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ConversationThread({ conversation, currentUserId }: { conversation: Conversation; currentUserId: string }) {
  const { t } = useI18n();
  const [messages, setMessages] = useState(conversation.messages);
  const [hasOlder, setHasOlder] = useState(Boolean(conversation.hasOlderMessages));
  const [olderBusy, setOlderBusy] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const seen = atBottom ? messages.findLast(message => !message.deletedAt)?.id : undefined;
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [action, setAction] = useState<{id:string;kind:"menu"|"swipe"} | null>(null);
  const [composing, setComposing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState(false);
  const deleteFlight = useRef(false);
  const loaded = useRef(messages);
  const syncOffset = useRef(0);
  useEffect(() => { loaded.current = messages; }, [messages]);
  const viewport = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(true);
  const initialCursor = conversation.messages.at(-1);
  const cursor = useRef<MessageCursor | undefined>(initialCursor && { id: initialCursor.id, sentAt: initialCursor.sentAt });
  const oldest = useRef(conversation.messages[0]);
  const olderFlight = useRef(false);
  const readFlight = useRef(false);
  const acknowledged = useRef<string | null>(null);
  const map = useCallback((row: MessageRow): ChatMessage => ({ id:row.id, body:row.deleted_at ? "" : row.body, sentAt:row.created_at,
    editedAt:row.edited_at, deletedAt:row.deleted_at, own:row.sender_id === currentUserId, read:false }), [currentUserId]);
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    const channel = client.channel(`conversation:${conversation.id}`)
      .on("postgres_changes", {event:"INSERT",schema:"public",table:"messages",filter:`conversation_id=eq.${conversation.id}`}, event => {
        const row = event.new as MessageRow;
        if (row.id && row.created_at && typeof row.body === "string") setMessages(current => mergeMessages(current, [map(row)]));
      })
      .on("postgres_changes", {event:"UPDATE",schema:"public",table:"messages",filter:`conversation_id=eq.${conversation.id}`}, event => {
        const row = event.new as MessageRow;
        if (row.id && row.created_at && typeof row.body === "string") setMessages(current =>
          current.some(message => message.id === row.id) ? mergeMessages(current, [map(row)]) : current);
      })
      .subscribe(status => { if (status === "SUBSCRIBED") syncOffset.current = 0; });
    return () => { void client.removeChannel(channel); };
  }, [conversation.id, map]);

  const acknowledge = useCallback(async (id: string | undefined) => {
    if (!id || readFlight.current || acknowledged.current === id || document.visibilityState !== "visible") return;
    readFlight.current = true;
    try { await markConversationRead(getSupabaseBrowserClient(), conversation.id, id); acknowledged.current = id; }
    catch { /* Retry next visible refresh; never hide readable messages. */ }
    finally { readFlight.current = false; }
  }, [conversation.id]);
  useEffect(() => {
    const element = viewport.current;
    if (element && shouldScroll.current && !action) element.scrollTop = element.scrollHeight;

  }, [messages, atBottom, action]);
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
      // Round-robin bounded reconciliation also works when WebSockets are unavailable.
      const candidates = loaded.current.filter(message => !message.deletedAt);
      const offset = syncOffset.current < candidates.length ? syncOffset.current : 0;
      const changed = await syncMessageChanges(client, conversation.id, candidates.slice(offset, offset + 100), signal);
      if (signal.aborted) return;
      syncOffset.current = offset + 100;
      if (changed.length) setMessages(current => mergeMessages(current, changed.map(map)));
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
  async function remove(message: ChatMessage) {
    if (deleteFlight.current) return;
    deleteFlight.current = true; setDeleting(message.id); setMutationError(false);
    try {
      const row = await deleteTextMessage(getSupabaseBrowserClient(), conversation.id, message.id);
      setMessages(current => mergeMessages(current, [map(row)]));
      setAction(null); if (editing?.id === message.id) setEditing(null);
    } catch { setMutationError(true); }
    finally { deleteFlight.current = false; setDeleting(null); }
  }
  const activeEdit = editing && !messages.find(message => message.id === editing.id)?.deletedAt ? editing : null;
  return <div className="conversation-body">
    {connectionError ? <p className="chat-connection-status" role="status">{t("messages.connectionLost")}</p> : null}
    {mutationError ? <p className="chat-connection-status" role="alert">{t("messages.deleteFailed")}</p> : null}
    <div className="chat-thread chat-live-thread" ref={viewport} aria-label={t("messages.heading")}
      onScroll={() => { const node=viewport.current; if (!node) return; const bottom=node.scrollHeight-node.scrollTop-node.clientHeight < 60; shouldScroll.current=bottom; setAtBottom(bottom); }}>
      {hasOlder ? <button type="button" className="secondary-button chat-history-button" disabled={olderBusy} onClick={() => void loadOlder()}>{olderBusy ? t("common.loading") : t("messages.loadOlder")}</button> : null}
      {historyError ? <p role="status">{t("messages.historyFailed")}</p> : null}
      <div className="chat-message-log" role="log" aria-live="polite" aria-relevant="additions" aria-label={t("messages.heading")}>
        {messages.length ? messages.map(message => <ChatMessageRow key={message.id} message={message} action={action} setAction={setAction}
          busy={deleting !== null || composing} onEdit={() => { setEditing(message); setAction(null); }} onDelete={() => void remove(message)} />) : <p className="inline-feedback">{t("messages.noMessagesYet")}</p>}
      </div>
    </div>
    {!atBottom ? <button className="chat-jump-button" type="button" onClick={() => { shouldScroll.current=true; setAtBottom(true); viewport.current?.scrollTo({ top:viewport.current.scrollHeight }); }}><ChevronDown size={18} />{t("messages.toLatest")}</button> : null}
    <ChatComposer conversationId={conversation.id} currentUserId={currentUserId} disabled={conversation.canSend === false && !activeEdit} onSent={onSent}
      editing={activeEdit} onBusyChange={setComposing} onCancelEdit={() => setEditing(null)} onEdited={row => setMessages(current => mergeMessages(current, [map(row)]))} />
  </div>;
}
