import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, CircleHelp, Heart, LayoutDashboard, LogIn, MessageCircle, Settings, ShieldCheck, UserRound } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getServerI18n } from "@/lib/i18n/server";
import { profileRepository } from "@/lib/data/repositories";
import { LogoutButton } from "@/components/logout-button";
import { hasAnyRole, type CurrentAuthContext } from "@/lib/auth/context";

export async function DashboardShell({ title, description, active, children, authContext, fallback }: { title: string; description: string; active: string; children: ReactNode; authContext?: CurrentAuthContext; fallback?: string }) {
  const [{ t }, resolvedContext] = await Promise.all([
    getServerI18n(),
    authContext ? Promise.resolve(authContext) : profileRepository.current(),
  ]);
  const profile = resolvedContext.status === "authenticated" ? resolvedContext.profile : null;
  const dashboardLinks = resolvedContext.status === "authenticated" ? [
    { href: "/profile", label: t("nav.profile"), icon: UserRound },
    { href: "/favorites", label: t("nav.favorites"), icon: Heart },
    { href: "/messages", label: t("nav.chats"), icon: MessageCircle },
    { href: "/notifications", label: t("nav.notifications"), icon: Bell },
    ...(hasAnyRole(resolvedContext, ["moderator", "admin"])
      ? [{ href: "/admin", label: t("nav.moderation"), icon: ShieldCheck }]
      : []),
  ] : [];
  const resolvedFallback = fallback ?? (active === "/profile" || active === "/favorites" || active === "/messages" ? "/" : "/profile");
  return (
    <>
      <Header />
      <main className="page-shell dashboard-page">
        <aside className="dashboard-sidebar">
          {profile ? <div className="dashboard-user dashboard-user-authenticated">
            <span className="dashboard-avatar"><UserRound size={20} /></span>
            <div><strong>{profile.displayName}</strong><small>{t("account.sessionActive")}</small></div>
            <LogoutButton compact />
          </div> : resolvedContext.status === "error" ? <div className="dashboard-user dashboard-user-error" role="status">
            <span className="dashboard-avatar"><AlertTriangle size={20} /></span>
            <div><strong>{t("account.temporarilyUnavailable")}</strong><small>{t("account.retryProfile")}</small></div>
          </div> : <Link href={"/login?mode=login&next=/profile"} className="dashboard-user">
            <span className="dashboard-avatar"><UserRound size={20} /></span>
            <div><strong>{t("account.signIn")}</strong><small><LogIn size={13} /> {t("account.sync")}</small></div>
          </Link>}
          {dashboardLinks.length ? <nav className="dashboard-nav" aria-label={t("nav.account")}>
            {dashboardLinks.map(({ href, label, icon: Icon }) => (
              <Link className={active === href ? "active" : ""} href={href} key={href}><Icon size={18} />{label}</Link>
            ))}
          </nav> : null}
          <div className="dashboard-sidebar-footer">
            <Link href="/settings"><Settings size={18} />{t("nav.settings")}</Link>
            <Link href="/help"><CircleHelp size={18} />{t("nav.help")}</Link>
            <Link className="dashboard-catalog-link" href="/search"><LayoutDashboard size={18} />{t("nav.returnCatalog")}</Link>
          </div>
        </aside>
        <section className="dashboard-content">
          <PageHeader title={title} description={description} eyebrow={t("nav.account")} fallback={resolvedFallback} />
          {children}
        </section>
      </main>
      <MobileNav />
    </>
  );
}
