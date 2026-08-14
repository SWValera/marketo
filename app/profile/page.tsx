import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Bell, ChevronRight, Eye, Heart, MapPin, MessageCircle, PenLine, Settings, Star, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ListingCard } from "@/components/listing-card";
import { listings } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Профиль", robots: { index: false, follow: false } };

export default function ProfilePage() {
  const menu = [
    { href: "/profile", label: "Личные данные", note: "Имя, телефон и город", icon: UserRound },
    { href: "/messages", label: "Чаты", note: "2 новых сообщения", icon: MessageCircle },
    { href: "/notifications", label: "Уведомления", note: "Настройки и история", icon: Bell },
    { href: "/settings", label: "Настройки", note: "Безопасность и язык", icon: Settings },
  ];
  return <DashboardShell title="Профиль продавца" description="Управляйте объявлениями, контактами и настройками аккаунта." active="/profile">
    <article className="dashboard-card profile-hero">
      <div className="profile-avatar">А<span><BadgeCheck size={16} /></span></div>
      <div className="profile-identity"><div className="profile-name-row"><h2>Айдос С.</h2><span className="verified-badge"><BadgeCheck size={14} /> Подтверждён</span></div><p><MapPin size={15} /> Алматы · на Marketo с апреля 2024 года</p><div className="profile-rating"><Star size={16} fill="currentColor" /> <strong>4,9</strong><span>18 отзывов</span></div></div>
      <Link className="secondary-button" href="/settings"><PenLine size={17} /> Редактировать</Link>
    </article>
    <section className="dashboard-stats" aria-label="Статистика профиля">
      <article><span className="stat-icon"><Eye size={20} /></span><div><strong>1 248</strong><small>просмотров</small></div></article>
      <article><span className="stat-icon"><Heart size={20} /></span><div><strong>47</strong><small>добавили в избранное</small></div></article>
      <article><span className="stat-icon"><MessageCircle size={20} /></span><div><strong>12</strong><small>новых обращений</small></div></article>
    </section>
    <section className="dashboard-section">
      <div className="dashboard-section-heading"><div><h2>Мои объявления</h2><p>3 активных объявления · 1 ожидает модерации</p></div><Link href="/publish" className="primary-action">Разместить объявление</Link></div>
      <div className="listing-grid dashboard-listings">{listings.slice(0, 3).map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div>
    </section>
    <section className="dashboard-card profile-menu-card">
      <h2>Аккаунт</h2>
      <div className="profile-menu-list">{menu.map(({ href, label, note, icon: Icon }) => <Link href={href} key={label}><span><Icon size={20} /></span><div><strong>{label}</strong><small>{note}</small></div><ChevronRight size={19} /></Link>)}</div>
    </section>
  </DashboardShell>;
}
