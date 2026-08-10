import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, Heart, LayoutDashboard, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
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
          <div className="dashboard-user"><span>А</span><div><strong>Айдос</strong><small>Тестовый профиль</small></div></div>
          <nav aria-label="Личный кабинет">
            {dashboardLinks.map(({ href, label, icon: Icon }) => (
              <Link className={active === href ? "is-active" : ""} href={href} key={href}><Icon size={18} />{label}</Link>
            ))}
          </nav>
          <Link className="dashboard-catalog-link" href="/search"><LayoutDashboard size={18} />Вернуться в каталог</Link>
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
