import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { metadataOrigin, installationOrigin, SITE_ORIGIN } from "@/lib/site-origin";
import { PwaRuntime } from "@/components/pwa-runtime";
import { NavigationHistory } from "@/components/navigation-history";
import { NavigationFeedback } from "@/components/navigation-feedback";
import { I18nProvider } from "@/components/i18n-provider";
import { ReferenceGeographyProvider } from "@/components/reference-geography-provider";
import { getLocale, getServerI18n } from "@/lib/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getServerI18n();
  const requestHeaders = await headers();
  const asset = (path: string) => new URL(path, installationOrigin(requestHeaders.get("host"))).href;
  return {
    metadataBase: metadataOrigin(requestHeaders.get("host")),
    title: { default: t("seo.homeTitle"), template: "%s | JEVU" },
    description: t("seo.homeDescription"),
    applicationName: "JEVU",
    openGraph: {
      title: t("seo.homeTitle"),
      description: t("seo.ogDescription"),
      type: "website",
      locale: locale === "kk" ? "kk_KZ" : "ru_KZ",
      siteName: "JEVU",
      url: SITE_ORIGIN,
      images: [{ url: `${SITE_ORIGIN}/icons/jevu-512-v1.png`, width: 512, height: 512, alt: "JEVU" }],
    },
    twitter: { card: "summary", title: "JEVU", description: t("seo.ogDescription"), images: [`${SITE_ORIGIN}/icons/jevu-512-v1.png`] },
    robots: { index: true, follow: true },
    manifest: asset("/manifest.webmanifest"),
    appleWebApp: { capable: true, title: "JEVU", statusBarStyle: "default" },
    icons: {
      icon: [
        { url: asset("/favicon.ico"), type: "image/x-icon", sizes: "16x16 32x32 48x48" },
        { url: asset("/icons/jevu-16-v1.png"), sizes: "16x16", type: "image/png" },
        { url: asset("/icons/jevu-32-v1.png"), sizes: "32x32", type: "image/png" },
      ],
      apple: [{ url: asset("/icons/apple-touch-icon.png"), sizes: "180x180", type: "image/png" }],
      shortcut: asset("/favicon.ico"),
    },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16a34a" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const identity = { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": `${SITE_ORIGIN}/#organization`, name: "JEVU", url: SITE_ORIGIN, logo: `${SITE_ORIGIN}/icons/jevu-512-v1.png` },
    { "@type": "WebSite", "@id": `${SITE_ORIGIN}/#website`, name: "JEVU", url: SITE_ORIGIN, publisher: { "@id": `${SITE_ORIGIN}/#organization` }, potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE_ORIGIN}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
    { "@type": "WebApplication", name: "JEVU", url: SITE_ORIGIN, applicationCategory: "ShoppingApplication", operatingSystem: "Web, iOS, Android", image: `${SITE_ORIGIN}/icons/jevu-512-v1.png` },
  ] };
  return <html lang={locale}><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(identity).replace(/</g,"\\u003c")}} /><a className="skip-link" href="#main-content">{locale === "kk" ? "Негізгі мазмұнға өту" : "Перейти к основному содержанию"}</a><I18nProvider initialLocale={locale}><ReferenceGeographyProvider>{children}<NavigationHistory /><NavigationFeedback /><PwaRuntime /></ReferenceGeographyProvider></I18nProvider></body></html>;
}
