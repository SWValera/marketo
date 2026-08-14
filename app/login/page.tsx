import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";

export const metadata: Metadata = { title: "Вход и регистрация", robots: { index: false, follow: false } };

export default function LoginPage() {
  return <><Header /><main className="auth-page"><section className="auth-card"><Link className="auth-back" href="/"><ArrowLeft size={17} /> На главную</Link><div className="auth-brand"><span className="brand-mark">M</span></div><span className="section-kicker">Вход и регистрация</span><h1>Добро пожаловать в Marketo</h1><p>Введите номер телефона. Мы отправим одноразовый код для безопасного входа.</p><label className="form-field"><span>Номер телефона</span><div className="phone-field"><span>🇰🇿 +7</span><input type="tel" placeholder="700 123 45 67" inputMode="tel" autoComplete="tel" /></div></label><button className="auth-submit" type="button">Получить код</button><div className="auth-benefits"><span><ShieldCheck size={18} /> Безопасный вход без пароля</span><span><Smartphone size={18} /> Один аккаунт на всех устройствах</span><span><LockKeyhole size={18} /> Мы не передаём ваш номер продавцам</span></div><small className="auth-terms">Продолжая, вы соглашаетесь с правилами сервиса и политикой конфиденциальности.</small></section></main><MobileNav /></>;
}
