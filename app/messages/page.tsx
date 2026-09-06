import type { Metadata } from "next";
import { AlertTriangle, LogIn } from "lucide-react";
import { ChatInbox } from "@/components/chat-inbox";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { getCurrentAuthContext } from "@/lib/auth/context";
import { normalizePositivePage } from "@/lib/data/pagination";
import { chatRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
export const metadata: Metadata = { title: "Чаты", robots: { index: false, follow: false } };
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const [{ t, locale }, authContext, params] = await Promise.all([getServerI18n(), getCurrentAuthContext(), searchParams]);
  const page = normalizePositivePage(params.page);
  if (authContext.status === "anonymous") return <DashboardShell title={t("messages.title")} description={t("messages.description")} active="/messages" authContext={authContext}>
    <EmptyState icon={<LogIn size={30} />} title={t("messages.signInTitle")} description={t("messages.signInNote")} actionHref="/login?next=/messages" actionLabel={t("messages.signIn")} />
  </DashboardShell>;
  let chats: Awaited<ReturnType<typeof chatRepository.list>> | null = null;
  if (authContext.status === "authenticated") {
    try { chats = await chatRepository.list({ page, pageSize:20, locale }); } catch { /* Not an empty inbox. */ }
  }
  return <DashboardShell title={t("messages.title")} description={t("messages.description")} active="/messages" authContext={authContext}>
    {chats && authContext.status === "authenticated" ? <ChatInbox key={authContext.user.id + ":" + page + ":" + locale} initial={chats} currentUserId={authContext.user.id} page={page} />
      : <EmptyState icon={<AlertTriangle size={30} />} title={t("messages.loadErrorTitle")} description={t("messages.loadErrorNote")} actionHref={page === 1 ? "/messages" : "/messages?page=" + page} actionLabel={t("common.retry")} />}
  </DashboardShell>;
}
