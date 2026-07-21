import { createCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { createErrorPayload, createSuccessPayload, logServerError } from '../_shared/errors.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { decryptGoogleRefreshToken } from '../_shared/googleTokenCrypto.ts'

function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...Object.fromEntries(createCorsHeaders(request)), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return handleCorsPreflight(request)
  if (request.method !== 'POST') {
    return jsonResponse(request, createErrorPayload('INVALID_REQUEST', 'Method not allowed'), 405)
  }

  try {
    const { user } = await requireAuthenticatedUser(request)
    const admin = getSupabaseAdminClient()
    const { data: connection, error: connectionError } = await admin
      .from('google_sheets_connections')
      .select(
        'google_account_id, google_email, spreadsheet_id, spreadsheet_url, encrypted_refresh_token, token_iv, token_auth_tag, connection_status, sync_status, last_synced_at, last_sync_error, created_at, updated_at',
      )
      .eq('user_id', user.id)
      .maybeSingle()

    if (connectionError) {
      throw connectionError
    }

    if (!connection) {
      return jsonResponse(request, createErrorPayload('GOOGLE_NOT_CONNECTED', 'Google Sheets еще не подключен'), 400)
    }

    const encryptedRefreshToken = connection.encrypted_refresh_token
    const tokenIv = connection.token_iv
    const tokenAuthTag = connection.token_auth_tag

    if (encryptedRefreshToken && tokenIv) {
      try {
        const refreshToken = await decryptGoogleRefreshToken({
          encryptedRefreshToken,
          tokenIv,
          tokenAuthTag: tokenAuthTag ?? null,
        })

        const revokeResponse = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ token: refreshToken }),
        })

        if (!revokeResponse.ok) {
          logServerError('google-sheets-disconnect:revoke', new Error('Google revoke returned a non-2xx response'), {
            userId: user.id,
            spreadsheetId: connection.spreadsheet_id ?? null,
          })
        }
      } catch (error) {
        logServerError('google-sheets-disconnect:decrypt-or-revoke', error, {
          userId: user.id,
          spreadsheetId: connection.spreadsheet_id ?? null,
        })
      }
    }

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await admin
      .from('google_sheets_connections')
      .update({
        connection_status: 'disconnected',
        sync_status: 'idle',
        encrypted_refresh_token: null,
        token_iv: null,
        token_auth_tag: null,
        last_sync_error: null,
        sync_started_at: null,
        updated_at: now,
      })
      .eq('user_id', user.id)
      .select('google_email, spreadsheet_url, connection_status, sync_status, last_synced_at, last_sync_error, created_at, updated_at')
      .maybeSingle()

    if (updateError) {
      throw updateError
    }

    return jsonResponse(
      request,
      createSuccessPayload({
        connection: updated ?? {
          google_email: connection.google_email,
          spreadsheet_url: connection.spreadsheet_url,
          connection_status: 'disconnected',
          sync_status: 'idle',
          last_synced_at: connection.last_synced_at ?? null,
          last_sync_error: null,
          created_at: connection.created_at ?? null,
          updated_at: now,
        },
      }),
    )
  } catch (error) {
    const payload = (error as { success?: false; error?: { code?: string; message?: string } }).error
    if (payload?.code) {
      return jsonResponse(request, createErrorPayload(payload.code, payload.message ?? 'Ошибка авторизации'), payload.code === 'UNAUTHORIZED' ? 401 : 400)
    }
    logServerError('google-sheets-disconnect', error)
    return jsonResponse(request, createErrorPayload('INTERNAL_ERROR', 'Не удалось выполнить запрос'), 500)
  }
})
