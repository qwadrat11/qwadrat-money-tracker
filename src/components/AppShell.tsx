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
} from 'lucide-react'
import { useState } from 'react'
import type { AppSettings } from '../types'
import { cn } from '../utils/cn'
import { tapHaptic } from '../services/haptics'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { useAuth } from '../auth/useAuth'

export type PageKey = 'dashboard' | 'accounts' | 'transactions' | 'categories' | 'ai' | 'export' | 'admin' | 'settings'

const nav = [
  { key: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
  { key: 'accounts', label: 'Счета', icon: WalletCards },
  { key: 'transactions', label: 'Операции', mobileLabel: 'Опер.', icon: CreditCard },
  { key: 'categories', label: 'Категории', icon: Tags },
  { key: 'ai', label: 'AI-скан', icon: BrainCircuit },
  { key: 'export', label: 'Экспорт', icon: Download },
  { key: 'admin', label: 'Админ', icon: FolderKanban },
  { key: 'settings', label: 'Настройки', icon: Settings },
] satisfies { key: PageKey; label: string; mobileLabel?: string; icon: typeof BarChart3 }[]

const primaryMobileNav = nav.filter((item) => ['dashboard', 'accounts', 'transactions', 'ai'].includes(item.key))
const secondaryMobileNav = nav.filter((item) => !primaryMobileNav.some((item2) => item2.key === item.key))

export function AppShell({
  page,
  settings,
  onPageChange,
  onThemeChange,
  children,
}: {
  page: PageKey
  settings: AppSettings
  onPageChange: (page: PageKey) => void
  onThemeChange: (theme: AppSettings['theme']) => void
  children: React.ReactNode
}) {
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const activeMobileIndex = primaryMobileNav.findIndex((item) => item.key === page)
  const activeMobilePosition = activeMobileIndex >= 0 ? activeMobileIndex : 0
  const sidebar = (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-200/50 bg-white/70 p-4 backdrop-blur-2xl dark:border-zinc-800/60 dark:bg-zinc-950/70">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[1.2rem] bg-zinc-950 text-white shadow-[0_12px_28px_rgba(24,24,27,0.15)] dark:bg-white dark:text-zinc-950">
            <WalletCards className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-zinc-500">Ledger</p>
            <p className="text-[14px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{settings.workspaceName || 'Личное пространство'}</p>
          </div>
        </div>
        <Button className="lg:hidden" variant="ghost" size="icon" aria-label="Закрыть меню" onClick={() => setOpen(false)}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <nav className="space-y-1">
        {nav.map((item) => (
          <button
            key={item.key}
            className={cn(
              'motion-soft flex h-12 w-full items-center gap-3 rounded-[1.1rem] px-3 text-left text-[14px] font-medium',
              page === item.key
                ? 'bg-zinc-950 text-white shadow-[0_12px_28px_rgba(24,24,27,0.16)] dark:bg-white dark:text-zinc-950'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900/70',
            )}
            onClick={() => {
              void tapHaptic('selection')
              onPageChange(item.key)
              setOpen(false)
            }}
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-[1.3rem] border border-zinc-200/70 bg-white/70 p-3 dark:border-zinc-800/70 dark:bg-zinc-900/70">
        <p className="ds-caption font-medium text-zinc-500">Рабочее пространство</p>
        <p className="mt-1 text-[14px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{settings.workspaceName}</p>
      </div>
    </aside>
  )

  return (
    <div className="safe-area-page h-full bg-[var(--app-bg)] text-zinc-950 dark:bg-[var(--app-bg)] dark:text-zinc-50">
      <div className="flex h-full min-h-0">
        <div className="hidden lg:block">{sidebar}</div>
        {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-out lg:hidden',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {sidebar}
        </div>
        <main className="ios-scroll min-w-0 flex-1 overflow-x-clip px-4 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 lg:px-8 lg:pb-8 lg:pt-5">
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
      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2 lg:hidden">
        <div className="mx-auto max-w-[640px] ds-surface rounded-[1.7rem] p-1.5 shadow-[0_18px_48px_rgba(24,24,27,0.1)]">
          <div className="relative grid grid-cols-5 gap-1">
            <div
              className={cn(
                'absolute inset-y-1 left-1 w-[calc(20%-0.1rem)] rounded-[1.35rem] bg-zinc-950/95 shadow-[0_10px_24px_rgba(24,24,27,0.14)] transition-[transform,opacity,background-color,box-shadow] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] dark:bg-white/95',
                activeMobileIndex >= 0 ? 'opacity-100' : 'opacity-0',
              )}
              style={{ transform: `translateX(${activeMobilePosition * 100}%)` }}
              aria-hidden="true"
            />
            {primaryMobileNav.map((item) => (
              <button
                key={item.key}
                className={cn(
                  'motion-soft relative z-10 flex min-h-[4.35rem] flex-col items-center justify-center gap-1 rounded-[1.35rem] px-1 text-[11px] font-medium leading-none active:scale-[0.97]',
                  page === item.key
                    ? 'text-white dark:text-zinc-950'
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
                )}
                onClick={() => {
                  void tapHaptic('selection')
                  onPageChange(item.key)
                }}
                >
                  <item.icon className="h-[18px] w-[18px] transition-transform duration-300 ease-out" />
                <span className="max-w-full truncate text-center leading-none">{item.mobileLabel ?? item.label}</span>
              </button>
            ))}
            <button
              className="motion-soft relative z-10 flex min-h-[4.35rem] flex-col items-center justify-center gap-1 rounded-[1.35rem] px-1 text-[11px] font-medium leading-none text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              onClick={() => {
                void tapHaptic('selection')
                setMoreOpen(true)
              }}
            >
              <Menu className="h-[18px] w-[18px]" />
              <span className="leading-none">Еще</span>
            </button>
          </div>
        </div>
      </div>
      <Modal open={moreOpen} title="Еще" description="Дополнительные разделы и настройки." onClose={() => setMoreOpen(false)} className="sm:max-w-md">
        <div className="grid gap-2 animate-sheet">
          {secondaryMobileNav.map((item) => (
            <button
              key={item.key}
            className="motion-soft flex items-center justify-between rounded-[1.25rem] border border-zinc-200/70 bg-white/80 px-4 py-3 text-left text-[14px] font-medium text-zinc-900 hover:bg-white dark:border-zinc-800/70 dark:bg-zinc-900/80 dark:text-zinc-50 dark:hover:bg-zinc-950"
              onClick={() => {
                void tapHaptic('selection')
                onPageChange(item.key)
                setMoreOpen(false)
              }}
            >
              <span className="flex items-center gap-3">
                <item.icon className="h-[18px] w-[18px] text-zinc-500" />
                {item.label}
              </span>
            </button>
          ))}
        </div>
        <div className="motion-soft mt-4 flex items-center justify-between rounded-[1.25rem] border border-zinc-200/70 bg-white/80 px-4 py-3 dark:border-zinc-800/70 dark:bg-zinc-950/80">
          <div>
            <p className="text-[14px] font-medium text-zinc-950 dark:text-zinc-50">Тема</p>
            <p className="ds-caption text-zinc-500">Переключение светлой и темной темы</p>
          </div>
          <ThemeButton settings={settings} onThemeChange={onThemeChange} />
        </div>
        <Button
          variant="secondary"
          className="motion-soft mt-3 h-12 w-full justify-between rounded-[1.25rem] border-zinc-200/70 bg-white/80 px-4 text-[14px] font-medium text-zinc-950 dark:border-zinc-800/70 dark:bg-zinc-950/80 dark:text-zinc-50"
          disabled={signingOut}
          onClick={async () => {
            void tapHaptic('selection')
            setSigningOut(true)
            let ok = false
            try {
              await signOut()
              ok = true
            } catch {
            } finally {
              setSigningOut(false)
              if (ok) setMoreOpen(false)
            }
          }}
        >
          <span>Выйти из аккаунта</span>
          <span className="text-zinc-400">{signingOut ? '...' : '↗'}</span>
        </Button>
      </Modal>
    </div>
  )
}

function ThemeButton({
  settings,
  onThemeChange,
}: {
  settings: AppSettings
  onThemeChange: (theme: AppSettings['theme']) => void
}) {
  return (
    <Button
      variant="secondary"
      size="icon"
      aria-label="Переключить тему"
      className="motion-soft shadow-[0_10px_24px_rgba(24,24,27,0.06)]"
      onClick={() => {
        void tapHaptic('selection')
        onThemeChange(settings.theme === 'dark' ? 'light' : 'dark')
      }}
    >
      {settings.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
