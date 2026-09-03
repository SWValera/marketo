/* eslint-disable @next/next/no-img-element -- Authenticated peer avatars use the reviewed media URL helper. */
import type { Metadata } from "next";
import { AlertTriangle, ChevronLeft, ChevronRight, LogIn, MessageCircle, UserRound } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { getCurrentAuthContext } from "@/lib/auth/context";
import { normalizePositivePage } from "@/lib/data/pagination";
import { chatRepository } from "@/lib/data/repositories";
import { localeTag } from "@/lib/i18n/config";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Чаты", robots: { index: false, follow: false } };

const PAGE_SIZE = 20;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const [{ t, locale }, authContext, params] = await Promise.all([
    getServerI18n(),
    getCurrentAuthContext(),
    searchParams,
  ]);
  const page = normalizePositivePage(params.page);
  if (authContext.status === "anonymous") {
    return <DashboardShell title={t("messages.title")} description={t("messages.description")} active="/messages" authContext={authContext}>
      <EmptyState icon={<LogIn size={30} />} title={t("messages.signInTitle")} description={t("messages.signInNote")} actionHref="/login?next=/messages" actionLabel={t("messages.signIn")} />
    </DashboardShell>;
  }
  if (authContext.status === "error") {
    return <DashboardShell title={t("messages.title")} description={t("messages.description")} active="/messages" authContext={authContext}>
      <EmptyState icon={<AlertTriangle size={30} />} title={t("messages.loadErrorTitle")} description={t("messages.loadErrorNote")} actionHref="/messages" actionLabel={t("common.retry")} />
    </DashboardShell>;
  }

  let chats: Awaited<ReturnType<typeof chatRepository.list>> | null = null;
  try {
    chats = await chatRepository.list({ page, pageSize: PAGE_SIZE, locale });
  } catch {
    // Data failure is intentionally rendered separately from an empty inbox.
  }
  const chatDate = new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "short", timeStyle: "short" });
  return <DashboardShell title={t("messages.title")} description={t("messages.description")} active="/messages" authContext={authContext}>
    <section className="chat-index-shell"><header><div><h2>{t("messages.heading")}</h2><p>{chats ? `${chats.total} ${t("messages.dialogs")}` : t("messages.loadErrorNote")}</p></div></header>
      {!chats ? <EmptyState icon={<AlertTriangle size={30} />} title={t("messages.loadErrorTitle")} description={t("messages.loadErrorNote")} actionHref={page === 1 ? "/messages" : `/messages?page=${page}`} actionLabel={t("common.retry")} />
        : chats.total === 0 ? <EmptyState icon={<MessageCircle size={30} />} title={t("messages.empty")} description={t("messages.emptyNote")} actionHref="/search" actionLabel={t("messages.findListing")} />
          : chats.items.length === 0 ? <EmptyState icon={<MessageCircle size={30} />} title={t("messages.pageOutOfRangeTitle")} description={t("messages.pageOutOfRangeNote")} actionHref="/messages" actionLabel={t("messages.firstPage")} />
            : <>
              <div className="chat-index-list">{chats.items.map((chat) => <Link className="chat-row" href={`/messages/${chat.id}`} key={chat.id}>
                <span className="chat-avatar">{chat.peerAvatarUrl
                  ? <img src={chat.peerAvatarUrl} alt="" width={44} height={44} loading="lazy" decoding="async" />
                  : <UserRound size={21} />}</span>
                <span className="chat-row-copy"><strong>{chat.peerName}</strong><small>{chat.lastMessage ?? chat.listingTitle ?? t("messages.safeChat")}</small></span>
                <time dateTime={chat.lastMessageAt ?? undefined}>{chat.lastMessageAt ? chatDate.format(new Date(chat.lastMessageAt)) : null}{chat.unreadCount !== null && chat.unreadCount > 0 ? <b aria-label={t("messages.unreadCount", { count: chat.unreadCount })}>{chat.unreadCount}</b> : null}</time>
              </Link>)}</div>
              {page > 1 || chats.nextCursor ? <nav className="owner-listing-pagination" aria-label={t("messages.title")}>
                {page > 1 ? <Link href={page === 2 ? "/messages" : `/messages?page=${page - 1}`}><ChevronLeft size={17} />{t("profile.previousPage")}</Link> : <span />}
                {chats.nextCursor ? <Link href={`/messages?page=${chats.nextCursor}`}>{t("profile.nextPage")}<ChevronRight size={17} /></Link> : null}
              </nav> : null}
            </>}
    </section>
  </DashboardShell>;
}
