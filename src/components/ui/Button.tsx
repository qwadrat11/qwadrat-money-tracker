import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'icon'
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[1.2rem] font-medium tracking-tight transition-[transform,opacity,background-color,box-shadow] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950',
        variant === 'primary' && 'bg-zinc-950 text-white shadow-[0_10px_26px_rgba(24,24,27,0.14)] hover:bg-zinc-800 dark:bg-white dark:text-zinc-950',
        variant === 'secondary' &&
          'border border-zinc-200/70 bg-white text-zinc-900 shadow-[0_10px_24px_rgba(24,24,27,0.05)] hover:bg-zinc-50 dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900',
        variant === 'ghost' && 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900',
        variant === 'danger' && 'bg-zinc-950 text-white shadow-[0_10px_26px_rgba(24,24,27,0.14)] hover:bg-zinc-800 dark:bg-white dark:text-zinc-950',
        size === 'sm' && 'h-9 px-3 text-[13px]',
        size === 'md' && 'h-12 px-5 text-[14px]',
        size === 'icon' && 'h-11 w-11',
        className,
      )}
      {...props}
    />
  )
}
