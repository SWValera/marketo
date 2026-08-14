import { localeTag } from "@/lib/i18n/config";
import type { Locale } from "@/lib/i18n/messages";

export function formatCurrency(amount: number, locale: Locale) {
  return `${new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 0 }).format(amount)} ₸`;
}

export function formatDate(value: Date | number | string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, locale: Locale) {
  return new Intl.RelativeTimeFormat(localeTag(locale), { numeric: "auto" }).format(value, unit);
}
