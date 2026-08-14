import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Check, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { listings } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Проверка объявления", robots: { index: false, follow: false } };

export default async function ModerationCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = listings.find((item) => item.id === id);
  if (!listing) notFound();
  return <><Header /><main className="page-shell subpage-main admin-detail-page">
    <PageHeader fallback="/admin" eyebrow="Очередь модерации" title={listing.title} description={`${listing.category} · ${listing.location} · ${listing.price}`} />
    <div className="admin-detail-grid">
      <section className="dashboard-card moderation-case"><h2>Проверка публикации</h2><div className="moderation-case-preview"><span>📦</span><div><strong>{listing.title}</strong><p>{listing.description}</p><Link href={`/listing/${listing.id}-${listing.slug}`}>Открыть страницу <ExternalLink size={15} /></Link></div></div><dl><div><dt>ID объявления</dt><dd>{listing.id}</dd></div><div><dt>Категория</dt><dd>{listing.category}</dd></div><div><dt>Город</dt><dd>{listing.location}</dd></div><div><dt>Цена</dt><dd>{listing.price}</dd></div></dl></section>
      <aside className="dashboard-card moderation-decision"><span className="status-badge"><ShieldCheck size={15} /> Автопроверка пройдена</span><h2>Решение</h2><p>Проверьте описание, цену, фотографии и соответствие категории.</p><label className="form-field"><span>Комментарий модератора</span><textarea rows={5} placeholder="Причина отклонения или внутренняя заметка" /></label><button className="approve-action" type="button"><Check size={18} /> Одобрить</button><button className="reject-action" type="button"><X size={18} /> Отклонить</button><div className="moderation-warning"><AlertTriangle size={17} /> Решение попадёт в историю модерации.</div></aside>
    </div>
  </main><MobileNav /></>;
}
