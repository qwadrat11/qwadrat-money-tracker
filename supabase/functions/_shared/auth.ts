import { createClient, type User } from 'npm:@supabase/supabase-js@2'
import { createErrorPayload } from './errors.ts'

function getSupabaseUrl() {
  const url = Deno.env.get('SUPABASE_URL')
  if (!url) {
    throw new Error('SUPABASE_URL is not configured')
  }
  return url
}

function getSupabaseAnonKey() {
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  if (!key) {
    throw new Error('SUPABASE_ANON_KEY is not configured')
  }
  return key
}

export function getBearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

export async function requireAuthenticatedUser(request: Request): Promise<{ user: User; accessToken: string }> {
  const accessToken = getBearerToken(request)
  if (!accessToken) {
    throw createErrorPayload('UNAUTHORIZED', 'Требуется вход в аккаунт')
  }

  const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) {
    throw createErrorPayload('UNAUTHORIZED', 'Требуется вход в аккаунт')
  }

  return { user: data.user, accessToken }
}

