/* eslint-disable @next/next/no-img-element -- Authenticated peer avatars use the reviewed media URL helper. */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CheckCheck, UserRound } from "lucide-react";
import { ChatComposer } from "@/components/chat-composer";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getCurrentAuthContext } from "@/lib/auth/context";
import { chatRepository } from "@/lib/data/repositories";
import { localeTag } from "@/lib/i18n/config";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Диалог", robots: { index: false, follow: false } };

type ConversationPageProps = { params: Promise<{ id: string }> };

export default function ConversationPage(props: ConversationPageProps) {
  return <ConversationPageContent {...props} />;
}

async function ConversationPageContent({ params }: ConversationPageProps) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const [{ t, locale }, authContext] = await Promise.all([getServerI18n(), getCurrentAuthContext()]);
  if (authContext.status === "anonymous") redirect(`/login?next=${encodeURIComponent(`/messages/${id}`)}`);
  if (authContext.status === "error") {
    return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main conversation-page"><PageHeader fallback="/messages" eyebrow={t("messages.eyebrow")} title={t("messages.loadErrorTitle")} description={t("messages.loadErrorNote")} /><EmptyState icon={<AlertTriangle size={30} />} title={t("messages.loadErrorTitle")} description={t("messages.loadErrorNote")} actionHref={`/messages/${id}`} actionLabel={t("common.retry")} /></main><MobileNav /></>;
  }
  let conversation: Awaited<ReturnType<typeof chatRepository.findById>> | null = null;
  try {
    conversation = await chatRepository.findById(id, locale);
  } catch {
    return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main conversation-page"><PageHeader fallback="/messages" eyebrow={t("messages.eyebrow")} title={t("messages.loadErrorTitle")} description={t("messages.loadErrorNote")} /><EmptyState icon={<AlertTriangle size={30} />} title={t("messages.loadErrorTitle")} description={t("messages.loadErrorNote")} actionHref={`/messages/${id}`} actionLabel={t("common.retry")} /></main><MobileNav /></>;
  }
  if (!conversation) notFound();
  const messageDate = new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "short", timeStyle: "short" });
  return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main conversation-page"><PageHeader fallback="/messages" eyebrow={t("messages.eyebrow")} title={conversation.peerName} description={conversation.listingTitle ? t("messages.aboutListing", { title: conversation.listingTitle }) : t("messages.safeChat")} /><section className="conversation conversation-standalone"><header className="conversation-header"><span className="chat-avatar">{conversation.peerAvatarUrl
    ? <img src={conversation.peerAvatarUrl} alt="" width={44} height={44} decoding="async" />
    : <UserRound size={21} />}</span><div><strong>{conversation.peerName}</strong><small>{t("messages.marketoChat")}</small></div></header><div className="chat-thread">{conversation.messages.length ? conversation.messages.map((message) => <div className={`message-bubble ${message.own ? "outgoing" : "incoming"}`} key={message.id}><p>{message.body}</p><time dateTime={message.sentAt}>{messageDate.format(new Date(message.sentAt))}{message.own && message.read ? <CheckCheck size={14} /> : null}</time></div>) : <p className="inline-feedback">{t("messages.noMessagesYet")}</p>}</div><ChatComposer conversationId={conversation.id} currentUserId={authContext.user.id} /></section></main><MobileNav /></>;
}
