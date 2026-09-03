"use client";

import { AppLink as Link } from "@/components/app-link";
import { Bell, Heart, Menu, MessageCircle, Search, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { PwaInstall } from "@/components/pwa-install";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { activateModalFocus } from "@/lib/browser/modal";

export function Header({ categorySlug, searchPlaceholder }: { categorySlug?: string; searchPlaceholder?: string } = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const storedLocation = useStoredLocation();
  const { t } = useI18n();
  const placeholder = searchPlaceholder ?? t("header.searchPlaceholder");

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const releaseFocus = mobileMenuRef.current ? activateModalFocus(mobileMenuRef.current, () => setMenuOpen(false)) : () => undefined;
    return () => { document.body.style.overflow = previous; releaseFocus(); };
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="header-inner" inert={menuOpen || undefined}>
        <Link href="/" className="brand" aria-label={t("header.homeAria")}>
          <span className="brand-mark">M</span>
          <span>Marketo</span>
        </Link>

        <LocationPicker compact className="city-button" />

        <form className="header-search" action="/search">
          <Search size={18} aria-hidden="true" />
          <input name="q" aria-label={t("header.searchAria")} placeholder={placeholder} />
          {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
          {storedLocation !== "all" ? <input type="hidden" name="city" value={storedLocation} /> : null}
          <button type="submit">{t("common.find")}</button>
        </form>

        <nav className="header-actions" aria-label={t("nav.accountAria")}>
          <Link href="/favorites"><Heart size={20} /><span>{t("nav.favorites")}</span></Link>
          <Link href="/messages"><MessageCircle size={20} /><span>{t("nav.chats")}</span></Link>
          <Link href="/notifications"><Bell size={20} /><span>{t("nav.notifications")}</span></Link>
          <Link href="/profile"><UserRound size={20} /><span>{t("nav.profile")}</span></Link>
        </nav>

        <LanguageSwitcher compact />
        <PwaInstall />
        <Link prefetch={false} className="publish-button" href="/publish">{t("header.publish")}</Link>
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? t("header.closeMenu") : t("header.openMenu")}
          aria-expanded={menuOpen}
          aria-controls="marketo-mobile-menu"
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <><button className="mobile-menu-overlay" type="button" aria-label={t("header.closeMenu")} onClick={() => setMenuOpen(false)} /><nav ref={mobileMenuRef} id="marketo-mobile-menu" className="mobile-menu" role="dialog" aria-modal="true" tabIndex={-1} aria-label={t("header.mobileMenu")}>
          <LanguageSwitcher />
          <LocationPicker className="mobile-location-trigger" />
          <Link href="/search" onClick={() => setMenuOpen(false)}>{t("header.catalog")}</Link>
          <Link href="/favorites" onClick={() => setMenuOpen(false)}>{t("nav.favorites")}</Link>
          <Link href="/messages" onClick={() => setMenuOpen(false)}>{t("nav.chats")}</Link>
          <Link href="/profile" onClick={() => setMenuOpen(false)}>{t("nav.profile")}</Link>
          <PwaInstall />
          <Link prefetch={false} href="/publish" onClick={() => setMenuOpen(false)}>{t("header.publish")}</Link>
        </nav></>
      )}
    </header>
  );
}
