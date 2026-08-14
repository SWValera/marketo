import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { chatRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Чаты", robots: { index: false, follow: false } };

export default async function MessagesPage() {
  const chats = await chatRepository.list();
  const { t } = await getServerI18n();
  return <DashboardShell title={t("messages.title")} description={t("messages.description")} active="/messages"><section className="chat-index-shell"><header><div><h2>{t("messages.heading")}</h2><p>{chats.total} {t("messages.dialogs")}</p></div></header><EmptyState icon={<MessageCircle size={30} />} title={t("messages.empty")} description={t("messages.emptyNote")} actionHref="/search" actionLabel={t("messages.findListing")} /></section></DashboardShell>;
}
