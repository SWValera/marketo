import {ModerationWorkspace} from "@/components/moderation-workspace";
import {moderationFilter} from "@/lib/moderation/dashboard";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { ModerationAccessError, requireModerationPageAccess } from "@/lib/auth/moderation-access";
import { moderationRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePositivePage } from "@/lib/data/pagination";

export const metadata: Metadata = { title: "Модерация", robots: { index: false, follow: false } };

type AdminPageProps = { searchParams: Promise<{ page?: string | string[]; filter?: string | string[] }> };

function logModerationReadFailure(scope: "queue" | "detail", error: unknown) {
  const record = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : {};
  console.error("[jevu-moderation] read failed", {
    scope,
    name: typeof record.name === "string" ? record.name : "Error",
    ...(typeof record.code === "string" ? { code: record.code } : {}),
  });
}

export default function AdminPage(props: AdminPageProps) {
  return <AdminPageContent {...props} />;
}

async function AdminPageContent({ searchParams }: AdminPageProps) {
  const [{ t, locale }, params] = await Promise.all([getServerI18n(), searchParams]);
  const page = normalizePositivePage(params.page);
  const filter=moderationFilter(params.filter);
  let authContext;
  try {
    authContext = await requireModerationPageAccess("/admin");
  } catch (error) {
    if (!(error instanceof ModerationAccessError) || error.reason !== "unavailable") throw error;
    return <DashboardShell title={t("admin.title")} description={t("admin.description")} active="/admin" authContext={error.context} fallback="/">
      <EmptyState
        icon={<AlertTriangle size={30} />}
        title={t("admin.loadErrorTitle")}
        description={t("admin.loadErrorNote")}
        actionHref="/admin"
        retry actionLabel={t("common.retry")}
      />
    </DashboardShell>;
  }

  let queue;
  try {
    queue = await moderationRepository.list(await createSupabaseServerClient(), { page, locale, filter });
  } catch (error) {
    logModerationReadFailure("queue", error);
    return <DashboardShell title={t("admin.title")} description={t("admin.description")} active="/admin" authContext={authContext} fallback="/">
      <EmptyState
        icon={<AlertTriangle size={30} />}
        title={t("admin.loadErrorTitle")}
        description={t("admin.loadErrorNote")}
        actionHref="/admin"
        retry actionLabel={t("common.retry")}
      />
    </DashboardShell>;
  }

  return <DashboardShell title={t("admin.title")} description={t("admin.description")} active="/admin" authContext={authContext} fallback="/"><ModerationWorkspace initial={{kind:'queue',queue,filter}} locale={locale}/></DashboardShell>;
}
