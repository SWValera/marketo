import Link from "next/link";
import { SearchX } from "lucide-react";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { getServerI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getServerI18n();
  return <><Header /><main className="state-page"><section className="state-card"><span className="state-icon"><SearchX /></span><h1>{t("state.notFound")}</h1><p>{t("state.notFoundNote")}</p><Link className="primary-button" href="/">{t("state.returnHome")}</Link></section></main><MobileNav /></>;
}
