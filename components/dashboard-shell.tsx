import type { ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck, Bell, CircleHelp, Heart, LayoutDashboard, MessageCircle, Settings, ShieldCheck, UserRound } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";

const dashboardLinks = [
  { href: "/profile", label: "Профиль", icon: UserRound },
  { href: "/favorites", label: "Избранное", icon: Heart },
  { href: "/messages", label: "Чаты", icon: MessageCircle },
  { href: "/notifications", label: "Уведомления", icon: Bell },
  { href: "/admin", label: "Модерация", icon: ShieldCheck },
];

export function DashboardShell({ title, description, active, children }: { title: string; description: string; active: string; children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="page-shell dashboard-page">
        <aside className="dashboard-sidebar">
          <Link href="/profile" className="dashboard-user">
            <span className="dashboard-avatar">А</span>
            <div><strong>Айдос</strong><small><BadgeCheck size={13} /> Профиль подтверждён</small></div>
          </Link>
          <nav className="dashboard-nav" aria-label="Личный кабинет">
            {dashboardLinks.map(({ href, label, icon: Icon }) => (
              <Link className={active === href ? "active" : ""} href={href} key={href}><Icon size={18} />{label}</Link>
            ))}
          </nav>
          <div className="dashboard-sidebar-footer">
            <Link href="/settings"><Settings size={18} />Настройки</Link>
            <Link href="/help"><CircleHelp size={18} />Помощь</Link>
            <Link className="dashboard-catalog-link" href="/search"><LayoutDashboard size={18} />Вернуться в каталог</Link>
          </div>
        </aside>
        <section className="dashboard-content">
          <header className="dashboard-heading"><span className="section-kicker">Личный кабинет</span><h1>{title}</h1><p>{description}</p></header>
          {children}
        </section>
      </main>
      <MobileNav />
    </>
  );
}
