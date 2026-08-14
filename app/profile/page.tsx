import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronRight, CircleHelp, Heart, LogIn, MapPin, MessageCircle, PenLine, Settings, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { profileRepository } from "@/lib/data/repositories";
import { getSettlement } from "@/lib/geography";

export const metadata: Metadata = { title: "Профиль", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const profile = await profileRepository.current();
  const city = profile?.cityId ? getSettlement(profile.cityId) : undefined;
  const menu = [
    { href: "/favorites", label: "Избранное", note: "Сохранённые объявления", icon: Heart },
    { href: "/messages", label: "Чаты", note: "Диалоги с продавцами и покупателями", icon: MessageCircle },
    { href: "/notifications", label: "Уведомления", note: "История событий", icon: Bell },
    { href: "/settings", label: "Настройки", note: "Безопасность, язык и уведомления", icon: Settings },
    { href: "/help", label: "Помощь", note: "Правила и поддержка", icon: CircleHelp },
  ];
  return <DashboardShell title="Профиль" description="Управляйте объявлениями, контактами и настройками аккаунта." active="/profile">
    {!profile ? <EmptyState icon={<LogIn size={30} />} title="Войдите, чтобы открыть профиль" description="После подключения аккаунта здесь появятся ваши данные, объявления и статистика — без тестовых значений." actionHref="/login" actionLabel="Войти или зарегистрироваться" /> : <article className="dashboard-card profile-hero"><div className="profile-avatar"><UserRound size={24} /></div><div className="profile-identity"><div className="profile-name-row"><h2>{profile.displayName}</h2>{profile.verified ? <span className="verified-badge">Подтверждён</span> : null}</div>{city ? <p><MapPin size={15} /> {city.name.ru}</p> : null}{profile.bio ? <p>{profile.bio}</p> : null}</div><Link className="secondary-button" href="/profile/edit"><PenLine size={17} /> Редактировать</Link></article>}
    <section className="dashboard-card profile-menu-card"><h2>Разделы аккаунта</h2><div className="profile-menu-list">{menu.map(({ href, label, note, icon: Icon }) => <Link href={href} key={label}><span><Icon size={20} /></span><div><strong>{label}</strong><small>{note}</small></div><ChevronRight size={19} /></Link>)}</div></section>
    <section className="dashboard-section"><div className="dashboard-section-heading"><div><h2>Мои объявления</h2><p>Опубликованные и сохранённые черновики появятся после входа.</p></div><Link href="/publish" className="primary-action">Подать объявление</Link></div><EmptyState icon={<UserRound size={30} />} title="У вас пока нет объявлений" description="Создайте первое объявление — Marketo подберёт поля по выбранной категории." actionHref="/publish" actionLabel="Создать объявление" /></section>
  </DashboardShell>;
}
