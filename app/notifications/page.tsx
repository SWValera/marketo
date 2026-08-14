import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Heart, MessageCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Уведомления", robots: { index: false, follow: false } };

export default function NotificationsPage() {
  return <DashboardShell title="Уведомления" description="Сообщения, активность объявлений и результаты модерации." active="/notifications">
    <div className="notification-toolbar"><div className="segmented-control"><button className="is-active" type="button">Все</button><button type="button">Непрочитанные</button></div><button className="text-button" type="button">Отметить все прочитанными</button></div>
    <div className="dashboard-card notification-list"><Link className="is-unread" href="/messages/nurlan"><span><MessageCircle size={20} /></span><div><strong>Новое сообщение от Нурлана</strong><p>«Можно посмотреть сегодня вечером?»</p></div><time>5 минут назад</time></Link><Link className="is-unread" href="/listing/mk-10345-toyota-camry-2020"><span><Heart size={20} /></span><div><strong>Ваше объявление добавили в избранное</strong><p>Toyota Camry 2020 сохранили 3 новых пользователя</p></div><time>Сегодня</time></Link><Link href="/listing/mk-10347-iphone-13-128gb"><span><Bell size={20} /></span><div><strong>Объявление прошло модерацию</strong><p>Теперь оно отображается в каталоге Marketo.</p></div><time>Вчера</time></Link></div>
  </DashboardShell>;
}
