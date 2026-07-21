import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

let adminClient: SupabaseClient | null = null

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient

  const supabaseUrl = getRequiredEnv('SUPABASE_URL')
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return adminClient
}

