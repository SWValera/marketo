import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Настройки", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const { t } = await getServerI18n();
  return <DashboardShell active="/settings" title={t("settings.title")} description={t("settings.description")}><EmptyState icon={<Settings size={30} />} title={t("settings.empty")} description={t("settings.emptyNote")} actionHref="/login" actionLabel={t("settings.signIn")} /></DashboardShell>;
}
