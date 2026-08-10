import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";

export const metadata: Metadata = { title: "Вход и регистрация", robots: { index: false, follow: false } };

export default function LoginPage() {
  return <><Header /><main className="page-shell auth-page"><section><span className="brand"><span className="brand-mark">M</span>Marketo</span><span className="section-kicker">Вход и регистрация</span><h1>Войдите по номеру телефона</h1><p>После подключения Supabase Auth сюда придёт одноразовый SMS-код.</p><label>Номер телефона<input type="tel" defaultValue="+7 " inputMode="tel" /></label><button type="button">Получить код</button><small>Продолжая, вы соглашаетесь с правилами Marketo.</small><Link href="/">Вернуться на главную</Link></section></main><MobileNav /></>;
}
