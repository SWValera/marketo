import type { Metadata } from "next";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PublishForm } from "@/components/publish-form";

export const metadata: Metadata = { title: "Разместить объявление", robots: { index: false, follow: false } };

export default function PublishPage() {
  return <><Header /><main className="page-shell subpage-main publish-page"><PublishForm /></main><MobileNav /></>;
}
