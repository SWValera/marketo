import type { LocalizedText } from "@/lib/catalog-config";
import type { LocalizedName } from "@/lib/geography";
import type { Locale } from "@/lib/i18n/messages";

export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "marketo-locale";
export const LOCALE_STORAGE_KEY = "marketo-locale";
export const SUPPORTED_LOCALES: readonly Locale[] = ["ru", "kk"];

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "kk" ? "kk" : DEFAULT_LOCALE;
}

export function localize(value: LocalizedText | LocalizedName | undefined, locale: Locale) {
  if (!value) return "";
  return value[locale] || value.ru;
}

export function localeTag(locale: Locale) {
  return locale === "kk" ? "kk-KZ" : "ru-KZ";
}
