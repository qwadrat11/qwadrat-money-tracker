import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase, hasSupabaseAuthConfig } from '../lib/supabase'
import { AuthContext } from './authContext'
import type { AuthContextValue } from './authContext'
import type { Session } from '@supabase/supabase-js'
import { AuthRequestError } from './authErrors'

type SupabaseAuthErrorLike = {
  message?: string
  code?: string | null
  status?: number | null
  name?: string | null
  details?: string | null
  hint?: string | null
}

function logAuthError(scope: string, error: SupabaseAuthErrorLike) {
  if (!import.meta.env.DEV) return
  console.error('Auth error', {
    scope,
    message: error.message,
    code: error.code,
    status: error.status,
    name: error.name,
    details: error.details,
    hint: error.hint,
  })
}

function readableAuthError(error: SupabaseAuthErrorLike) {
  const code = String(error.code ?? '').toLowerCase()
  const status = error.status
  const message = String(error.message ?? '').toLowerCase()
  const details = String(error.details ?? '').toLowerCase()
  const hint = String(error.hint ?? '').toLowerCase()
  const combined = [code, message, details, hint].join(' ')

  if (combined.includes('already registered') || code.includes('user_already_exists') || code.includes('email_exists')) {
    return 'Аккаунт с такой почтой уже существует'
  }
  if (combined.includes('password') && (combined.includes('short') || combined.includes('least') || combined.includes('6'))) {
    return 'Пароль должен быть минимум 6 символов'
  }
  if (combined.includes('invalid email') || combined.includes('email is invalid') || status === 400 && combined.includes('email')) {
    return 'Введите корректный email'
  }
  if (combined.includes('email not confirmed') || combined.includes('confirm') || combined.includes('verification')) {
    return 'Проверьте почту для подтверждения аккаунта'
  }
  if (combined.includes('invalid login credentials')) return 'Неверный email или пароль'
  if (combined.includes('signup disabled') || combined.includes('registration disabled')) return 'Регистрация сейчас недоступна'
  if (combined.includes('rate limit') || combined.includes('too many')) return 'Слишком много попыток. Попробуйте позже'
  if (combined.includes('access_denied') || (combined.includes('oauth') && combined.includes('cancel'))) return 'Вы отменили вход через Google'
  if (combined.includes('google') && (combined.includes('not enabled') || combined.includes('disabled') || combined.includes('provider'))) {
    return 'Вход через Google не настроен в Supabase'
  }
  if (combined.includes('no email') || combined.includes('missing email') || combined.includes('email missing')) return 'Google не вернул email'
  if (combined.includes('network') || combined.includes('fetch') || combined.includes('failed to fetch')) return 'Не удалось подключиться к Supabase'

  const cleaned = String(error.details ?? error.message ?? '').trim()
  if (cleaned) {
    return cleaned
  }

  return 'Не удалось выполнить запрос. Проверьте данные и попробуйте еще раз'
}

function authMessageFromError(error: SupabaseAuthErrorLike) {
  const code = String(error.code ?? '').toLowerCase()
  const message = String(error.message ?? '').toLowerCase()
  const details = String(error.details ?? '').toLowerCase()
  const hint = String(error.hint ?? '').toLowerCase()
  const combined = [code, message, details, hint].join(' ')
  return readableAuthError({
    ...error,
    message: combined,
  })
}

function getOAuthRedirectTo() {
  if (typeof window === 'undefined') return 'capacitor://localhost'
  return Capacitor.isNativePlatform() ? 'capacitor://localhost' : window.location.origin
}

function clearOAuthCallbackQuery() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const hasCallbackParams =
    url.searchParams.has('code') ||
    url.searchParams.has('error') ||
    url.searchParams.has('error_description') ||
    url.searchParams.has('error_code') ||
    url.searchParams.has('state')

  if (!hasCallbackParams) return

  window.history.replaceState({}, document.title, `${url.pathname}${url.hash}`)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      if (!supabase) {
        if (mounted) setLoading(false)
        return
      }

      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        const callbackError = url.searchParams.get('error')
        if (callbackError) {
          logAuthError('oauthCallback', {
            message: url.searchParams.get('error_description') ?? callbackError,
            code: callbackError,
            details: url.searchParams.get('error_code') ?? undefined,
            hint: url.searchParams.get('state') ?? undefined,
            name: 'OAuthCallbackError',
          })
          clearOAuthCallbackQuery()
        }
      }

      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return
      if (error) {
        logAuthError('getSession', error)
      } else {
        setSession(data.session ?? null)
      }

      if (!data.session && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (code) {
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (!mounted) return
          if (exchangeError) {
            logAuthError('exchangeCodeForSession', exchangeError)
          } else {
            setSession(exchangeData.session ?? null)
          }
          clearOAuthCallbackQuery()
        }
      }

      setLoading(false)
    }

    void bootstrap()

    if (!supabase) return () => {
      mounted = false
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
      if (nextSession) {
        clearOAuthCallbackQuery()
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        throw new Error('Supabase Auth не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local')
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        logAuthError('signIn', error)
        throw new AuthRequestError(error, authMessageFromError(error))
      }
    },
    [],
  )

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        throw new Error('Supabase Auth не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local')
      }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
      if (error) {
        logAuthError('signUp', error)
        throw new AuthRequestError(error, authMessageFromError(error))
      }
      return { session: data.session ?? null, user: data.user ?? null }
    },
    [],
  )

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      throw new Error('Supabase Auth не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local')
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getOAuthRedirectTo(),
        scopes: 'openid email profile',
      },
    })
    if (error) {
      logAuthError('signInWithGoogle', error)
      throw new AuthRequestError(error, authMessageFromError(error))
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      logAuthError('signOut', error)
      throw new AuthRequestError(error, authMessageFromError(error))
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isConfigured: hasSupabaseAuthConfig,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [loading, session, signIn, signInWithGoogle, signOut, signUp],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
