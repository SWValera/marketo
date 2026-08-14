import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronRight, CircleHelp, Heart, LogIn, MapPin, MessageCircle, PenLine, Settings, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { profileRepository } from "@/lib/data/repositories";
import { getSettlement } from "@/lib/geography";
import { getServerI18n } from "@/lib/i18n/server";
import { localize } from "@/lib/i18n/config";

export const metadata: Metadata = { title: "Профиль", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const profile = await profileRepository.current();
  const { locale, t } = await getServerI18n();
  const city = profile?.cityId ? getSettlement(profile.cityId) : undefined;
  const menu = [
    { href: "/favorites", label: t("nav.favorites"), note: t("profile.favoritesNote"), icon: Heart },
    { href: "/messages", label: t("nav.chats"), note: t("profile.chatsNote"), icon: MessageCircle },
    { href: "/notifications", label: t("nav.notifications"), note: t("profile.notificationsNote"), icon: Bell },
    { href: "/settings", label: t("nav.settings"), note: t("profile.settingsNote"), icon: Settings },
    { href: "/help", label: t("nav.help"), note: t("profile.helpNote"), icon: CircleHelp },
  ];
  return <DashboardShell title={t("profile.title")} description={t("profile.description")} active="/profile">
    {!profile ? <EmptyState icon={<LogIn size={30} />} title={t("profile.signInTitle")} description={t("profile.signInNote")} actionHref="/login" actionLabel={t("profile.signInOrRegister")} /> : <article className="dashboard-card profile-hero"><div className="profile-avatar"><UserRound size={24} /></div><div className="profile-identity"><div className="profile-name-row"><h2>{profile.displayName}</h2>{profile.verified ? <span className="verified-badge">{t("profile.verified")}</span> : null}</div>{city ? <p><MapPin size={15} /> {localize(city.name, locale)}</p> : null}{profile.bio ? <p>{profile.bio}</p> : null}</div><Link className="secondary-button" href="/profile/edit"><PenLine size={17} /> {t("common.edit")}</Link></article>}
    <section className="dashboard-card profile-menu-card"><h2>{t("profile.sections")}</h2><div className="profile-menu-list">{menu.map(({ href, label, note, icon: Icon }) => <Link href={href} key={label}><span><Icon size={20} /></span><div><strong>{label}</strong><small>{note}</small></div><ChevronRight size={19} /></Link>)}</div></section>
    <section className="dashboard-section"><div className="dashboard-section-heading"><div><h2>{t("profile.myListings")}</h2><p>{t("profile.myListingsNote")}</p></div><Link href="/publish" className="primary-action">{t("nav.publish")}</Link></div><EmptyState icon={<UserRound size={30} />} title={t("profile.emptyListings")} description={t("profile.emptyListingsNote")} actionHref="/publish" actionLabel={t("profile.createListing")} /></section>
  </DashboardShell>;
}
