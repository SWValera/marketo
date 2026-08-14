import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { chats } from "@/lib/chat-data";

export const metadata: Metadata = { title: "Чаты", robots: { index: false, follow: false } };

export default function MessagesPage() {
  return <DashboardShell title="Чаты" description="Общайтесь с покупателями и продавцами внутри Marketo." active="/messages">
    <section className="chat-index-shell">
      <header><div><h2>Сообщения</h2><p>Все диалоги по вашим объявлениям и покупкам</p></div><label className="chat-search"><Search size={17} /><input aria-label="Поиск по чатам" placeholder="Найти диалог" /></label></header>
      <div className="chat-index-list">
        {chats.map((chat) => <Link href={`/messages/${chat.id}`} className="chat-row" key={chat.id}><span className={`chat-avatar ${chat.tone ?? ""}`}>{chat.initials}</span><span className="chat-row-copy"><strong>{chat.name}</strong><small>{chat.lastMessage}</small><em>{chat.listingTitle}</em></span><time>{chat.time}{chat.unread ? <b>{chat.unread}</b> : null}</time></Link>)}
      </div>
    </section>
  </DashboardShell>;
}
