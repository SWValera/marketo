"use client";

import Link from "next/link";
import { Heart, Home, MessageCircle, Plus, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";

export function MobileNav() {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Главная", icon: Home },
    { href: "/favorites", label: "Избранное", icon: Heart },
    { href: "/publish", label: "Подать", icon: Plus, publish: true },
    { href: "/messages", label: "Чаты", icon: MessageCircle },
    { href: "/profile", label: "Профиль", icon: UserRound },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Основная мобильная навигация">
      {links.map(({ href, label, icon: Icon, publish }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return <Link href={href} className={`${publish ? "mobile-publish " : ""}${active ? "is-active" : ""}`} key={href}>
          <span className="mobile-nav-icon"><Icon size={publish ? 25 : 21} /></span>
          <span>{label}</span>
        </Link>;
      })}
    </nav>
  );
}
