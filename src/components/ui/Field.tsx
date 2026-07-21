import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="ds-caption font-medium text-zinc-600 dark:text-zinc-300">{children}</label>
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-14 w-full rounded-[1.2rem] border border-zinc-200/70 bg-white px-4 text-[16px] text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 sm:h-12 sm:text-[14px]',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-14 w-full rounded-[1.2rem] border border-zinc-200/70 bg-white px-4 text-[16px] text-zinc-950 outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 sm:h-12 sm:text-[14px]',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-32 w-full rounded-[1.2rem] border border-zinc-200/70 bg-white px-4 py-4 text-[16px] text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 sm:min-h-28 sm:py-3 sm:text-[14px]',
        className,
      )}
      {...props}
    />
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2.5 sm:space-y-2">
      <span className="ds-caption font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      {children}
    </label>
  )
}
