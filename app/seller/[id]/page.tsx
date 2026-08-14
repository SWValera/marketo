import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, MapPin, MessageCircle, Star } from "lucide-react";
import { Header } from "@/components/header";
import { ListingCard } from "@/components/listing-card";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { listings } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Профиль продавца", alternates: { canonical: "/seller/nurlan" } };

export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== "nurlan") notFound();
  const sellerListings = listings.filter((listing) => listing.categorySlug === "transport").slice(0, 4);
  return <><Header /><main className="page-shell subpage-main seller-public-page">
    <PageHeader fallback="/search" eyebrow="Продавец Marketo" title="Профиль Нурлана" description="Проверенный продавец из Алматы" />
    <section className="seller-profile-card">
      <div className="seller-profile-avatar">Н<span><BadgeCheck size={18} /></span></div>
      <div className="seller-profile-main"><div><h2>Нурлан</h2><span className="verified-badge"><BadgeCheck size={15} /> Профиль подтверждён</span></div><p><MapPin size={16} /> Алматы <span>·</span> <CalendarDays size={16} /> На Marketo с 2024 года</p><div className="seller-rating"><Star size={17} fill="currentColor" /><strong>4,9</strong><span>18 отзывов</span></div></div>
      <Link className="primary-action" href="/messages/nurlan"><MessageCircle size={18} /> Написать</Link>
    </section>
    <section className="seller-stat-grid"><article><strong>5</strong><span>активных объявлений</span></article><article><strong>98%</strong><span>ответов в течение часа</span></article><article><strong>18</strong><span>отзывов покупателей</span></article></section>
    <section className="dashboard-section"><div className="section-heading"><div><span className="section-kicker">Предложения продавца</span><h2>Активные объявления</h2></div><Link href="/category/transport">Весь транспорт</Link></div><div className="listing-grid">{sellerListings.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div></section>
  </main><MobileNav /></>;
}
