import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart, MapPin, MessageCircle, Search, ShieldCheck, Sparkles } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { categoryTree } from "@/lib/catalog-config";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return <>
    <Header />
    <main>
      <section className="hero-shell page-shell">
        <div className="category-sidebar"><div className="sidebar-heading">Категории</div><nav aria-label="Категории объявлений">{categoryTree.map((category) => <Link key={category.slug} href={`/category/${category.slug}`}><CategoryIcon name={category.icon} size={17} /><span>{category.name.ru}</span></Link>)}</nav></div>
        <div className="hero-main">
          <div className="hero-card"><div className="hero-copy"><span className="eyebrow"><Sparkles size={15} /> Маркетплейс Казахстана</span><h1>Покупайте и продавайте по всему Казахстану</h1><p>Единый каталог товаров, транспорта, недвижимости, работы и услуг — с удобным поиском по городам.</p><div className="hero-actions"><Link href="/publish" className="primary-action">Разместить объявление <ArrowRight size={18} /></Link><Link href="/search" className="secondary-action">Смотреть каталог</Link></div><div className="hero-stats"><div><strong>90</strong><span>городов в справочнике</span></div><div><strong>20</strong><span>регионов и городов республиканского значения</span></div><div><strong>RU / KK</strong><span>архитектура локализации</span></div></div></div><div className="hero-visual" aria-hidden="true"><div className="visual-orbit orbit-one"><Heart size={23} /></div><div className="visual-orbit orbit-two"><MapPin size={25} /></div><div className="visual-phone"><div className="visual-phone-top" /><div className="mini-search"><Search size={12} /> Поиск...</div><div className="mini-card large" /><div className="mini-grid"><div /><div /></div></div></div></div>
          <div className="trust-row"><div><ShieldCheck size={24} /><span><strong>Безопасность</strong><small>Жалобы и модерация</small></span></div><div><Search size={24} /><span><strong>Точный поиск</strong><small>Категории и фильтры</small></span></div><div><MessageCircle size={24} /><span><strong>Чат внутри сервиса</strong><small>Без передачи личных данных</small></span></div><div><Heart size={24} /><span><strong>Избранное</strong><small>Сохраняйте находки</small></span></div></div>
          <section className="popular-section" aria-labelledby="popular-title"><div className="section-heading"><div><span className="section-kicker">Полный каталог</span><h2 id="popular-title">Популярные категории</h2></div><Link href="/categories">Все категории <ArrowRight size={16} /></Link></div><div className="category-grid">{categoryTree.slice(0, 8).map((category) => <Link href={`/category/${category.slug}`} className="category-tile" key={category.slug}><span className={`category-icon tone-${category.tone}`}><CategoryIcon name={category.icon} size={26} /></span><strong>{category.name.ru}</strong><small>{category.children?.length ?? 0} разделов</small></Link>)}</div></section>
        </div>
      </section>
      <section className="listings-section"><div className="page-shell"><div className="section-heading"><div><span className="section-kicker">Новые предложения</span><h2>Рекомендуемые объявления</h2></div></div><EmptyState title="Объявлений пока нет" description="Каталог начнёт заполняться после подключения базы данных и первых публикаций. Можно уже подготовить своё объявление." actionHref="/publish" actionLabel="Подать объявление" /></div></section>
      <section className="cta-section page-shell"><div><span className="section-kicker">Начните прямо сейчас</span><h2>Подготовьте первое объявление</h2><p>Выберите точную категорию и заполните подходящие характеристики.</p></div><Link href="/publish" className="primary-action">Разместить объявление <ArrowRight size={18} /></Link></section>
    </main>
    <footer className="site-footer"><div className="page-shell"><span className="brand"><span className="brand-mark">M</span>Marketo</span><p>Покупайте и продавайте по всему Казахстану.</p><span>© 2026 Marketo</span></div></footer>
    <MobileNav />
  </>;
}
