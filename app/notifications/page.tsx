import type { Metadata } from "next";
import { AlertTriangle, Bell, ChevronLeft, ChevronRight, LogIn } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { NotificationList } from "@/app/notifications/notification-list";
import { getCurrentAuthContext } from "@/lib/auth/context";
import { normalizePositivePage } from "@/lib/data/pagination";
import { notificationRepository } from "@/lib/data/repositories";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Уведомления", robots: { index: false, follow: false } };

const PAGE_SIZE = 40;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string | string[]; page?: string | string[] }> }) {
  const params = await searchParams;
  const requested = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const initialFilter = requested === "unread" ? "unread" : "all";
  const page = normalizePositivePage(params.page);
  const [{ t }, authContext] = await Promise.all([getServerI18n(), getCurrentAuthContext()]);
  if (authContext.status === "anonymous") {
    return <DashboardShell title={t("notifications.title")} description={t("notifications.description")} active="/notifications" authContext={authContext}>
      <EmptyState icon={<LogIn size={30} />} title={t("notifications.signInTitle")} description={t("notifications.signInNote")} actionHref="/login?next=/notifications" actionLabel={t("notifications.signIn")} />
    </DashboardShell>;
  }
  if (authContext.status === "error") {
    return <DashboardShell title={t("notifications.title")} description={t("notifications.description")} active="/notifications" authContext={authContext}>
      <EmptyState icon={<AlertTriangle size={30} />} title={t("notifications.loadErrorTitle")} description={t("notifications.loadErrorNote")} actionHref="/notifications" actionLabel={t("common.retry")} />
    </DashboardShell>;
  }
  let notifications: Awaited<ReturnType<typeof notificationRepository.list>> | null = null;
  try {
    notifications = await notificationRepository.list({
      page,
      pageSize: PAGE_SIZE,
      unreadOnly: initialFilter === "unread",
    });
  } catch {
    // Preserve a distinct data-error state instead of presenting an empty inbox.
  }
  const baseHref = initialFilter === "unread" ? "/notifications?filter=unread" : "/notifications";
  const pageHref = (target: number) => `${baseHref}${baseHref.includes("?") ? "&" : "?"}page=${target}`;
  return <DashboardShell title={t("notifications.title")} description={t("notifications.description")} active="/notifications" authContext={authContext}>
    <nav className="notification-toolbar segmented-control" aria-label={t("notifications.filterLabel")}>
      <Link className={initialFilter === "all" ? "primary-button" : "secondary-button"} aria-current={initialFilter === "all" ? "page" : undefined} href="/notifications">{t("common.all")}</Link>
      <Link className={initialFilter === "unread" ? "primary-button" : "secondary-button"} aria-current={initialFilter === "unread" ? "page" : undefined} href="/notifications?filter=unread">{t("notifications.unread")}</Link>
    </nav>
    {!notifications ? <EmptyState icon={<AlertTriangle size={30} />} title={t("notifications.loadErrorTitle")} description={t("notifications.loadErrorNote")} actionHref={page === 1 ? baseHref : pageHref(page)} actionLabel={t("common.retry")} />
      : notifications.total === 0 ? <EmptyState icon={<Bell size={30} />} title={t("notifications.empty")} description={t("notifications.emptyNote", { count: notifications.total })} />
        : notifications.items.length === 0 ? <EmptyState icon={<Bell size={30} />} title={t("notifications.pageOutOfRangeTitle")} description={t("notifications.pageOutOfRangeNote")} actionHref={baseHref} actionLabel={t("notifications.firstPage")} />
          : <><NotificationList notifications={notifications.items} />
            {page > 1 || notifications.nextCursor ? <nav className="owner-listing-pagination" aria-label={t("notifications.title")}>
              {page > 1 ? <Link href={page === 2 ? baseHref : pageHref(page - 1)}><ChevronLeft size={17} />{t("profile.previousPage")}</Link> : <span />}
              {notifications.nextCursor ? <Link href={pageHref(Number(notifications.nextCursor))}>{t("profile.nextPage")}<ChevronRight size={17} /></Link> : null}
            </nav> : null}
          </>}
  </DashboardShell>;
}
