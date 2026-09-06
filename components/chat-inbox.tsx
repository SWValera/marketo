"use client";
/* eslint-disable @next/next/no-img-element -- Reviewed, private peer avatar URLs. */
import { useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle, UserRound } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { EmptyState } from "@/components/empty-state";
import { useI18n } from "@/components/i18n-provider";
import { useChatPolling } from "@/components/use-chat-polling";
import { listUserConversations } from "@/lib/data/supabase/chat";
import type { ChatSummary, PageResult } from "@/lib/data/types";
import { localeTag } from "@/lib/i18n/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ChatInbox({ initial, currentUserId, page }: { initial: PageResult<ChatSummary>; currentUserId: string; page: number }) {
  const { t, locale } = useI18n();
  const [chats, setChats] = useState(initial);
  const [error, setError] = useState(false);
  useChatPolling(currentUserId, async signal => {
    try {
      const next = await listUserConversations(getSupabaseBrowserClient(), currentUserId, { page, pageSize:20, locale, signal });
      if (!signal.aborted) { setChats(next); setError(false); }
    } catch (cause) { if (!signal.aborted) setError(true); throw cause; }
  }, 10000);
  const date = new Intl.DateTimeFormat(localeTag(locale), { dateStyle:"short", timeStyle:"short" });
  return <section className="chat-index-shell"><header><div><h2>{t("messages.heading")}</h2><p>{chats.total} {t("messages.dialogs")}</p></div></header>
    {error ? <p className="chat-connection-status" role="status">{t("messages.connectionLost")}</p> : null}
    {chats.total === 0 ? <EmptyState icon={<MessageCircle size={30} />} title={t("messages.empty")} description={t("messages.emptyNote")} actionHref="/search" actionLabel={t("messages.findListing")} />
      : chats.items.length === 0 ? <EmptyState icon={<MessageCircle size={30} />} title={t("messages.pageOutOfRangeTitle")} description={t("messages.pageOutOfRangeNote")} actionHref="/messages" actionLabel={t("messages.firstPage")} />
      : <div className="chat-index-list">{chats.items.map(chat => <Link className="chat-row" href={"/messages/" + chat.id} key={chat.id}>
        <span className="chat-avatar">{chat.peerAvatarUrl ? <img src={chat.peerAvatarUrl} alt="" width={44} height={44} loading="lazy" decoding="async" /> : <UserRound size={21} />}</span>
        <span className="chat-row-copy"><strong>{chat.peerName}</strong>{chat.listingTitle ? <small>{chat.listingTitle}</small> : null}<small>{chat.lastMessage ?? t("messages.noMessagesYet")}</small></span>
        <time dateTime={chat.lastMessageAt ?? undefined}>{chat.lastMessageAt ? date.format(new Date(chat.lastMessageAt)) : null}
          {chat.unreadCount !== null && chat.unreadCount > 0 ? <b aria-label={t("messages.unreadCount",{count:chat.unreadCount})}>{chat.unreadCount}</b> : null}</time>
      </Link>)}</div>}
    {page > 1 || chats.nextCursor ? <nav className="owner-listing-pagination" aria-label={t("messages.title")}>
      {page > 1 ? <Link href={page === 2 ? "/messages" : "/messages?page=" + (page-1)}><ChevronLeft size={17} />{t("profile.previousPage")}</Link> : <span />}
      {chats.nextCursor ? <Link href={"/messages?page=" + chats.nextCursor}>{t("profile.nextPage")}<ChevronRight size={17} /></Link> : null}
    </nav> : null}
  </section>;
}
