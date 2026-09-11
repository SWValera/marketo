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
  const authContextPromise = getCurrentAuthContext();
  const [{ t, locale }, params] = await Promise.all([getServerI18n(), searchParams]);
  const page = normalizePositivePage(params.page);
  const chatsPromise = chatRepository.list({ page, pageSize:20, locale }).catch(() => null);
  const authContext = await authContextPromise;
  if (authContext.status === "anonymous") return <DashboardShell title={t("messages.title")} description={t("messages.description")} active="/messages" authContext={authContext}>
    <EmptyState icon={<LogIn size={30} />} title={t("messages.signInTitle")} description={t("messages.signInNote")} actionHref="/login?next=/messages" actionLabel={t("messages.signIn")} />
  </DashboardShell>;
  let chats: Awaited<ReturnType<typeof chatRepository.list>> | null = null;
  if (authContext.status === "authenticated") {
    chats = await chatsPromise;
  }
  return <DashboardShell title={t("messages.title")} description={t("messages.description")} active="/messages" authContext={authContext}>
    {chats && authContext.status === "authenticated" ? <ChatInbox key={authContext.user.id + ":" + page + ":" + locale} initial={chats} currentUserId={authContext.user.id} page={page} />
      : <EmptyState icon={<AlertTriangle size={30} />} title={t("messages.loadErrorTitle")} description={t("messages.loadErrorNote")} actionHref={page === 1 ? "/messages" : "/messages?page=" + page} retry actionLabel={t("common.retry")} />}
  </DashboardShell>;
}
