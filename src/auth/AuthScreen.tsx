import { useMemo, useState } from 'react'
import { ArrowRight, CircleCheckBig, LockKeyhole, Mail, WalletCards } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field, Input } from '../components/ui/Field'
import { useAuth } from './useAuth'
import { cn } from '../utils/cn'

type Mode = 'sign-in' | 'sign-up'

export function AuthScreen() {
  const { signIn, signUp, isConfigured } = useAuth()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const title = useMemo(() => (mode === 'sign-in' ? 'Вход' : 'Регистрация'), [mode])

  return (
    <div className="safe-area-page flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 py-6 text-zinc-950 dark:bg-[var(--app-bg)] dark:text-zinc-50">
      <div className="w-full max-w-[520px]">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.7rem] bg-zinc-950 text-white shadow-[0_14px_34px_rgba(24,24,27,0.16)] dark:bg-white dark:text-zinc-950">
            <WalletCards className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-[38px] font-medium tracking-tight sm:text-[46px]">qwadrat</h1>
          <p className="mt-2 text-[15px] text-zinc-500">Личные финансы без хаоса</p>
        </div>

        <Card className="overflow-hidden rounded-[2.2rem] p-0 shadow-[0_24px_80px_rgba(24,24,27,0.08)]">
          <div className="border-b border-black/5 bg-white/70 px-5 pt-5 dark:bg-zinc-950/70 sm:px-6">
            <div className="grid grid-cols-2 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
              <button
                type="button"
                className={cn(
                  'h-11 rounded-full text-[14px] font-medium transition',
                  mode === 'sign-in' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50' : 'text-zinc-500',
                )}
                onClick={() => {
                  setMode('sign-in')
                  setError(null)
                  setMessage(null)
                }}
              >
                Вход
              </button>
              <button
                type="button"
                className={cn(
                  'h-11 rounded-full text-[14px] font-medium transition',
                  mode === 'sign-up' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50' : 'text-zinc-500',
                )}
                onClick={() => {
                  setMode('sign-up')
                  setError(null)
                  setMessage(null)
                }}
              >
                Регистрация
              </button>
            </div>
            <div className="mt-5">
              <p className="text-[13px] text-zinc-500">Supabase Auth</p>
              <h2 className="mt-1 text-[24px] font-medium tracking-tight text-zinc-950 dark:text-zinc-50">{title}</h2>
            </div>
          </div>

          <form
            className="space-y-4 px-5 py-5 sm:px-6"
          onSubmit={async (event) => {
            event.preventDefault()
            setLoading(true)
            setError(null)
            setMessage(null)
            try {
              if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
                throw new Error('Введите корректный email')
              }
              if (password.trim().length < 6) {
                throw new Error('Пароль должен быть не короче 6 символов')
              }
              if (mode === 'sign-in') {
                await signIn(email, password)
              } else {
                const result = await signUp(email, password)
                if (!result.session) {
                    setMessage('Регистрация почти завершена. Проверьте почту для подтверждения.')
                    setMode('sign-in')
                  }
                }
              } catch (error_) {
                setError(error_ instanceof Error ? error_.message : 'Не удалось выполнить запрос')
              } finally {
                setLoading(false)
              }
            }}
          >
            {!isConfigured && (
              <div className="rounded-[1.35rem] border border-amber-200/70 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                Supabase не настроен. Добавьте переменные <span className="font-medium">VITE_SUPABASE_URL</span> и{' '}
                <span className="font-medium">VITE_SUPABASE_ANON_KEY</span>.
              </div>
            )}
            <Field label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  className="h-14 rounded-[1.35rem] pl-11 text-[15px]"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </Field>
            <Field label="Пароль">
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  type="password"
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  placeholder="Не менее 6 символов"
                  className="h-14 rounded-[1.35rem] pl-11 text-[15px]"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </Field>

            {error && (
              <div className="rounded-[1.35rem] bg-rose-50 px-4 py-3 text-[14px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-[1.35rem] bg-emerald-50 px-4 py-3 text-[14px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                {message}
              </div>
            )}

            <Button
              type="submit"
              className="h-14 w-full rounded-[1.4rem] text-[15px]"
              disabled={loading || !email.trim() || !password.trim()}
            >
              {loading ? 'Проверяем...' : mode === 'sign-in' ? 'Войти' : 'Создать аккаунт'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>

            <div className="flex items-center justify-between gap-3 px-1 text-[13px] text-zinc-500">
              <span className="inline-flex items-center gap-2">
                <CircleCheckBig className="h-4 w-4 text-zinc-400" />
                Сессия сохраняется автоматически
              </span>
              <button
                type="button"
                className="font-medium text-zinc-900 transition hover:opacity-70 dark:text-zinc-50"
                onClick={() => {
                  setMode((value) => (value === 'sign-in' ? 'sign-up' : 'sign-in'))
                  setError(null)
                  setMessage(null)
                }}
              >
                {mode === 'sign-in' ? 'Нужна регистрация?' : 'Уже есть аккаунт?'}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
