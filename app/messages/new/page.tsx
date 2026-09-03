import type { Metadata } from "next";
import { AppLink as Link } from "@/components/app-link";
import { AlertTriangle, MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getCurrentAuthContext } from "@/lib/auth/context";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Новый диалог", robots: { index: false, follow: false } };

export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ listing?: string }> }) {
  const { listing } = await searchParams;
  const [{ t }, authContext] = await Promise.all([getServerI18n(), getCurrentAuthContext()]);
  const validListingId = typeof listing === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listing)
    ? listing
    : null;
  const next = validListingId ? `/messages/new?listing=${encodeURIComponent(validListingId)}` : "/messages";

  return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main conversation-page"><PageHeader fallback="/messages" eyebrow={t("messages.eyebrow")} title={t("messages.newTitle")} description={t("messages.newDescription")} />
    {authContext.status === "anonymous" ? <section className="state-card compact-state"><h2>{t("messages.signInTitle")}</h2><p>{t("messages.signInNote")}</p><Link className="primary-button" href={`/login?next=${encodeURIComponent(next)}`}>{t("messages.signIn")}</Link></section>
      : authContext.status === "error" ? <EmptyState icon={<AlertTriangle size={30} />} title={t("messages.loadErrorTitle")} description={t("messages.loadErrorNote")} actionHref={next} actionLabel={t("common.retry")} />
        : !validListingId ? <EmptyState icon={<MessageCircle size={30} />} title={t("messages.listingRequiredTitle")} description={t("messages.listingRequiredNote")} actionHref="/search" actionLabel={t("messages.findListing")} />
          : <EmptyState icon={<MessageCircle size={30} />} title={t("messages.startUnavailableTitle")} description={t("messages.startUnavailableNote")} actionHref={`/listing/${validListingId}`} actionLabel={t("messages.returnToListing")} />}
  </main><MobileNav /></>;
}
