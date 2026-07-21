import { Check, ChevronDown, ChevronRight, Languages } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  localeMetadata,
  supportedLocales,
  type AppLocale,
} from "../i18n/types";
import { useLocale } from "../i18n/useLocale";
import { cn } from "../utils/cn";
import { useToast } from "./ui/toastContext";

const VIEWPORT_GAP = 12;
const DROPDOWN_GAP = 8;

export function LanguageSelector({
  compact = false,
  onSelected,
}: {
  compact?: boolean;
  onSelected?: () => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const { locale, changeLocale, saving } = useLocale();
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const updateDropdownPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const measuredHeight = dropdownRef.current?.offsetHeight ?? 168;
    const availableBelow =
      window.innerHeight - triggerRect.bottom - VIEWPORT_GAP;
    const availableAbove = triggerRect.top - VIEWPORT_GAP;
    const openAbove =
      availableBelow < measuredHeight && availableAbove > availableBelow;
    const availableHeight = openAbove ? availableAbove : availableBelow;
    const width = Math.min(
      triggerRect.width,
      window.innerWidth - VIEWPORT_GAP * 2
    );
    const left = Math.min(
      Math.max(triggerRect.left, VIEWPORT_GAP),
      window.innerWidth - width - VIEWPORT_GAP
    );
    const unclampedTop = openAbove
      ? triggerRect.top - measuredHeight - DROPDOWN_GAP
      : triggerRect.bottom + DROPDOWN_GAP;

    setDropdownStyle({
      left,
      top: Math.min(
        Math.max(unclampedTop, VIEWPORT_GAP),
        window.innerHeight -
          Math.min(measuredHeight, availableHeight) -
          VIEWPORT_GAP
      ),
      width,
      maxHeight: Math.max(120, availableHeight - DROPDOWN_GAP),
      transformOrigin: openAbove ? "bottom" : "top",
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setDropdownStyle(undefined);
      return;
    }
    updateDropdownPosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const handleViewportChange = () => updateDropdownPosition();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  async function select(nextLocale: AppLocale) {
    setOpen(false);
    onSelected?.();
    try {
      await changeLocale(nextLocale);
      notify(i18n.getFixedT(nextLocale)("settings.languageSaved"));
    } catch {
      notify(i18n.getFixedT(nextLocale)("settings.languageSaveFailed"));
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-2xl border border-zinc-200/70 bg-white px-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
          compact &&
            "border-0 bg-transparent px-0 hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={saving}
        onClick={() => setOpen((current) => !current)}
      >
        {compact && (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <Languages className="h-5 w-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {compact ? t("settings.language") : t("settings.interfaceLanguage")}
          </span>
          {!compact && (
            <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
              {t("settings.languageDescription")}
            </span>
          )}
        </span>
        <span className="shrink-0 text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {localeMetadata[locale].name}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400 sm:hidden" />
        <ChevronDown className="hidden h-4 w-4 shrink-0 text-zinc-400 sm:block" />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            className="fixed z-[100] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 opacity-100 shadow-[0_18px_50px_rgba(24,24,27,0.22)] ring-1 ring-black/[0.03] dark:border-zinc-700 dark:bg-zinc-950 dark:ring-white/[0.06]"
            style={{
              ...dropdownStyle,
              visibility: dropdownStyle ? "visible" : "hidden",
            }}
            role="listbox"
            aria-label={t("settings.interfaceLanguage")}
          >
            {supportedLocales.map((item) => (
              <LanguageOption
                key={item}
                locale={item}
                selected={locale === item}
                onSelect={select}
              />
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

function LanguageOption({
  locale,
  selected,
  onSelect,
}: {
  locale: AppLocale;
  selected: boolean;
  onSelect: (locale: AppLocale) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        "flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-medium hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-zinc-900",
        selected && "bg-zinc-100 dark:bg-zinc-900"
      )}
      onClick={() => onSelect(locale)}
    >
      <span>{localeMetadata[locale].name}</span>
      {selected && <Check className="h-5 w-5" />}
    </button>
  );
}
