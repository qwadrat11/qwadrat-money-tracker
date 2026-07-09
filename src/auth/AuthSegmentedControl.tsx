import { cn } from '../utils/cn'

export function AuthSegmentedControl({
  value,
  onChange,
}: {
  value: 'sign-in' | 'sign-up'
  onChange: (value: 'sign-in' | 'sign-up') => void
}) {
  return (
    <div className="grid grid-cols-2 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
      <button
        type="button"
        className={cn(
          'h-11 rounded-full text-[14px] font-medium transition',
          value === 'sign-in' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50' : 'text-zinc-500',
        )}
        onClick={() => onChange('sign-in')}
      >
        Вход
      </button>
      <button
        type="button"
        className={cn(
          'h-11 rounded-full text-[14px] font-medium transition',
          value === 'sign-up' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50' : 'text-zinc-500',
        )}
        onClick={() => onChange('sign-up')}
      >
        Регистрация
      </button>
    </div>
  )
}
