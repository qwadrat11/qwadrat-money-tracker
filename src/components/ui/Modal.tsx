import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'
import { cn } from '../../utils/cn'

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  className,
  hideHeader = false,
}: {
  open: boolean
  title: string
  description?: string
  children: React.ReactNode
  onClose: () => void
  className?: string
  hideHeader?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-zinc-950/32 p-0 backdrop-blur-2xl sm:place-items-center sm:p-4" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" aria-label="Закрыть" onClick={onClose} />
      <section
        className={cn(
          'animate-sheet relative max-h-[calc(94dvh-env(safe-area-inset-top))] w-full touch-pan-y overscroll-contain overflow-x-hidden overflow-y-auto rounded-t-[2rem] border border-zinc-200/70 bg-white/96 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5 shadow-[0_30px_90px_rgba(24,24,27,0.24)] backdrop-blur-2xl dark:border-zinc-800/70 dark:bg-zinc-950/96 sm:max-h-[92vh] sm:max-w-2xl sm:rounded-[1.8rem] sm:p-6',
          className,
        )}
      >
        {!hideHeader && (
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="ds-section-title text-zinc-950 dark:text-zinc-50">{title}</h2>
              {description && <p className="ds-caption mt-1 text-zinc-500 dark:text-zinc-400">{description}</p>}
            </div>
            <Button variant="ghost" size="icon" aria-label="Закрыть окно" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {children}
      </section>
    </div>
  )
}
