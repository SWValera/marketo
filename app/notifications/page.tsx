import type { Metadata } from "next";
import { Bell, Heart, MessageCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Уведомления", robots: { index: false, follow: false } };

export default function NotificationsPage() {
  return <DashboardShell title="Уведомления" description="Новые сообщения, избранное и результаты модерации." active="/notifications"><div className="notification-list"><article><span><MessageCircle size={20} /></span><div><strong>Новое сообщение от Данияра</strong><p>«Можно посмотреть сегодня вечером?»</p></div><time>5 минут назад</time></article><article><span><Heart size={20} /></span><div><strong>Ваше объявление добавили в избранное</strong><p>Toyota Camry 2020</p></div><time>Сегодня</time></article><article><span><Bell size={20} /></span><div><strong>Объявление прошло модерацию</strong><p>Теперь оно отображается в каталоге.</p></div><time>Вчера</time></article></div></DashboardShell>;
}
