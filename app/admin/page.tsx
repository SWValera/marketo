import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { moderationRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Модерация", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const queue = await moderationRepository.list();
  const { t } = await getServerI18n();
  return <DashboardShell title={t("admin.title")} description={t("admin.description")} active="/admin"><div className="admin-tabs"><button className="is-active" type="button">{t("admin.listings")} <b>{queue.total}</b></button><button type="button">{t("admin.reports")}</button><button type="button">{t("admin.users")}</button><button type="button">{t("admin.categories")}</button></div><EmptyState icon={<ShieldCheck size={30} />} title={t("admin.empty")} description={t("admin.emptyNote")} /></DashboardShell>;
}
