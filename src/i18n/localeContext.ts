import { createContext } from "react";
import type { AppLocale } from "./types";

export type LocaleContextValue = {
  locale: AppLocale;
  intlLocale: string;
  changeLocale: (locale: AppLocale) => Promise<void>;
  saving: boolean;
};

export const LocaleContext = createContext<LocaleContextValue | null>(null);
