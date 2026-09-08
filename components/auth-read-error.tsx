import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { getServerI18n } from "@/lib/i18n/server";

// A temporary identity read failure is neither logout nor an invalid email link.
// Retry reads the same page/query; it never replays a confirmation or password write.
export async function AuthReadError({ href }: { href: string }) {
  const { t } = await getServerI18n();
  return <><Header /><main id="main-content" tabIndex={-1} className="page-container">
    <EmptyState title={t("auth.readErrorTitle")} description={t("auth.readErrorNote")}
      actionHref={href} actionLabel={t("common.retry")} retry />
  </main><MobileNav /></>;
}
