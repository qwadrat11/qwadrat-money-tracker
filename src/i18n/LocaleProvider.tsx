import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/useAuth";
import i18n, { localeStorageKey } from ".";
import { localeMetadata, normalizeLocale, type AppLocale } from "./types";
import { LocaleContext } from "./localeContext";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { i18n: reactI18n } = useTranslation();
  const [locale, setLocale] = useState<AppLocale>(
    () => normalizeLocale(reactI18n.language) ?? "ru"
  );
  const [saving, setSaving] = useState(false);
  const manualSelectionVersion = useRef(0);

  useEffect(() => {
    let active = true;
    if (!user || !supabase) return;
    const requestSelectionVersion = manualSelectionVersion.current;
    void supabase
      .from("profiles")
      .select("locale")
      .eq("id", user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (
          !active ||
          error ||
          requestSelectionVersion !== manualSelectionVersion.current
        )
          return;
        const profileLocale = normalizeLocale(
          (data as { locale?: string } | null)?.locale
        );
        if (!profileLocale) return;
        localStorage.setItem(`${localeStorageKey}:${user.id}`, profileLocale);
        localStorage.setItem(localeStorageKey, profileLocale);
        setLocale(profileLocale);
        await reactI18n.changeLanguage(profileLocale);
      });
    return () => {
      active = false;
    };
  }, [reactI18n, user]);

  const changeLocale = useCallback(
    async (nextLocale: AppLocale) => {
      manualSelectionVersion.current += 1;
      setLocale(nextLocale);
      localStorage.setItem(localeStorageKey, nextLocale);
      if (user)
        localStorage.setItem(`${localeStorageKey}:${user.id}`, nextLocale);
      await i18n.changeLanguage(nextLocale);
      document.documentElement.lang = nextLocale;
      if (!user || !supabase) return;
      setSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({ locale: nextLocale })
        .eq("id", user.id);
      setSaving(false);
      if (error) {
        throw new Error("LOCALE_SAVE_FAILED");
      }
    },
    [user]
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      intlLocale: localeMetadata[locale].intl,
      changeLocale,
      saving,
    }),
    [changeLocale, locale, saving]
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
