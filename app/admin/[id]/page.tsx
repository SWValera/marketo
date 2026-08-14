import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, ShieldCheck, X } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { moderationRepository } from "@/lib/data/repositories";

export const metadata: Metadata = { title: "Проверка объявления", robots: { index: false, follow: false } };

export default async function ModerationCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await moderationRepository.findById(id);
  if (!item) notFound();
  return <><Header /><main className="page-shell subpage-main admin-detail-page"><PageHeader fallback="/admin" eyebrow="Очередь модерации" title={`Кейс ${item.id}`} description={`Статус: ${item.status} · создан ${item.createdAt}`} /><div className="admin-detail-grid"><section className="dashboard-card moderation-case"><h2>Проверка публикации</h2><dl><div><dt>ID объявления</dt><dd>{item.listingId}</dd></div><div><dt>Статус</dt><dd>{item.status}</dd></div></dl></section><aside className="dashboard-card moderation-decision"><span className="status-badge"><ShieldCheck size={15} /> Решение модератора</span><h2>Результат проверки</h2><label className="form-field"><span>Комментарий</span><textarea rows={5} placeholder="Причина решения или внутренняя заметка" /></label><button className="approve-action" type="button"><Check size={18} /> Одобрить</button><button className="reject-action" type="button"><X size={18} /> Отклонить</button></aside></div></main><MobileNav /></>;
}
