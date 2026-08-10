import type { Metadata } from "next";
import { Check, Eye, Flag, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Модерация", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <DashboardShell title="Панель модерации" description="Тестовый интерфейс проверки объявлений и жалоб." active="/admin"><div className="admin-stats"><article><strong>12</strong><span>на проверке</span></article><article><strong>3</strong><span>жалобы</span></article><article><strong>48</strong><span>одобрено сегодня</span></article></div><div className="dashboard-card moderation-table"><header><h2>Очередь объявлений</h2><span><Flag size={17} /> Требуют внимания</span></header><div className="moderation-row"><div><strong>Toyota Camry 2020</strong><small>Транспорт · Алматы · Айдос</small></div><span>8 500 000 ₸</span><div><button type="button" aria-label="Просмотреть"><Eye size={17} /></button><button type="button" aria-label="Одобрить"><Check size={17} /></button><button type="button" aria-label="Отклонить"><X size={17} /></button></div></div></div></DashboardShell>;
}
