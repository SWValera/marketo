/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flag, Heart, MapPin, MessageCircle, Phone, Share2, UserRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { getCategoryAttributes, getCategoryBySlug } from "@/lib/catalog-config";
import { listingRepository } from "@/lib/data/repositories";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const listing = await listingRepository.findBySlug(slug);
  return listing ? { title: `${listing.title} — ${listing.priceLabel}`, description: listing.description, alternates: { canonical: `/listing/${slug}` } } : {};
}

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await listingRepository.findBySlug(slug);
  if (!listing) notFound();
  const category = getCategoryBySlug(listing.categorySlug);
  const characteristics = getCategoryAttributes(listing.categorySlug).flatMap((attribute) => {
    const raw = listing.attributes[attribute.id];
    if (raw === undefined || raw === false || raw === "") return [];
    const value = attribute.type === "checkbox" ? "Да" : attribute.options?.find((item) => item.value === raw)?.label.ru ?? String(raw);
    return [{ label: attribute.label.ru, value: `${value}${attribute.unit?.ru ? ` ${attribute.unit.ru}` : ""}` }];
  });
  const fallback = `/category/${listing.categorySlug}`;
  return <><Header categorySlug={listing.categorySlug} searchPlaceholder={category?.searchPlaceholder?.ru} /><main className="page-shell listing-page"><PageHeader fallback={fallback} eyebrow={category?.name.ru ?? "Объявление"} title={listing.title} description={`${listing.locationLabel} · ${listing.publishedLabel}`} /><nav className="breadcrumbs"><Link href="/">Главная</Link><span>/</span><Link href={fallback}>{category?.name.ru ?? "Каталог"}</Link><span>/</span><span>{listing.title}</span></nav><div className="listing-layout"><section>{listing.imageUrl ? <div className="gallery-main"><img src={listing.imageUrl} alt={listing.title} /></div> : <EmptyState title="Фотографии не добавлены" description="Продавец пока не загрузил изображения." />} {characteristics.length ? <article className="detail-card"><h2>Характеристики</h2><dl className="characteristics-grid">{characteristics.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></article> : null}<article className="detail-card"><h2>Описание</h2><p>{listing.description}</p></article><article className="detail-card"><h2>Местоположение</h2><p><MapPin size={17} /> {listing.locationLabel}</p></article></section><aside className="seller-column"><article className="price-card"><h2>{listing.title}</h2><div className="detail-price">{listing.priceLabel}</div><div className="detail-actions"><button type="button"><Phone size={19} /> Показать телефон</button><Link href={`/messages/new?listing=${listing.id}`}><MessageCircle size={19} /> Написать продавцу</Link></div><div className="detail-secondary"><button type="button"><Heart size={18} /> В избранное</button><button type="button"><Share2 size={18} /> Поделиться</button></div></article><Link className="seller-card" href={`/seller/${listing.sellerId}`}><div className="avatar"><UserRound size={22} /></div><div><strong>Профиль продавца</strong><small>Открыть информацию и объявления</small></div></Link><button className="report-link" type="button"><Flag size={17} /> Пожаловаться</button></aside></div></main><MobileNav /></>;
}
