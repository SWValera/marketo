import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";

export const metadata: Metadata = { title: "Нет подключения", robots: { index: false, follow: false } };

export default function OfflinePage() {
  return <><Header /><main className="page-shell subpage-main"><EmptyState icon={<WifiOff size={30} />} title="Нет подключения к интернету" description="Проверьте сеть и обновите страницу. Установленное приложение сохранит оболочку и откроет новые данные после восстановления связи." actionHref="/" actionLabel="Попробовать снова" /></main><MobileNav /></>;
}
