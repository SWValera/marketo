/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Eye, Flag, Heart, MapPin, MessageCircle, Phone, Share2 } from "lucide-react";
import { Header } from "@/components/header";
import { ListingCard } from "@/components/listing-card";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getCategoryBySlug } from "@/lib/catalog-config";
import { listings } from "@/lib/mock-data";

function findListing(routeSlug: string) {
  return listings.find((item) => routeSlug.startsWith(`${item.id}-`));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const listing = findListing(slug);
  return listing ? {
    title: `${listing.title} — ${listing.price}`,
    description: listing.description,
    alternates: { canonical: `/listing/${listing.id}-${listing.slug}` },
    openGraph: { title: listing.title, description: `${listing.price} · ${listing.location}`, url: `/listing/${listing.id}-${listing.slug}`, images: [listing.image] },
  } : {};
}

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = findListing(slug);
  if (!listing) notFound();
  const category = getCategoryBySlug(listing.categorySlug);
  const characteristics = category?.filters.flatMap((filter) => {
    const rawValue = listing.attributes?.[filter.id];
    if (rawValue === undefined || rawValue === false || rawValue === "") return [];
    const value = filter.type === "checkbox" ? "Да" : filter.options?.find((option) => option.value === rawValue)?.label.ru ?? String(rawValue);
    return [{ label: filter.label.ru, value }];
  }) ?? [];
  const related = listings.filter((item) => item.id !== listing.id && item.categorySlug === listing.categorySlug).slice(0, 4);
  const fallback = `/category/${listing.categorySlug}`;

  return <><Header /><main className="page-shell listing-page">
    <PageHeader fallback={fallback} eyebrow={listing.category} title={listing.title} description={`${listing.location} · ${listing.time}`} />
    <nav className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span>/</span><Link href={fallback}>{listing.category}</Link><span>/</span><span>{listing.title}</span></nav>
    <div className="listing-layout">
      <section>
        <div className="gallery-main"><img src={listing.image} alt={listing.title} /></div>
        <div className="gallery-thumbs">{[1,2,3,4].map((number) => <button type="button" key={number} aria-label={`Фотография ${number}`}><img src={listing.image} alt="" /></button>)}</div>
        {characteristics.length > 0 && <article className="detail-card"><h2>Характеристики</h2><dl className="characteristics-grid">{characteristics.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></article>}
        <article className="detail-card"><h2>Описание</h2><p>{listing.description}</p></article>
        <article className="detail-card"><h2>Местоположение</h2><p><MapPin size={17} /> {listing.location}</p><div className="map-placeholder"><MapPin size={30} /><span>Точное место продавец сообщит в чате</span></div></article>
      </section>
      <aside className="seller-column">
        <article className="price-card">
          <div className="listing-meta"><span>{listing.time}</span><span><Eye size={15} /> 245</span></div>
          <h2>{listing.title}</h2><div className="detail-price">{listing.price}</div><span className="negotiable">Торг уместен</span>
          <div className="detail-actions"><button type="button"><Phone size={19} /> Показать телефон</button><Link href="/messages/nurlan"><MessageCircle size={19} /> Написать продавцу</Link></div>
          <div className="detail-secondary"><button type="button"><Heart size={18} /> В избранное</button><button type="button"><Share2 size={18} /> Поделиться</button></div>
        </article>
        <Link className="seller-card" href="/seller/nurlan"><div className="avatar">Н</div><div><strong>Нурлан</strong><span><BadgeCheck size={15} /> Проверенный профиль</span><small>На Marketo с 2024 года</small></div><div className="rating">★ 4,9 · 18 отзывов</div></Link>
        <button className="report-link" type="button"><Flag size={17} /> Пожаловаться на объявление</button>
      </aside>
    </div>
    <section className="similar-section"><div className="section-heading"><div><span className="section-kicker">В этом разделе</span><h2>Похожие объявления</h2></div><Link href={fallback}>Смотреть все</Link></div>{related.length > 0 ? <div className="listing-grid">{related.map((item) => <ListingCard listing={item} key={item.id} />)}</div> : <div className="empty-state"><h2>Похожих объявлений пока нет</h2><p>Вернитесь в категорию, чтобы посмотреть другие предложения.</p><Link href={fallback}>Открыть категорию</Link></div>}</section>
  </main><MobileNav /></>;
}
