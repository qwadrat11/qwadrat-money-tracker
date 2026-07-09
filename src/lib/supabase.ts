import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const hasSupabaseAuthConfig = Boolean(supabaseUrl && supabaseAnonKey)

if (import.meta.env.DEV && !hasSupabaseAuthConfig) {
  console.error('Supabase config missing', {
    urlConfigured: Boolean(supabaseUrl),
    anonKeyConfigured: Boolean(supabaseAnonKey),
    message: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local',
  })
}

export const supabase = hasSupabaseAuthConfig ? createClient(supabaseUrl, supabaseAnonKey) : null
