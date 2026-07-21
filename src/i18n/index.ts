import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { ru } from "./locales/ru";
import { uk } from "./locales/uk";
import { detectDeviceLocale, normalizeLocale } from "./types";

export const localeStorageKey = "qwadrat-finance-tracker:locale";

function initialLocale() {
  if (typeof window === "undefined") return "ru";
  return (
    normalizeLocale(localStorage.getItem(localeStorageKey)) ??
    detectDeviceLocale()
  );
}

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    uk: { translation: uk },
    en: { translation: en },
  },
  lng: initialLocale(),
  fallbackLng: "ru",
  supportedLngs: ["ru", "uk", "en"],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
