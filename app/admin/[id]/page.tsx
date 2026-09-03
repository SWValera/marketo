/* eslint-disable @next/next/no-img-element -- Pending media must keep the moderator session and private cache policy. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, ImageOff } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { ModerationDecision } from "@/components/moderation-decision";
import { ModerationAccessError, requireModerationPageAccess } from "@/lib/auth/moderation-access";
import { moderationRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Проверка объявления", robots: { index: false, follow: false } };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ModerationCasePageProps = { params: Promise<{ id: string }> };

function logDetailFailure(error: unknown) {
  const record = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : {};
  console.error("[marketo-moderation] read failed", {
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
        actionLabel={t("common.retry")}
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
        actionLabel={t("common.retry")}
      />
    </DashboardShell>;
  }
  if (!item) notFound();

  return <DashboardShell
    title={item.title}
    description={t("admin.statusCreated", { status: t("admin.pending"), date: item.createdLabel })}
    active="/admin"
    authContext={authContext}
    fallback="/admin"
  >
    <div className="admin-detail-grid">
      <section className="dashboard-card moderation-case">
        <h2>{t("admin.review")}</h2>
        <section className="moderation-detail-section" aria-labelledby="moderation-photos-title">
          <h3 id="moderation-photos-title">{t("admin.photos")}</h3>
          {item.images.length ? <div className="moderation-photo-grid">
            {item.images.map((image, index) => <img src={image.url} alt={`${item.title} — ${index + 1}`} loading={index === 0 ? "eager" : "lazy"} key={image.id} />)}
          </div> : <p className="moderation-empty-inline"><ImageOff size={18} />{t("admin.noPhotos")}</p>}
        </section>
        <section className="moderation-detail-section" aria-labelledby="moderation-description-title">
          <h3 id="moderation-description-title">{t("admin.descriptionLabel")}</h3>
          <p className="moderation-description">{item.description}</p>
        </section>
        <dl>
          <div><dt>{t("admin.listingId")}</dt><dd>{item.id}</dd></div>
          <div><dt>{t("admin.status")}</dt><dd>{t("admin.pending")}</dd></div>
          <div><dt>{t("admin.price")}</dt><dd>{item.priceLabel}</dd></div>
          <div><dt>{t("admin.category")}</dt><dd>{item.categoryPath.join(" → ")}</dd></div>
          <div><dt>{t("admin.city")}</dt><dd>{item.cityLabel}</dd></div>
          <div><dt>{t("admin.createdAt")}</dt><dd>{item.createdLabel}</dd></div>
          <div><dt>{t("admin.seller")}</dt><dd>{item.sellerName}</dd></div>
          <div><dt>{t("admin.sellerId")}</dt><dd>{item.sellerId ?? "—"}</dd></div>
        </dl>
        <section className="moderation-detail-section moderation-attributes" aria-labelledby="moderation-attributes-title">
          <h3 id="moderation-attributes-title">{t("admin.attributes")}</h3>
          {item.attributes.length ? <dl>
            {item.attributes.map((attribute) => <div key={attribute.key}><dt>{attribute.label}</dt><dd>{attribute.value}</dd></div>)}
          </dl> : <p className="moderation-empty-inline">{t("admin.noAttributes")}</p>}
        </section>
      </section>
      <ModerationDecision listingId={item.id} />
    </div>
  </DashboardShell>;
}
