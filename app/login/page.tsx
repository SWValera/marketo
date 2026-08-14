import type { Metadata } from "next";
import { LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { BackButton } from "@/components/back-button";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";

export const metadata: Metadata = { title: "Вход и регистрация", robots: { index: false, follow: false } };

export default function LoginPage() {
  return <><Header /><main className="auth-page"><section className="auth-card"><BackButton className="auth-back" fallback="/" label="На главную" /><div className="auth-brand"><span className="brand-mark">M</span></div><span className="section-kicker">Вход и регистрация</span><h1>Добро пожаловать в Marketo</h1><p>Введите номер телефона. После подключения Supabase Auth Marketo будет отправлять одноразовый код для безопасного входа.</p><AuthForm /><div className="auth-benefits"><span><ShieldCheck size={18} /> Безопасный вход без пароля</span><span><Smartphone size={18} /> Один аккаунт на всех устройствах</span><span><LockKeyhole size={18} /> Номер не публикуется без вашего согласия</span></div><small className="auth-terms">Продолжая, вы соглашаетесь с правилами сервиса и политикой конфиденциальности.</small></section></main><MobileNav /></>;
}
