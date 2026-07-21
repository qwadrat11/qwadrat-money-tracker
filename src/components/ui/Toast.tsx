import { useMemo, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { Button } from './Button'
import { ToastContext } from './toastContext'

type Toast = { id: string; message: string }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const value = useMemo(
    () => ({
      notify(message: string) {
        const id = crypto.randomUUID()
        setToasts((items) => [...items, { id, message }])
        window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 2600)
      },
    }),
    [],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+1rem)] right-4 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 lg:bottom-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-enter flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 text-[13px] text-zinc-900 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
          >
            <CheckCircle2 className="h-5 w-5 text-zinc-700 dark:text-zinc-200" />
            <span className="flex-1">{toast.message}</span>
            <Button
              aria-label="Закрыть"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
