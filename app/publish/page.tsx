import type { Metadata } from "next";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PublishForm } from "@/components/publish-form";
import { getCategoryReferences } from "@/lib/reference-data/server";

export const metadata: Metadata = { title: "Разместить объявление", robots: { index: false, follow: false } };

export default async function PublishPage() {
  const catalog = await getCategoryReferences();
  return <><Header /><main className="page-shell subpage-main publish-page"><PublishForm catalog={catalog} /></main><MobileNav /></>;
}
