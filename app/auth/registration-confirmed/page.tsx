import { AppLink as Link } from "@/components/app-link";
import { RegistrationWaiter } from "@/components/registration-waiter";
import { getServerI18n } from "@/lib/i18n/server";
export const metadata = { title: "Подтверждение регистрации", robots: { index: false, follow: false } };
export default async function RegistrationConfirmedPage() {
  const { t } = await getServerI18n();
  return <main id="main-content" tabIndex={-1} className="auth-page"><section className="auth-card">
    <h1>{t("auth.confirmationReceived")}</h1>
    <RegistrationWaiter />
    <Link className="primary-action" href="/login?next=/profile">{t("auth.backToLogin")}</Link>
  </section></main>;
}
