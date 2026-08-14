import type { Metadata, Viewport } from "next";
import { PwaRuntime } from "@/components/pwa-runtime";
import { NavigationHistory } from "@/components/navigation-history";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://marketo.kz"),
  title: { default: "Marketo — объявления Казахстана", template: "%s | Marketo" },
  description: "Покупайте и продавайте товары, транспорт, недвижимость и услуги по всему Казахстану.",
  applicationName: "Marketo",
  openGraph: {
    title: "Marketo — объявления Казахстана",
    description: "Тысячи актуальных объявлений рядом с вами.",
    type: "website",
    locale: "ru_KZ",
    siteName: "Marketo",
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Marketo",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/marketo-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/marketo-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16a34a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}<NavigationHistory /><PwaRuntime /></body></html>;
}
