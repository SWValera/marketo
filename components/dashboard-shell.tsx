import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, CircleHelp, Heart, LayoutDashboard, LogIn, MessageCircle, Settings, ShieldCheck, UserRound } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getServerI18n } from "@/lib/i18n/server";

export async function DashboardShell({ title, description, active, children }: { title: string; description: string; active: string; children: ReactNode }) {
  const { t } = await getServerI18n();
  const dashboardLinks = [
    { href: "/profile", label: t("nav.profile"), icon: UserRound },
    { href: "/favorites", label: t("nav.favorites"), icon: Heart },
    { href: "/messages", label: t("nav.chats"), icon: MessageCircle },
    { href: "/notifications", label: t("nav.notifications"), icon: Bell },
    { href: "/admin", label: t("nav.moderation"), icon: ShieldCheck },
  ];
  const fallback = active === "/profile" || active === "/favorites" || active === "/messages" ? "/" : "/profile";
  return (
    <>
      <Header />
      <main className="page-shell dashboard-page">
        <aside className="dashboard-sidebar">
          <Link href="/login" className="dashboard-user">
            <span className="dashboard-avatar"><UserRound size={20} /></span>
            <div><strong>{t("account.signIn")}</strong><small><LogIn size={13} /> {t("account.sync")}</small></div>
          </Link>
          <nav className="dashboard-nav" aria-label={t("nav.account")}>
            {dashboardLinks.map(({ href, label, icon: Icon }) => (
              <Link className={active === href ? "active" : ""} href={href} key={href}><Icon size={18} />{label}</Link>
            ))}
          </nav>
          <div className="dashboard-sidebar-footer">
            <Link href="/settings"><Settings size={18} />{t("nav.settings")}</Link>
            <Link href="/help"><CircleHelp size={18} />{t("nav.help")}</Link>
            <Link className="dashboard-catalog-link" href="/search"><LayoutDashboard size={18} />{t("nav.returnCatalog")}</Link>
          </div>
        </aside>
        <section className="dashboard-content">
          <PageHeader title={title} description={description} eyebrow={t("nav.account")} fallback={fallback} />
          {children}
        </section>
      </main>
      <MobileNav />
    </>
  );
}
