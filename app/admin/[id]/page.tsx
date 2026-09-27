import {ModerationWorkspace} from "@/components/moderation-workspace";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { ModerationAccessError, requireModerationPageAccess } from "@/lib/auth/moderation-access";
import { moderationRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Проверка объявления", robots: { index: false, follow: false } };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ModerationCasePageProps = { params: Promise<{ id: string }> };

function logDetailFailure(error: unknown) {
  const record = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : {};
  console.error("[jevu-moderation] read failed", {
    scope: "detail",
    name: typeof record.name === "string" ? record.name : "Error",
    ...(typeof record.code === "string" ? { code: record.code } : {}),
  });
}

export default function ModerationCasePage(props: ModerationCasePageProps) {
  return <ModerationCasePageContent {...props} />;
}

async function ModerationCasePageContent({ params }: ModerationCasePageProps) {
  const [{ id }, { t, locale }] = await Promise.all([params, getServerI18n()]);
  let authContext;
  try {
    authContext = await requireModerationPageAccess(`/admin/${id}`);
  } catch (error) {
    if (!(error instanceof ModerationAccessError) || error.reason !== "unavailable") throw error;
    return <DashboardShell title={t("admin.case")} description={t("admin.description")} active="/admin" authContext={error.context} fallback="/admin">
      <EmptyState
        icon={<AlertTriangle size={30} />}
        title={t("admin.detailLoadErrorTitle")}
        description={t("admin.detailLoadErrorNote")}
        actionHref={`/admin/${id}`}
        retry actionLabel={t("common.retry")}
      />
    </DashboardShell>;
  }

  if (!uuid.test(id)) notFound();
  let item;
  try {
    item = await moderationRepository.findById(await createSupabaseServerClient(), id, locale);
  } catch (error) {
    logDetailFailure(error);
    return <DashboardShell title={t("admin.case")} description={t("admin.description")} active="/admin" authContext={authContext} fallback="/admin">
      <EmptyState
        icon={<AlertTriangle size={30} />}
        title={t("admin.detailLoadErrorTitle")}
        description={t("admin.detailLoadErrorNote")}
        actionHref={`/admin/${id}`}
        retry actionLabel={t("common.retry")}
      />
    </DashboardShell>;
  }
  if (!item) notFound();

  return <DashboardShell title={t("admin.title")} description={t("admin.description")} active="/admin" authContext={authContext} fallback="/admin"><ModerationWorkspace initial={{kind:'case',item}} locale={locale}/></DashboardShell>;
}
