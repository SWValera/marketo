import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Настройки", robots: { index: false, follow: false } };

export default function SettingsPage() {
  return <DashboardShell active="/settings" title="Настройки" description="Уведомления, приватность, язык и безопасность аккаунта."><EmptyState icon={<Settings size={30} />} title="Настройки доступны после входа" description="Marketo не показывает вымышленные параметры аккаунта. После подключения авторизации здесь появятся ваши реальные настройки." actionHref="/login" actionLabel="Войти в аккаунт" /></DashboardShell>;
}
