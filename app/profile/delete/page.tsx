import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Header } from "@/components/header";
import { PageHeader } from "@/components/page-header";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { getCurrentAuthContext } from "@/lib/auth/context";
import { getServerI18n } from "@/lib/i18n/server";
export const metadata: Metadata = {title: "Удаление профиля", robots: {index: false, follow: false}};
export const dynamic = "force-dynamic";
export default async function DeleteProfilePage() {
  const [{t}, account, cookieStore] = await Promise.all([getServerI18n(), getCurrentAuthContext(), cookies()]);
  const resume = /^[a-f0-9]{64}$/.test(cookieStore.get("__Host-marketo-account-deletion")?.value ?? "");
  return <><Header /><main id="main-content" tabIndex={-1} className="page-shell subpage-main account-delete-page">
    <PageHeader fallback="/profile" title={t("accountDelete.title")} description={t("accountDelete.description")} />
    <section className="dashboard-card">{resume || account.status === "authenticated" ? <DeleteAccountForm resume={resume} />
      : <><p>{t(account.status === "error" ? "accountDelete.unavailable" : "accountDelete.signIn")}</p><a className="primary-action" href="/login?next=/profile/delete">{t("profile.login")}</a></>}
    </section></main></>;
}
