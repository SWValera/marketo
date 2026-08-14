import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { notificationRepository } from "@/lib/data/repositories";

export const metadata: Metadata = { title: "Уведомления", robots: { index: false, follow: false } };

export default async function NotificationsPage() {
  const notifications = await notificationRepository.list();
  return <DashboardShell title="Уведомления" description="Сообщения, активность объявлений и результаты модерации." active="/notifications"><div className="notification-toolbar"><div className="segmented-control"><button className="is-active" type="button">Все</button><button type="button">Непрочитанные</button></div></div><EmptyState icon={<Bell size={30} />} title="Уведомлений пока нет" description={`Сейчас событий: ${notifications.total}. Новые сообщения и статусы публикаций появятся здесь.`} /></DashboardShell>;
}
