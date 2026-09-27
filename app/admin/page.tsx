/* eslint-disable @next/next/no-img-element -- Pending media must keep the moderator session and private cache policy. */
import {moderationFilters,moderationFilter,automaticLabel} from "@/lib/moderation/dashboard";
import {ModerationMetrics} from "@/components/moderation-metrics";
import type { Metadata } from "next";
import { AppLink as Link } from "@/components/app-link";
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, ImageOff, ShieldCheck } from "lucide-react";
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

  return <DashboardShell title={t("admin.title")} description={t("admin.description")} active="/admin" authContext={authContext} fallback="/">
    <Link href="/admin/moderation">{locale === "kk" ? "Шағымдар және ережелер" : "Жалобы и правила"}</Link>
    <nav className="dashboard-card" aria-label={locale==='kk'?'Модерация сүзгілері':'Фильтры модерации'}>{Object.entries(moderationFilters).map(([key,label])=><Link key={key} href={`/admin?filter=${key}`} aria-current={key===filter?'page':undefined} style={{display:'inline-block',margin:'6px 12px 6px 0',fontWeight:key===filter?700:400}}>{label[locale]}</Link>)}</nav>
    <ModerationMetrics locale={locale}/>
    {queue.state === "empty" ? <EmptyState
      icon={<ShieldCheck size={30} />}
      title={t("admin.empty")}
      description={t("admin.emptyNote")}
    /> : queue.state === "out_of_range" ? <EmptyState
      icon={<AlertTriangle size={30} />}
      title={t("admin.pageOutOfRangeTitle")}
      description={t("admin.pageOutOfRangeNote")}
      actionHref="/admin"
      actionLabel={t("admin.firstPage")}
    /> : <section className="dashboard-card moderation-table" aria-labelledby="moderation-queue-title">
      <header>
        <div>
          <h2 id="moderation-queue-title">{moderationFilters[filter][locale]}</h2>
          <p>{t("admin.queueCount", { count: queue.total })}</p>
        </div>
        <span><ShieldCheck size={15} /> {moderationFilters[filter][locale]}</span>
      </header>
      <div className="moderation-list">
        {queue.items.map((item) => <article className="moderation-row" key={item.id}>
          {item.imageUrl
            ? <img src={item.imageUrl} alt="" loading="lazy" />
            : <span className="moderation-preview" aria-hidden="true"><ImageOff size={22} /></span>}
          <div className="moderation-info">
            <strong>{item.title}</strong>
            <span>{item.priceLabel} · {item.categoryLabel} · {item.cityLabel}</span>
            <small>{item.sellerName}{item.sellerId ? ` · ${item.sellerId}` : ""}</small>
          </div>
          <span className="moderation-status">{automaticLabel(item.automaticDecision)}{item.overridden?' · MANUAL':''}<small>{item.status} · {item.createdLabel}</small></span>
          <div className="moderation-actions">
            <Link href={`/admin/${item.id}`} aria-label={`${t("admin.open")}: ${item.title}`} title={t("admin.open")}><Eye size={18} /></Link>
          </div>
        </article>)}
      </div>
      {queue.page > 1 || queue.nextCursor ? <footer className="moderation-pagination" aria-label={t("admin.queueTitle")}>
        {queue.page > 1 ? <Link href={`/admin?filter=${filter}&page=${queue.page - 1}`}><ChevronLeft size={17} />{t("admin.previousPage")}</Link> : <span />}
        {queue.nextCursor ? <Link href={`/admin?filter=${filter}&page=${queue.nextCursor}`}>{t("admin.nextPage")}<ChevronRight size={17} /></Link> : null}
      </footer> : null}
    </section>}
  </DashboardShell>;
}
