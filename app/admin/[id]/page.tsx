import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { ModerationDecision } from "@/components/moderation-decision";
import { PageHeader } from "@/components/page-header";
import { moderationRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Проверка объявления", robots: { index: false, follow: false } };

export default async function ModerationCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await moderationRepository.findById(id);
  if (!item) notFound();
  const { t } = await getServerI18n();
  return <><Header /><main className="page-shell subpage-main admin-detail-page"><PageHeader fallback="/admin" eyebrow={t("admin.caseEyebrow")} title={t("admin.case", { id: item.id })} description={t("admin.statusCreated", { status: item.status, date: item.createdAt })} /><div className="admin-detail-grid"><section className="dashboard-card moderation-case"><h2>{t("admin.review")}</h2><dl><div><dt>{t("admin.listingId")}</dt><dd>{item.listingId}</dd></div><div><dt>{t("admin.status")}</dt><dd>{item.status}</dd></div></dl></section><ModerationDecision /></div></main><MobileNav /></>;
}
