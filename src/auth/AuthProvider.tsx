import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, hasSupabaseAuthConfig } from '../lib/supabase'
import { AuthContext } from './authContext'
import type { AuthContextValue } from './authContext'
import type { Session } from '@supabase/supabase-js'

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

      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return
      if (!error) {
        setSession(data.session ?? null)
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
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const mapError = useCallback((message: string) => {
    const normalized = message.toLowerCase()
    if (normalized.includes('invalid login credentials')) return 'Неверный email или пароль'
    if (normalized.includes('user already registered')) return 'Пользователь уже существует'
    if (normalized.includes('password should be at least')) return 'Пароль должен быть не короче 6 символов'
    if (normalized.includes('email not confirmed')) return 'Подтвердите email в письме'
    if (normalized.includes('auth session missing')) return 'Сначала войдите в аккаунт'
    if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('failed to fetch'))
      return 'Не удалось подключиться к Supabase'
    return 'Не удалось выполнить запрос. Проверьте данные и попробуйте еще раз'
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        throw new Error('Supabase Auth не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local')
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error(mapError(error.message))
    },
    [mapError],
  )

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        throw new Error('Supabase Auth не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local')
      }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
      if (error) throw new Error(mapError(error.message))
      return { session: data.session ?? null, user: data.user ?? null }
    },
    [mapError],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(mapError(error.message))
  }, [mapError])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isConfigured: hasSupabaseAuthConfig,
      signIn,
      signUp,
      signOut,
    }),
    [loading, session, signIn, signOut, signUp],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
