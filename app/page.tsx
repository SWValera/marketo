import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart, MapPin, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { Header } from "@/components/header";
import { ListingCard } from "@/components/listing-card";
import { MobileNav } from "@/components/mobile-nav";
import { categories, heroStats, listings, SparklesIcon } from "@/lib/mock-data";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  const recommendedIds = ["mk-10345", "mk-10355", "mk-10353", "mk-10354", "mk-10347", "mk-10357", "mk-10358", "mk-10361"];
  const recommendedListings = recommendedIds.map((id) => listings.find((listing) => listing.id === id)).filter((listing): listing is (typeof listings)[number] => Boolean(listing));
  return (
    <>
      <Header />
      <main>
        <section className="hero-shell page-shell">
          <div className="category-sidebar">
            <div className="sidebar-heading">Категории</div>
            <nav aria-label="Категории объявлений">
              {categories.map(({ slug, name, icon: Icon }) => (
                <Link key={slug} href={`/category/${slug}`}><Icon size={17} /><span>{name}</span></Link>
              ))}
            </nav>
          </div>

          <div className="hero-main">
            <div className="hero-card">
              <div className="hero-copy">
                <span className="eyebrow"><SparklesIcon size={15} /> Маркетплейс Казахстана</span>
                <h1>Покупайте и продавайте легко и безопасно</h1>
                <p>Тысячи актуальных объявлений от людей и компаний рядом с вами.</p>
                <div className="hero-actions">
                  <Link href="/publish" className="primary-action">Разместить объявление <ArrowRight size={18} /></Link>
                  <Link href="/search" className="secondary-action">Смотреть каталог</Link>
                </div>
                <div className="hero-stats">
                  {heroStats.map((item) => <div key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}
                </div>
              </div>
              <div className="hero-visual" aria-hidden="true">
                <div className="visual-orbit orbit-one"><Heart size={23} fill="currentColor" /></div>
                <div className="visual-orbit orbit-two"><MapPin size={25} /></div>
                <div className="visual-phone">
                  <div className="visual-phone-top" />
                  <div className="mini-search"><Search size={12} /> Поиск...</div>
                  <div className="mini-card large" />
                  <div className="mini-grid"><div /><div /></div>
                </div>
              </div>
            </div>

            <div className="trust-row">
              <div><ShieldCheck size={24} /><span><strong>Безопасные сделки</strong><small>Жалобы и модерация</small></span></div>
              <div><Search size={24} /><span><strong>Удобный поиск</strong><small>Категории и фильтры</small></span></div>
              <div><MessageCircle size={24} /><span><strong>Чат в приложении</strong><small>Общайтесь напрямую</small></span></div>
              <div><Heart size={24} /><span><strong>Избранное</strong><small>Сохраняйте находки</small></span></div>
            </div>

            <section className="popular-section" aria-labelledby="popular-title">
              <div className="section-heading">
                <div><span className="section-kicker">Выбирайте быстрее</span><h2 id="popular-title">Популярные категории</h2></div>
                <Link href="/search">Смотреть все <ArrowRight size={16} /></Link>
              </div>
              <div className="category-grid">
                {categories.slice(0, 6).map(({ slug, name, count, icon: Icon, tone }) => (
                  <Link href={`/category/${slug}`} className="category-tile" key={slug}>
                    <span className={`category-icon tone-${tone}`}><Icon size={26} /></span>
                    <strong>{name}</strong>
                    <small>{count} объявлений</small>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section className="listings-section">
          <div className="page-shell">
            <div className="section-heading">
              <div><span className="section-kicker">Подобрано для вас</span><h2>Рекомендуемые объявления</h2></div>
              <Link href="/search">Смотреть все <ArrowRight size={16} /></Link>
            </div>
            <div className="listing-grid">
              {recommendedListings.map((listing) => <ListingCard listing={listing} key={listing.id} />)}
            </div>
          </div>
        </section>

        <section className="cta-section page-shell">
          <div>
            <span className="section-kicker">Начните прямо сейчас</span>
            <h2>Дайте вещам новую жизнь</h2>
            <p>Создайте объявление за несколько минут и найдите покупателя рядом.</p>
          </div>
          <Link href="/publish" className="primary-action">Разместить объявление <ArrowRight size={18} /></Link>
        </section>
      </main>
      <footer className="site-footer">
        <div className="page-shell"><span className="brand"><span className="brand-mark">M</span>Marketo</span><p>Покупайте и продавайте по всему Казахстану.</p><span>© 2026 Marketo</span></div>
      </footer>
      <MobileNav />
    </>
  );
}
