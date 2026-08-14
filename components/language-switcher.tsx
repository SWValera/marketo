"use client";

import { useI18n } from "@/components/i18n-provider";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={`language-switcher ${compact ? "compact" : ""}`} role="group" aria-label={t("language.switch")}>
      <button type="button" className={locale === "ru" ? "is-active" : ""} aria-pressed={locale === "ru"} onClick={() => setLocale("ru")}>RU</button>
      <button type="button" className={locale === "kk" ? "is-active" : ""} aria-pressed={locale === "kk"} onClick={() => setLocale("kk")}>ҚАЗ</button>
    </div>
  );
}
