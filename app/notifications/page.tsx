import type { Metadata } from "next";
import { Bell, Heart, MessageCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Уведомления", robots: { index: false, follow: false } };

export default function NotificationsPage() {
  return <DashboardShell title="Уведомления" description="Сообщения, активность объявлений и результаты модерации." active="/notifications">
    <div className="notification-toolbar"><div className="segmented-control"><button className="is-active" type="button">Все</button><button type="button">Непрочитанные</button></div><button className="text-button" type="button">Отметить все прочитанными</button></div>
    <div className="dashboard-card notification-list"><article className="is-unread"><span><MessageCircle size={20} /></span><div><strong>Новое сообщение от Данияра</strong><p>«Можно посмотреть сегодня вечером?»</p></div><time>5 минут назад</time></article><article className="is-unread"><span><Heart size={20} /></span><div><strong>Ваше объявление добавили в избранное</strong><p>Toyota Camry 2020 сохранили 3 новых пользователя</p></div><time>Сегодня</time></article><article><span><Bell size={20} /></span><div><strong>Объявление прошло модерацию</strong><p>Теперь оно отображается в каталоге Marketo.</p></div><time>Вчера</time></article></div>
  </DashboardShell>;
}
