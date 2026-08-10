/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Eye, Heart, MapPin, MessageCircle, Phone, Share2 } from "lucide-react";
import { Header } from "@/components/header";
import { ListingCard } from "@/components/listing-card";
import { MobileNav } from "@/components/mobile-nav";
import { listings } from "@/lib/mock-data";

function findListing(routeSlug: string) {
  return listings.find((item) => routeSlug.startsWith(`${item.id}-`));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const listing = findListing(slug);
  return listing ? { title: `${listing.title} — ${listing.price}`, description: listing.description } : {};
}

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = findListing(slug) ?? listings[0];
  return <><Header /><main className="page-shell listing-page">
    <Link className="back-link" href="/search"><ArrowLeft size={17} /> Назад в каталог</Link>
    <div className="breadcrumbs">Главная / {listing.category} / {listing.title}</div>
    <div className="listing-layout">
      <section>
        <div className="gallery-main"><img src={listing.image} alt={listing.title} /></div>
        <div className="gallery-thumbs">{[1,2,3,4].map((number) => <button type="button" key={number} aria-label={`Фотография ${number}`}><img src={listing.image} alt="" /></button>)}</div>
        <article className="detail-card"><h2>Описание</h2><p>{listing.description}</p></article>
        <article className="detail-card"><h2>Местоположение</h2><p><MapPin size={17} /> {listing.location}</p><div className="map-placeholder"><MapPin size={30} /></div></article>
      </section>
      <aside className="seller-column">
        <article className="price-card">
          <div className="listing-meta"><span>{listing.time}</span><span><Eye size={15} /> 245</span></div>
          <h1>{listing.title}</h1><div className="detail-price">{listing.price}</div><span className="negotiable">Торг уместен</span>
          <div className="detail-actions"><button type="button"><Phone size={19} /> Показать телефон</button><button type="button"><MessageCircle size={19} /> Написать продавцу</button></div>
          <div className="detail-secondary"><button type="button"><Heart size={18} /> В избранное</button><button type="button"><Share2 size={18} /> Поделиться</button></div>
        </article>
        <article className="seller-card"><div className="avatar">А</div><div><strong>Айдос</strong><span><BadgeCheck size={15} /> Проверенный профиль</span><small>На Marketo с 2024 года</small></div><div className="rating">★ 4,9 · 18 отзывов</div></article>
      </aside>
    </div>
    <section className="similar-section"><h2>Похожие объявления</h2><div className="listing-grid">{listings.filter((item) => item.id !== listing.id).slice(0,4).map((item) => <ListingCard listing={item} key={item.id} />)}</div></section>
  </main><MobileNav /></>;
}
