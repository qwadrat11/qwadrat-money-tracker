import { useState, type FormEvent } from 'react'
import { CircleCheckBig, LockKeyhole, Mail, WalletCards } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuth } from './useAuth'
import { useToast } from '../components/ui/toastContext'
import { AuthInput } from './AuthInput'
import { AuthSegmentedControl } from './AuthSegmentedControl'

type Mode = 'sign-in' | 'sign-up'
type ScreenState = 'form' | 'confirmation'
type LoadingState = 'email' | null

export function AuthScreen() {
  const { signIn, signUp, isConfigured } = useAuth()
  const { notify } = useToast()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [screenState, setScreenState] = useState<ScreenState>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState<LoadingState>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading('email')

    try {
      const normalizedEmail = email.trim()

      if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
        throw new Error('Введите корректный email')
      }
      if (password.trim().length < 6) {
        throw new Error('Пароль должен быть минимум 6 символов')
      }
      if (mode === 'sign-up' && password !== confirmPassword) {
        throw new Error('Пароли не совпадают')
      }

      if (mode === 'sign-in') {
        await signIn(normalizedEmail, password)
        return
      }

      const result = await signUp(normalizedEmail, password)
      if (!result.session) {
        setScreenState('confirmation')
      }
    } catch (error_) {
      notify(mapAuthError(error_))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="safe-area-page relative flex min-h-[100dvh] items-start justify-center overflow-y-auto overflow-x-hidden bg-[#f4f4f6] px-4 py-6 text-zinc-950 sm:items-center">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-[8%] h-60 w-60 rounded-full bg-white/60 blur-3xl" />
        <div className="absolute right-[4%] top-[16%] h-72 w-72 rounded-full bg-zinc-200/45 blur-3xl" />
        <div className="absolute bottom-[8%] left-[20%] h-64 w-64 rounded-full bg-zinc-300/30 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.82),transparent_42%),linear-gradient(to_bottom,rgba(244,244,246,0.94),rgba(244,244,246,1))]" />
      </div>

      <div className="relative w-full max-w-[460px]">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.75rem] bg-zinc-950 text-white shadow-[0_16px_40px_rgba(24,24,27,0.16)]">
            <WalletCards className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-[38px] font-medium tracking-tight sm:text-[42px]">qwadrat</h1>
          <p className="mt-2 text-[16px] text-zinc-500">Личные финансы без хаоса</p>
        </div>

        <div className="animate-sheet overflow-hidden rounded-[32px] bg-white/84 p-6 shadow-[0_24px_90px_rgba(24,24,27,0.08)] backdrop-blur-xl sm:p-7">
          {screenState === 'confirmation' ? (
            <div className="animate-enter space-y-5 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <CircleCheckBig className="h-7 w-7" />
              </div>
              <div>
                <p className="text-[29px] font-medium tracking-tight text-zinc-950">Проверьте почту</p>
                <p className="mt-2 text-[16px] leading-6 text-zinc-500">Мы отправили письмо для подтверждения аккаунта.</p>
              </div>
              <Button
                className="h-14 w-full rounded-[1.35rem] text-[15px]"
                onClick={() => {
                  setScreenState('form')
                  setMode('sign-in')
                }}
              >
                Вернуться ко входу
              </Button>
            </div>
          ) : (
            <div className="animate-enter space-y-5">
              <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
                <AuthSegmentedControl
                  value={mode}
                  onChange={(next) => {
                    setMode(next)
                  }}
                />

                {!isConfigured && (
                  <div className="rounded-[1.35rem] bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-900">
                    Supabase не настроен. Добавьте <span className="font-medium">VITE_SUPABASE_URL</span> и{' '}
                    <span className="font-medium">VITE_SUPABASE_ANON_KEY</span>.
                  </div>
                )}

                <AuthInput
                  label="Email"
                  icon={<Mail className="h-4 w-4" />}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />

                <AuthInput
                  label="Password"
                  icon={<LockKeyhole className="h-4 w-4" />}
                  type="password"
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'sign-in' ? 'Введите пароль' : 'Минимум 6 символов'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                {mode === 'sign-up' && (
                  <AuthInput
                    label="Confirm Password"
                    icon={<LockKeyhole className="h-4 w-4" />}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Повторите пароль"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                )}

                <Button
                  type="submit"
                  className="h-14 w-full rounded-[1.35rem] text-[15px] font-medium"
                  disabled={loading === 'email' || !email.trim() || !password.trim() || (mode === 'sign-up' && !confirmPassword.trim())}
                >
                  {loading === 'email' ? 'Проверяем...' : mode === 'sign-in' ? 'Войти' : 'Создать аккаунт'}
                  {loading !== 'email' && <span className="text-[18px] leading-none">→</span>}
                </Button>
              </form>

              <div className="flex items-start gap-2 rounded-[1.35rem] bg-zinc-50 px-4 py-3 text-[13px] leading-5 text-zinc-500">
                <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                <span>Вход выполняется по email и паролю. Сессия сохраняется автоматически.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function mapAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const normalized = message.toLowerCase()

  if (normalized.includes('корректный email') || normalized.includes('invalid email')) return 'Введите корректный email'
  if (normalized.includes('minimum') || normalized.includes('6 символ') || normalized.includes('password')) {
    return 'Пароль должен быть минимум 6 символов'
  }
  if (normalized.includes('совпадают')) return 'Пароли не совпадают'
  if (normalized.includes('already registered') || normalized.includes('user already registered')) return 'Такой аккаунт уже существует'
  if (normalized.includes('invalid login credentials')) return 'Неверный email или пароль'
  if (normalized.includes('confirm') || normalized.includes('email not confirmed')) return 'Проверьте почту для подтверждения аккаунта'
  if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('failed to fetch')) {
    return 'Не удалось выполнить запрос'
  }
  return 'Не удалось выполнить запрос. Попробуйте еще раз'
}
