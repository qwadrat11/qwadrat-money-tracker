import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { Field, Input } from '../components/ui/Field'
import type { InputHTMLAttributes } from 'react'

type AuthInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  icon: ReactNode
}

export function AuthInput({ label, icon, className, ...props }: AuthInputProps) {
  return (
    <Field label={label}>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">{icon}</span>
        <Input {...props} className={cn('h-14 rounded-[1.25rem] bg-[#f7f7f8] pl-11 text-[16px] shadow-none', className)} />
      </div>
    </Field>
  )
}
