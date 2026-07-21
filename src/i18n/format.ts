import i18n from ".";
import { localeMetadata, normalizeLocale } from "./types";

export function currentIntlLocale() {
  return localeMetadata[normalizeLocale(i18n.language) ?? "ru"].intl;
}

export function localizedNumber(
  value: number,
  options?: Intl.NumberFormatOptions
) {
  return new Intl.NumberFormat(currentIntlLocale(), options).format(value);
}

export function localizedDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }
) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(currentIntlLocale(), options).format(date);
}
