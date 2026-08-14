import type { Metadata } from "next";
import Link from "next/link";
import { CheckCheck, MoreHorizontal, Paperclip, Search, Send } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Чаты", robots: { index: false, follow: false } };

export default function MessagesPage() {
  return <DashboardShell title="Чаты" description="Общайтесь с покупателями и продавцами внутри Marketo." active="/messages">
    <div className="messages-shell">
      <aside className="chat-list">
        <div className="chat-search"><Search size={17} /><input aria-label="Поиск по чатам" placeholder="Поиск по чатам" /></div>
        <button type="button" className="chat-row is-active"><span className="chat-avatar">Д</span><span className="chat-row-copy"><strong>Данияр</strong><small>Можно посмотреть сегодня вечером?</small><em>Toyota Camry 2020</em></span><time>10:42<b>2</b></time></button>
        <button type="button" className="chat-row"><span className="chat-avatar tone-purple">М</span><span className="chat-row-copy"><strong>Марина</strong><small>Спасибо, я подумаю</small><em>2-комнатная квартира</em></span><time>Вчера</time></button>
        <button type="button" className="chat-row"><span className="chat-avatar tone-blue">Р</span><span className="chat-row-copy"><strong>Руслан</strong><small>Фото получил, благодарю</small><em>iPhone 13 128GB</em></span><time>12 авг.</time></button>
      </aside>
      <section className="conversation">
        <header className="conversation-header"><span className="chat-avatar">Д</span><div><strong>Данияр</strong><small><i /> был недавно</small></div><button type="button" aria-label="Действия чата"><MoreHorizontal size={21} /></button></header>
        <Link className="conversation-listing" href="/listing/mk-10345-toyota-camry-2020"><span>🚙</span><div><strong>Toyota Camry 2020</strong><small>8 500 000 ₸ · Алматы</small></div></Link>
        <div className="chat-thread"><time className="thread-date">Сегодня</time><div className="message-bubble incoming"><p>Здравствуйте! Машина ещё продаётся?</p><time>10:38</time></div><div className="message-bubble outgoing"><p>Да, объявление актуально. Машина в Алматы.</p><time>10:40 <CheckCheck size={14} /></time></div><div className="message-bubble incoming"><p>Можно посмотреть сегодня вечером?</p><time>10:42</time></div></div>
        <form className="chat-composer"><button type="button" aria-label="Прикрепить файл"><Paperclip size={20} /></button><textarea rows={1} aria-label="Сообщение" placeholder="Напишите сообщение…" /><button className="send-button" type="button" aria-label="Отправить"><Send size={19} /></button></form>
      </section>
    </div>
  </DashboardShell>;
}
