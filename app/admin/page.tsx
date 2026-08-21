import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { QueryTabs } from "@/components/query-tabs";
import { moderationRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Модерация", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const requested = (await searchParams).view;
  const initialView = Array.isArray(requested) ? requested[0] : requested;
  const queue = await moderationRepository.list();
  const { t } = await getServerI18n();
  return <DashboardShell title={t("admin.title")} description={t("admin.description")} active="/admin"><QueryTabs className="admin-tabs" defaultValue="listings" initialValue={initialView} items={[{ value: "listings", label: t("admin.listings"), count: queue.total }, { value: "reports", label: t("admin.reports") }, { value: "users", label: t("admin.users") }, { value: "categories", label: t("admin.categories") }]} /><EmptyState icon={<ShieldCheck size={30} />} title={t("admin.empty")} description={t("admin.emptyNote")} /></DashboardShell>;
}
