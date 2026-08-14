import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Check, Eye, FileCheck2, Flag, UsersRound, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Модерация", robots: { index: false, follow: false } };

export default function AdminPage() {
  const rows = [{ id: "mk-10345", title: "Toyota Camry 2020", meta: "Транспорт · Алматы · Нурлан", price: "8 500 000 ₸" }, { id: "mk-10347", title: "iPhone 13 128GB", meta: "Электроника · Алматы · Руслан", price: "350 000 ₸" }, { id: "mk-10355", title: "2-комнатная квартира", meta: "Недвижимость · Астана · Марина", price: "28 500 000 ₸" }];
  return <DashboardShell title="Панель модерации" description="Проверяйте объявления, жалобы и состояние площадки." active="/admin">
    <div className="admin-stats"><article><span><Flag size={20} /></span><div><strong>12</strong><small>на проверке</small></div></article><article><span className="warning"><AlertTriangle size={20} /></span><div><strong>3</strong><small>активные жалобы</small></div></article><article><span><FileCheck2 size={20} /></span><div><strong>48</strong><small>одобрено сегодня</small></div></article><article><span><UsersRound size={20} /></span><div><strong>2 418</strong><small>пользователей</small></div></article></div>
    <div className="admin-tabs"><button className="is-active" type="button">Объявления <b>12</b></button><button type="button">Жалобы <b>3</b></button><button type="button">Пользователи</button><button type="button">Категории</button></div>
    <div className="dashboard-card moderation-table"><header><div><h2>Очередь объявлений</h2><p>Новые публикации, требующие ручной проверки</p></div><span><Flag size={17} /> Требуют внимания</span></header>{rows.map(({ id, title, meta, price }) => <div className="moderation-row" key={id}><div className="moderation-preview">📦</div><div><strong>{title}</strong><small>{meta}</small></div><span>{price}</span><div className="moderation-actions"><Link href={`/admin/${id}`} aria-label="Просмотреть"><Eye size={17} /></Link><button className="approve" type="button" aria-label="Одобрить"><Check size={17} /></button><button className="reject" type="button" aria-label="Отклонить"><X size={17} /></button></div></div>)}</div>
  </DashboardShell>;
}
