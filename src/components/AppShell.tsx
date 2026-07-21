import {
  BarChart3,
  BrainCircuit,
  CreditCard,
  Download,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Moon,
  Settings,
  Sun,
  Tags,
  WalletCards,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../types";
import { cn } from "../utils/cn";
import { tapHaptic } from "../services/haptics";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { useAuth } from "../auth/useAuth";
import { LanguageSelector } from "./LanguageSelector";

export type PageKey =
  | "dashboard"
  | "accounts"
  | "transactions"
  | "categories"
  | "ai"
  | "export"
  | "admin"
  | "settings";

const nav = [
  { key: "dashboard", labelKey: "navigation.overview", icon: LayoutDashboard },
  { key: "accounts", labelKey: "navigation.accounts", icon: WalletCards },
  {
    key: "transactions",
    labelKey: "navigation.transactions",
    icon: CreditCard,
  },
  { key: "categories", labelKey: "navigation.categories", icon: Tags },
  { key: "ai", labelKey: "navigation.aiScan", icon: BrainCircuit },
  { key: "export", labelKey: "navigation.export", icon: Download },
  { key: "admin", labelKey: "navigation.admin", icon: FolderKanban },
  { key: "settings", labelKey: "navigation.settings", icon: Settings },
] satisfies {
  key: PageKey;
  labelKey: string;
  icon: typeof BarChart3;
}[];

const primaryMobileNav = nav.filter((item) =>
  ["dashboard", "accounts", "transactions", "ai"].includes(item.key)
);
const secondaryMobileNav = nav.filter(
  (item) => !primaryMobileNav.some((item2) => item2.key === item.key)
);

export function AppShell({
  page,
  settings,
  onPageChange,
  onThemeChange,
  children,
}: {
  page: PageKey;
  settings: AppSettings;
  onPageChange: (page: PageKey) => void;
  onThemeChange: (theme: AppSettings["theme"]) => void;
  children: React.ReactNode;
}) {
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const moreActive =
    secondaryMobileNav.some((item) => item.key === page) || moreOpen;
  const sidebar = (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-200/50 bg-white/70 p-4 backdrop-blur-2xl dark:border-zinc-800/60 dark:bg-zinc-950/70">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[1.2rem] bg-zinc-950 text-white shadow-[0_12px_28px_rgba(24,24,27,0.15)] dark:bg-white dark:text-zinc-950">
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-xl" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-zinc-500">
              qwadrat Finance Tracker
            </p>
            <p className="text-[14px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              qwadrat Finance Tracker
            </p>
          </div>
        </div>
        <Button
          className="lg:hidden"
          variant="ghost"
          size="icon"
          aria-label={t("common.close")}
          onClick={() => setOpen(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <nav className="space-y-1">
        {nav.map((item) => (
          <button
            key={item.key}
            className={cn(
              "motion-soft flex h-12 w-full items-center gap-3 rounded-[1.1rem] px-3 text-left text-[14px] font-medium",
              page === item.key
                ? "bg-zinc-950 text-white shadow-[0_12px_28px_rgba(24,24,27,0.16)] dark:bg-white dark:text-zinc-950"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900/70"
            )}
            onClick={() => {
              void tapHaptic("selection");
              onPageChange(item.key);
              setOpen(false);
            }}
          >
            <item.icon className="h-[18px] w-[18px]" />
            {t(item.labelKey)}
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-[1.3rem] border border-zinc-200/70 bg-white/70 p-3 dark:border-zinc-800/70 dark:bg-zinc-900/70">
        <p className="ds-caption font-medium text-zinc-500">
          {t("navigation.workspace")}
        </p>
        <p className="mt-1 text-[14px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          qwadrat Finance Tracker
        </p>
      </div>
    </aside>
  );

  return (
    <div className="safe-area-page h-full bg-[var(--app-bg)] text-zinc-950 dark:bg-[var(--app-bg)] dark:text-zinc-50">
      <div className="flex h-full min-h-0">
        <div className="hidden lg:block">{sidebar}</div>
        {open && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-out lg:hidden",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebar}
        </div>
        <main className="ios-scroll min-w-0 flex-1 overflow-x-clip px-4 pb-[var(--mobile-content-bottom-space)] pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 lg:px-8 lg:pb-8 lg:pt-5">
          <div className="mx-auto w-full max-w-7xl">
            <div className="mb-4 hidden items-center justify-between lg:flex">
              <ThemeButton settings={settings} onThemeChange={onThemeChange} />
            </div>
            <div key={page} className="animate-float">
              {children}
            </div>
          </div>
        </main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/70 bg-white/82 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(24,24,27,0.06)] backdrop-blur-2xl lg:hidden dark:border-zinc-800/70 dark:bg-zinc-950/82"
        aria-label={t("navigation.main")}
      >
        <div className="mx-auto grid h-[var(--mobile-nav-height)] max-w-[640px] grid-cols-5 px-1">
          {primaryMobileNav.map((item) => (
            <button
              key={item.key}
              className={cn(
                "relative flex min-h-11 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 motion-reduce:transition-none",
                page === item.key
                  ? "font-semibold text-zinc-950 dark:text-white"
                  : "font-medium text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
              )}
              onClick={() => {
                void tapHaptic("selection");
                onPageChange(item.key);
              }}
              aria-label={t(item.labelKey)}
              aria-current={page === item.key ? "page" : undefined}
            >
              <span
                className={cn(
                  "relative grid h-7 min-w-9 place-items-center transition-transform duration-200 motion-reduce:transition-none",
                  page === item.key && "scale-[1.04]"
                )}
              >
                <span
                  className={cn(
                    "absolute -top-2 h-0.5 w-5 rounded-full bg-zinc-950 opacity-0 transition-opacity dark:bg-white",
                    page === item.key && "opacity-100"
                  )}
                />
                <item.icon className="h-[22px] w-[22px]" />
              </span>
              <span className="max-w-full whitespace-nowrap text-center leading-none">
                {t(item.labelKey)}
              </span>
            </button>
          ))}
          <button
            className={cn(
              "relative flex min-h-11 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 motion-reduce:transition-none",
              moreActive
                ? "font-semibold text-zinc-950 dark:text-white"
                : "font-medium text-zinc-400 dark:text-zinc-500"
            )}
            onClick={() => {
              void tapHaptic("selection");
              setMoreOpen(true);
            }}
            aria-label={t("navigation.more")}
            aria-current={moreActive ? "page" : undefined}
          >
            <span
              className={cn(
                "relative grid h-7 min-w-9 place-items-center transition-transform duration-200 motion-reduce:transition-none",
                moreActive && "scale-[1.04]"
              )}
            >
              <span
                className={cn(
                  "absolute -top-2 h-0.5 w-5 rounded-full bg-zinc-950 opacity-0 transition-opacity dark:bg-white",
                  moreActive && "opacity-100"
                )}
              />
              <Menu className="h-[22px] w-[22px]" />
            </span>
            <span className="leading-none">{t("navigation.more")}</span>
          </button>
        </div>
      </nav>
      <Modal
        open={moreOpen}
        title={t("navigation.more")}
        description={t("navigation.moreDescription")}
        onClose={() => setMoreOpen(false)}
        className="sm:max-w-md"
      >
        <div className="grid gap-3 animate-sheet">
          {secondaryMobileNav.map((item) => (
            <button
              key={item.key}
              className="motion-soft flex min-h-[76px] items-center justify-between rounded-[1.4rem] border border-zinc-200/70 bg-white/90 px-4 py-4 text-left text-zinc-900 hover:bg-white dark:border-zinc-800/70 dark:bg-zinc-900/90 dark:text-zinc-50 dark:hover:bg-zinc-950"
              onClick={() => {
                void tapHaptic("selection");
                onPageChange(item.key);
                setMoreOpen(false);
              }}
            >
              <span className="flex min-w-0 items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[1.1rem] bg-zinc-100 dark:bg-zinc-800">
                  <item.icon className="h-6 w-6 text-zinc-600 dark:text-zinc-300" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-semibold">
                    {t(item.labelKey)}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-normal text-zinc-500">
                    {t(
                      `navigation.descriptions.${
                        item.key === "ai" ? "default" : item.key
                      }`
                    )}
                  </span>
                </span>
              </span>
              <span className="text-xl text-zinc-300">›</span>
            </button>
          ))}
        </div>
        <div className="motion-soft mt-4 rounded-[1.25rem] border border-zinc-200/70 bg-white/80 px-4 py-1 dark:border-zinc-800/70 dark:bg-zinc-950/80">
          <LanguageSelector compact onSelected={() => setMoreOpen(false)} />
        </div>
        <div className="motion-soft mt-4 flex items-center justify-between rounded-[1.25rem] border border-zinc-200/70 bg-white/80 px-4 py-3 dark:border-zinc-800/70 dark:bg-zinc-950/80">
          <div>
            <p className="text-[14px] font-medium text-zinc-950 dark:text-zinc-50">
              {t("navigation.theme")}
            </p>
            <p className="ds-caption text-zinc-500">
              {t("navigation.themeDescription")}
            </p>
          </div>
          <ThemeButton settings={settings} onThemeChange={onThemeChange} />
        </div>
        <Button
          variant="secondary"
          className="motion-soft mt-3 h-12 w-full justify-between rounded-[1.25rem] border-zinc-200/70 bg-white/80 px-4 text-[14px] font-medium text-zinc-950 dark:border-zinc-800/70 dark:bg-zinc-950/80 dark:text-zinc-50"
          disabled={signingOut}
          onClick={async () => {
            void tapHaptic("selection");
            setSigningOut(true);
            let ok = false;
            try {
              await signOut();
              ok = true;
            } catch {
            } finally {
              setSigningOut(false);
              if (ok) setMoreOpen(false);
            }
          }}
        >
          <span>{t("navigation.signOut")}</span>
          <span className="text-zinc-400">{signingOut ? "..." : "↗"}</span>
        </Button>
      </Modal>
    </div>
  );
}

function ThemeButton({
  settings,
  onThemeChange,
}: {
  settings: AppSettings;
  onThemeChange: (theme: AppSettings["theme"]) => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="secondary"
      size="icon"
      aria-label={t("navigation.toggleTheme")}
      className="motion-soft shadow-[0_10px_24px_rgba(24,24,27,0.06)]"
      onClick={() => {
        void tapHaptic("selection");
        onThemeChange(settings.theme === "dark" ? "light" : "dark");
      }}
    >
      {settings.theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
