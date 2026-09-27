import type { Locale } from "./messages";

// Fixed, non-user-specific formatters. Recreating ICU formatters per card was
// a CPU hot path in both public detail and the owner's listing batch.
const create = (locale: Locale) => {
  const tag = locale === "kk" ? "kk-KZ" : "ru-KZ";
  const date: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return {
    numbers: [0, 2].map(maximumFractionDigits => new Intl.NumberFormat(tag, { maximumFractionDigits })),
    published: new Intl.DateTimeFormat(tag, date),
    moderation: new Intl.DateTimeFormat(tag, { ...date, hour: "2-digit", minute: "2-digit" }),
    owner: new Intl.DateTimeFormat(tag, { ...date, timeZone: "Asia/Almaty", timeZoneName: "short", hour: "2-digit", minute: "2-digit" }),
  };
};
const formatters = { ru: create("ru"), kk: create("kk") };

export function listingNumber(value: number, locale: Locale, precision: 0 | 2) {
  return formatters[locale].numbers[precision === 0 ? 0 : 1].format(value);
}

export function listingDate(value: string, locale: Locale, kind: "published" | "moderation" | "owner") {
  return formatters[locale][kind].format(new Date(value));
}
