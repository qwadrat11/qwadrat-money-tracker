import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const hasSupabaseAuthConfig = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = hasSupabaseAuthConfig ? createClient(supabaseUrl, supabaseAnonKey) : null
