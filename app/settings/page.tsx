import type { Metadata } from "next";
import { AlertTriangle, KeyRound, LogIn, PenLine, Settings, ShieldCheck } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentAuthContext } from "@/lib/auth/context";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Настройки", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const [{ t }, authContext] = await Promise.all([getServerI18n(), getCurrentAuthContext()]);
  if (authContext.status === "anonymous") {
    return <DashboardShell active="/settings" title={t("settings.title")} description={t("settings.description")} authContext={authContext}>
      <EmptyState icon={<LogIn size={30} />} title={t("settings.empty")} description={t("settings.emptyNote")} actionHref="/login?next=/settings" actionLabel={t("settings.signIn")} />
    </DashboardShell>;
  }
  if (authContext.status === "error") {
    return <DashboardShell active="/settings" title={t("settings.title")} description={t("settings.description")} authContext={authContext}>
      <EmptyState icon={<AlertTriangle size={30} />} title={t("settings.loadErrorTitle")} description={t("settings.loadErrorNote")} actionHref="/settings" actionLabel={t("common.retry")} />
    </DashboardShell>;
  }
  return <DashboardShell active="/settings" title={t("settings.title")} description={t("settings.description")} authContext={authContext}>
    <section className="dashboard-card settings-account" aria-labelledby="settings-account-title">
      <div className="dashboard-section-heading"><div><h2 id="settings-account-title">{t("settings.accountTitle")}</h2><p>{t("settings.accountNote")}</p></div><Settings size={24} /></div>
      <dl className="characteristics-grid">
        <div><dt>{t("auth.displayName")}</dt><dd>{authContext.profile.displayName}</dd></div>
        <div><dt>{t("auth.email")}</dt><dd>{authContext.user.email ?? "—"}</dd></div>
        <div><dt>{t("settings.language")}</dt><dd>{authContext.profile.language === "kk" ? t("language.kk") : t("language.ru")}</dd></div>
      </dl>
      <div className="form-actions">
        <Link className="secondary-button" href="/profile/edit"><PenLine size={16} />{t("settings.editProfile")}</Link>
        <Link className="secondary-button" href="/login?mode=recover&next=/settings"><KeyRound size={16} />{t("settings.resetPassword")}</Link>
        <LogoutButton />
      </div>
    </section>
    <section className="dashboard-card settings-security" aria-labelledby="settings-security-title">
      <ShieldCheck size={24} />
      <div><h2 id="settings-security-title">{t("settings.securityTitle")}</h2><p>{t("settings.securityNote")}</p></div>
    </section>
  </DashboardShell>;
}
