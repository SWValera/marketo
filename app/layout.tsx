import type { Metadata, Viewport } from "next";
import { PwaRuntime } from "@/components/pwa-runtime";
import { NavigationHistory } from "@/components/navigation-history";
import { I18nProvider } from "@/components/i18n-provider";
import { ReferenceGeographyProvider } from "@/components/reference-geography-provider";
import { getLocale, getServerI18n } from "@/lib/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getServerI18n();
  return {
    metadataBase: new URL("https://marketo.kz"),
    title: { default: t("seo.homeTitle"), template: "%s | Marketo" },
    description: t("seo.homeDescription"),
    applicationName: "Marketo",
    openGraph: {
      title: t("seo.homeTitle"),
      description: t("seo.ogDescription"),
      type: "website",
      locale: locale === "kk" ? "kk_KZ" : "ru_KZ",
      siteName: "Marketo",
    },
    robots: { index: true, follow: true },
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Marketo", statusBarStyle: "default" },
    icons: {
      icon: [
        { url: "/marketo-favicon-v2.svg", type: "image/svg+xml" },
        { url: "/icons/marketo-pwa-192-v2.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icons/marketo-180.png", sizes: "180x180", type: "image/png" }],
      shortcut: "/marketo-favicon-v2.svg",
    },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16a34a" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return <html lang={locale}><body><a className="skip-link" href="#main-content">{locale === "kk" ? "Негізгі мазмұнға өту" : "Перейти к основному содержанию"}</a><I18nProvider initialLocale={locale}><ReferenceGeographyProvider>{children}<NavigationHistory /><PwaRuntime /></ReferenceGeographyProvider></I18nProvider></body></html>;
}
