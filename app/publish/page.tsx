import type { Metadata } from "next";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PublishForm } from "@/components/publish-form";

export const metadata: Metadata = { title: "Разместить объявление", robots: { index: false, follow: false } };

export default function PublishPage() {
  return <><Header /><main className="page-shell subpage-main publish-page"><header className="simple-page-heading"><span className="section-kicker">Новое объявление</span><h1>Разместить объявление</h1><p>Заполните четыре коротких шага. Перед публикацией вы сможете проверить все данные.</p></header><PublishForm /><p className="publish-security-note">Marketo проверяет объявления перед публикацией и никогда не запрашивает данные банковской карты для размещения.</p></main><MobileNav /></>;
}
