import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCheck, MoreHorizontal, Paperclip, Send } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getChat } from "@/lib/chat-data";

export const metadata: Metadata = { title: "Диалог", robots: { index: false, follow: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = getChat(id);
  if (!chat) notFound();
  return <><Header /><main className="page-shell subpage-main conversation-page">
    <PageHeader fallback="/messages" eyebrow="Сообщения" title={`Чат с ${chat.name}`} description="Отвечайте внутри Marketo и не передавайте коды подтверждения." />
    <section className="conversation conversation-standalone">
      <header className="conversation-header"><span className={`chat-avatar ${chat.tone ?? ""}`}>{chat.initials}</span><div><strong>{chat.name}</strong><small><i /> был недавно</small></div><button type="button" aria-label="Действия чата"><MoreHorizontal size={21} /></button></header>
      <Link className="conversation-listing" href={chat.listingHref}><span>📦</span><div><strong>{chat.listingTitle}</strong><small>{chat.listingPrice} · {chat.listingLocation}</small></div></Link>
      <div className="chat-thread"><time className="thread-date">Сегодня</time><div className="message-bubble incoming"><p>Здравствуйте! Объявление ещё актуально?</p><time>10:38</time></div><div className="message-bubble outgoing"><p>Да, актуально. Можно договориться о просмотре.</p><time>10:40 <CheckCheck size={14} /></time></div><div className="message-bubble incoming"><p>{chat.lastMessage}</p><time>{chat.time}</time></div></div>
      <form className="chat-composer"><button type="button" aria-label="Прикрепить файл"><Paperclip size={20} /></button><textarea rows={1} aria-label="Сообщение" placeholder="Напишите сообщение…" /><button className="send-button" type="button" aria-label="Отправить"><Send size={19} /></button></form>
    </section>
  </main><MobileNav /></>;
}
