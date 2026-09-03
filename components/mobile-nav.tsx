"use client";

import { AppLink as Link } from "@/components/app-link";
import { Heart, Home, MessageCircle, Plus, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";

export function MobileNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const links = [
    { href: "/", label: t("common.home"), icon: Home },
    { href: "/favorites", label: t("nav.favorites"), icon: Heart },
    { href: "/publish", label: t("nav.publish"), icon: Plus, publish: true },
    { href: "/messages", label: t("nav.chats"), icon: MessageCircle },
    { href: "/profile", label: t("nav.profile"), icon: UserRound },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label={t("nav.mobileAria")}>
      {links.map(({ href, label, icon: Icon, publish }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return <Link prefetch={publish ? false : undefined} href={href} className={`${publish ? "mobile-publish " : ""}${active ? "is-active" : ""}`} key={href}>
          <span className="mobile-nav-icon"><Icon size={publish ? 25 : 21} /></span>
          <span>{label}</span>
        </Link>;
      })}
    </nav>
  );
}
