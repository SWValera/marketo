import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { chatRepository } from "@/lib/data/repositories";

export const metadata: Metadata = { title: "Чаты", robots: { index: false, follow: false } };

export default async function MessagesPage() {
  const chats = await chatRepository.list();
  return <DashboardShell title="Чаты" description="Общайтесь с покупателями и продавцами внутри Marketo." active="/messages"><section className="chat-index-shell"><header><div><h2>Сообщения</h2><p>{chats.total} диалогов</p></div></header><EmptyState icon={<MessageCircle size={30} />} title="Сообщений пока нет" description="Диалоги появятся здесь, когда вы напишете продавцу или получите ответ на объявление." actionHref="/search" actionLabel="Найти объявление" /></section></DashboardShell>;
}
