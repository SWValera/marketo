import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CircleHelp, MessageCircle, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Помощь", robots: { index: false, follow: false } };

export default function HelpPage() {
  return (
    <DashboardShell active="/help" title="Помощь" description="Ответы на частые вопросы и безопасная связь с поддержкой Marketo.">
      <section className="dashboard-card help-grid">
        <Link className="help-card" href="/publish"><BookOpen size={24} /><strong>Как подать объявление</strong><span>Фото, описание, цена и правила публикации.</span></Link>
        <Link className="help-card" href="/messages"><MessageCircle size={24} /><strong>Покупки и общение</strong><span>Как договориться с продавцом и не пропустить ответ.</span></Link>
        <Link className="help-card" href="/help"><ShieldCheck size={24} /><strong>Безопасность сделки</strong><span>Защита аккаунта и признаки мошенничества.</span></Link>
        <Link className="help-card" href="/login"><CircleHelp size={24} /><strong>Связаться с поддержкой</strong><span>Канал поддержки будет доступен после подключения аккаунта.</span></Link>
      </section>
    </DashboardShell>
  );
}
