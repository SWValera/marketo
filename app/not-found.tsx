import Link from "next/link";
import { SearchX } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";

export default function NotFound() {
  return <><Header /><main className="state-page"><section className="state-card"><span className="state-icon"><SearchX /></span><h1>Страница не найдена</h1><p>Возможно, объявление уже снято с публикации или адрес изменился.</p><Link className="primary-button" href="/">Вернуться на главную</Link></section></main><MobileNav /></>;
}
