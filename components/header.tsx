"use client";

import Link from "next/link";
import { Bell, ChevronDown, Heart, MapPin, Menu, MessageCircle, Search, UserRound, X } from "lucide-react";
import { useState } from "react";
import { PwaInstall } from "@/components/pwa-install";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Marketo — главная">
          <span className="brand-mark">M</span>
          <span>Marketo</span>
        </Link>

        <button className="city-button" type="button" aria-label="Выбрать город">
          <MapPin size={16} aria-hidden="true" />
          <span>Алматы</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>

        <form className="header-search" action="/search">
          <Search size={18} aria-hidden="true" />
          <input name="q" aria-label="Поиск объявлений" placeholder="Поиск объявлений..." />
          <button type="submit">Найти</button>
        </form>

        <nav className="header-actions" aria-label="Личный раздел">
          <Link href="/favorites"><Heart size={20} /><span>Избранное</span></Link>
          <Link href="/messages"><MessageCircle size={20} /><span>Чаты</span></Link>
          <Link href="/notifications"><Bell size={20} /><span>Уведомления</span></Link>
          <Link href="/profile"><UserRound size={20} /><span>Профиль</span></Link>
        </nav>

        <PwaInstall />
        <Link className="publish-button" href="/publish">Разместить объявление</Link>
        <button
          type="button"
          className="menu-toggle"
          aria-label="Открыть меню"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <nav className="mobile-menu" aria-label="Мобильное меню">
          <Link href="/search" onClick={() => setMenuOpen(false)}>Каталог объявлений</Link>
          <Link href="/favorites" onClick={() => setMenuOpen(false)}>Избранное</Link>
          <Link href="/messages" onClick={() => setMenuOpen(false)}>Чаты</Link>
          <Link href="/profile" onClick={() => setMenuOpen(false)}>Профиль</Link>
          <PwaInstall />
          <Link href="/publish" onClick={() => setMenuOpen(false)}>Разместить объявление</Link>
        </nav>
      )}
    </header>
  );
}
