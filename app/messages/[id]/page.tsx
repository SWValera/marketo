import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCheck, Paperclip, Send, UserRound } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { chatRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Диалог", robots: { index: false, follow: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await chatRepository.findById(id);
  if (!conversation) notFound();
  const { t } = await getServerI18n();
  return <><Header /><main className="page-shell subpage-main conversation-page"><PageHeader fallback="/messages" eyebrow={t("messages.eyebrow")} title={conversation.peerName} description={conversation.listingTitle ? t("messages.aboutListing", { title: conversation.listingTitle }) : t("messages.safeChat")} /><section className="conversation conversation-standalone"><header className="conversation-header"><span className="chat-avatar">{conversation.peerAvatarUrl ? "" : <UserRound size={21} />}</span><div><strong>{conversation.peerName}</strong><small>{t("messages.marketoChat")}</small></div></header><div className="chat-thread">{conversation.messages.map((message) => <div className={`message-bubble ${message.own ? "outgoing" : "incoming"}`} key={message.id}><p>{message.body}</p><time>{message.sentAt}{message.own && message.read ? <CheckCheck size={14} /> : null}</time></div>)}</div><form className="chat-composer"><button type="button" aria-label={t("messages.attach")}><Paperclip size={20} /></button><textarea rows={1} aria-label={t("messages.message")} placeholder={t("messages.placeholder")} /><button className="send-button" type="button" aria-label={t("messages.send")}><Send size={19} /></button></form></section></main><MobileNav /></>;
}
