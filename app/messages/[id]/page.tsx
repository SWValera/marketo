import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCheck, Paperclip, Send, UserRound } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { chatRepository } from "@/lib/data/repositories";

export const metadata: Metadata = { title: "Диалог", robots: { index: false, follow: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await chatRepository.findById(id);
  if (!conversation) notFound();
  return <><Header /><main className="page-shell subpage-main conversation-page"><PageHeader fallback="/messages" eyebrow="Сообщения" title={conversation.peerName} description={conversation.listingTitle ? `Диалог по объявлению «${conversation.listingTitle}»` : "Безопасный чат внутри Marketo"} /><section className="conversation conversation-standalone"><header className="conversation-header"><span className="chat-avatar">{conversation.peerAvatarUrl ? "" : <UserRound size={21} />}</span><div><strong>{conversation.peerName}</strong><small>Диалог Marketo</small></div></header><div className="chat-thread">{conversation.messages.map((message) => <div className={`message-bubble ${message.own ? "outgoing" : "incoming"}`} key={message.id}><p>{message.body}</p><time>{message.sentAt}{message.own && message.read ? <CheckCheck size={14} /> : null}</time></div>)}</div><form className="chat-composer"><button type="button" aria-label="Прикрепить файл"><Paperclip size={20} /></button><textarea rows={1} aria-label="Сообщение" placeholder="Напишите сообщение…" /><button className="send-button" type="button" aria-label="Отправить"><Send size={19} /></button></form></section></main><MobileNav /></>;
}
