import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-[1.6rem] border border-zinc-200/60 bg-white/70 p-6 text-center shadow-[0_14px_40px_rgba(24,24,27,0.05)] backdrop-blur-2xl dark:border-zinc-800/70 dark:bg-zinc-950/60 sm:p-8">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-[1.35rem] bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="ds-section-title text-zinc-950 dark:text-zinc-50">{title}</h3>
      <p className="ds-caption mt-1 max-w-sm text-zinc-500 dark:text-zinc-400">{description}</p>
    </div>
  )
}
