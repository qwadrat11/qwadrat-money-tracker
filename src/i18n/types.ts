export const supportedLocales = ["ru", "uk", "en"] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const localeMetadata: Record<
  AppLocale,
  { name: string; short: string; intl: string }
> = {
  ru: { name: "Русский", short: "RU", intl: "ru-RU" },
  uk: { name: "Українська", short: "UA", intl: "uk-UA" },
  en: { name: "English", short: "EN", intl: "en-US" },
};

export function normalizeLocale(
  value: string | null | undefined
): AppLocale | null {
  const language = value?.trim().toLowerCase().split(/[-_]/)[0];
  return supportedLocales.includes(language as AppLocale)
    ? (language as AppLocale)
    : null;
}

export function detectDeviceLocale(
  languages: readonly string[] = navigator.languages
): AppLocale {
  for (const language of languages) {
    const normalized = normalizeLocale(language);
    if (normalized === "uk" || normalized === "en" || normalized === "ru")
      return normalized;
  }
  return "ru";
}

export function resolveLocale(
  profileLocale: string | null | undefined,
  localLocale: string | null | undefined,
  browserLanguages: readonly string[]
): AppLocale {
  return (
    normalizeLocale(profileLocale) ??
    normalizeLocale(localLocale) ??
    detectDeviceLocale(browserLanguages)
  );
}
