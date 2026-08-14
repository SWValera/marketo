import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { moderationRepository } from "@/lib/data/repositories";

export const metadata: Metadata = { title: "Модерация", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const queue = await moderationRepository.list();
  return <DashboardShell title="Панель модерации" description="Очередь объявлений, жалобы и решения модераторов." active="/admin"><div className="admin-tabs"><button className="is-active" type="button">Объявления <b>{queue.total}</b></button><button type="button">Жалобы</button><button type="button">Пользователи</button><button type="button">Категории</button></div><EmptyState icon={<ShieldCheck size={30} />} title="Очередь модерации пуста" description="Новые заявки появятся после подключения базы данных и публикации реальных объявлений." /></DashboardShell>;
}
