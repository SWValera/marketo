import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { QueryTabs } from "@/components/query-tabs";
import { notificationRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Уведомления", robots: { index: false, follow: false } };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string | string[] }> }) {
  const requested = (await searchParams).filter;
  const initialFilter = Array.isArray(requested) ? requested[0] : requested;
  const notifications = await notificationRepository.list();
  const { t } = await getServerI18n();
  return <DashboardShell title={t("notifications.title")} description={t("notifications.description")} active="/notifications"><div className="notification-toolbar"><QueryTabs className="segmented-control" defaultValue="all" initialValue={initialFilter} param="filter" items={[{ value: "all", label: t("common.all") }, { value: "unread", label: t("notifications.unread") }]} /></div><EmptyState icon={<Bell size={30} />} title={t("notifications.empty")} description={t("notifications.emptyNote", { count: notifications.total })} /></DashboardShell>;
}
