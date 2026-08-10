import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Профиль", robots: { index: false, follow: false } };

export default function ProfilePage() {
  return <DashboardShell title="Профиль продавца" description="Личные данные, объявления и настройки аккаунта." active="/profile"><div className="profile-grid"><article className="dashboard-card profile-main"><div className="profile-avatar">А</div><div><h2>Айдос</h2><p>Алматы · на Marketo с 2024 года</p><span>Профиль подтверждён</span></div><button type="button">Редактировать</button></article><article className="dashboard-card dashboard-stat"><strong>3</strong><span>активных объявления</span></article><article className="dashboard-card dashboard-stat"><strong>18</strong><span>отзывов · рейтинг 4,9</span></article></div><div className="dashboard-card profile-actions"><h2>Мои объявления</h2><p>Управляйте публикациями и создавайте новые объявления.</p><Link className="primary-action" href="/publish">Разместить объявление</Link></div></DashboardShell>;
}
