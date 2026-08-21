import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Новый диалог", robots: { index: false, follow: false } };

export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ listing?: string }> }) {
  const { listing } = await searchParams;
  const { t } = await getServerI18n();
  const next = listing ? `/messages/new?listing=${encodeURIComponent(listing)}` : "/messages";

  return <><Header /><main className="page-shell subpage-main conversation-page"><PageHeader fallback="/messages" eyebrow={t("messages.eyebrow")} title={t("messages.newTitle")} description={t("messages.newDescription")} /><section className="state-card compact-state"><h2>{t("messages.signInTitle")}</h2><p>{t("messages.signInNote")}</p><Link className="primary-button" href={`/login?next=${encodeURIComponent(next)}`}>{t("messages.signIn")}</Link></section></main><MobileNav /></>;
}
