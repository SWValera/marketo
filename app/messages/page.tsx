import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Чаты", robots: { index: false, follow: false } };

export default function MessagesPage() {
  return <DashboardShell title="Чаты" description="Переписка с продавцами и покупателями." active="/messages"><div className="messages-shell"><aside><button type="button" className="is-active"><span className="chat-avatar">Д</span><span><strong>Данияр</strong><small>Toyota Camry 2020</small></span><time>10:42</time></button><button type="button"><span className="chat-avatar">М</span><span><strong>Марина</strong><small>2-комнатная квартира</small></span><time>Вчера</time></button></aside><section><header><span className="chat-avatar">Д</span><div><strong>Данияр</strong><small>был недавно</small></div></header><div className="chat-thread"><p className="incoming">Здравствуйте! Машина ещё продаётся?</p><p className="outgoing">Да, объявление актуально.</p><p className="incoming">Можно посмотреть сегодня вечером?</p></div><form><input aria-label="Сообщение" placeholder="Напишите сообщение…" /><button type="button">Отправить</button></form></section></div></DashboardShell>;
}
