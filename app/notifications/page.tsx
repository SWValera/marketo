import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { notificationRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Уведомления", robots: { index: false, follow: false } };

export default async function NotificationsPage() {
  const notifications = await notificationRepository.list();
  const { t } = await getServerI18n();
  return <DashboardShell title={t("notifications.title")} description={t("notifications.description")} active="/notifications"><div className="notification-toolbar"><div className="segmented-control"><button className="is-active" type="button">{t("common.all")}</button><button type="button">{t("notifications.unread")}</button></div></div><EmptyState icon={<Bell size={30} />} title={t("notifications.empty")} description={t("notifications.emptyNote", { count: notifications.total })} /></DashboardShell>;
}
