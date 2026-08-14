import type { Metadata } from "next";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { LoginContent } from "@/components/login-content";

export const metadata: Metadata = { title: "Вход и регистрация", robots: { index: false, follow: false } };

export default function LoginPage() {
  return <><Header /><LoginContent /><MobileNav /></>;
}
