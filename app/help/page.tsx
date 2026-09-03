import type { Metadata } from "next";
import { AppLink as Link } from "@/components/app-link";
import { BookOpen, CircleHelp, MessageCircle, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Помощь", robots: { index: false, follow: false } };

export default async function HelpPage() {
  const { t } = await getServerI18n();
  return (
    <DashboardShell active="/help" title={t("help.title")} description={t("help.description")}>
      <section className="dashboard-card help-grid">
        <Link className="help-card" href="/publish" prefetch={false}><BookOpen size={24} /><strong>{t("help.publish")}</strong><span>{t("help.publishNote")}</span></Link>
        <Link className="help-card" href="/messages"><MessageCircle size={24} /><strong>{t("help.communication")}</strong><span>{t("help.communicationNote")}</span></Link>
        <article className="help-card"><ShieldCheck size={24} /><strong>{t("help.safety")}</strong><span>{t("help.safetyNote")}</span></article>
        <Link className="help-card" href="/login"><CircleHelp size={24} /><strong>{t("help.support")}</strong><span>{t("help.supportNote")}</span></Link>
      </section>
    </DashboardShell>
  );
}
