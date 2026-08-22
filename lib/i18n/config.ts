import type { Locale } from "@/lib/i18n/messages";

export type LocalizedValue = { ru: string; kk: string };

export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "marketo-locale";
export const LOCALE_STORAGE_KEY = "marketo-locale";
export const SUPPORTED_LOCALES: readonly Locale[] = ["ru", "kk"];

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "kk" ? "kk" : DEFAULT_LOCALE;
}

export function localize(value: LocalizedValue | null | undefined, locale: Locale) {
  if (!value) return "";
  return value[locale] || value.ru;
}

export function localeTag(locale: Locale) {
  return locale === "kk" ? "kk-KZ" : "ru-KZ";
}
