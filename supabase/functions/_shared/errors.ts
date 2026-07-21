export type GoogleSheetsErrorCode =
  | 'UNAUTHORIZED'
  | 'GOOGLE_NOT_CONNECTED'
  | 'GOOGLE_OAUTH_NOT_CONFIGURED'
  | 'GOOGLE_CLIENT_ID_MISSING'
  | 'GOOGLE_OAUTH_SCRIPT_FAILED'
  | 'GOOGLE_OAUTH_POPUP_CLOSED'
  | 'GOOGLE_OAUTH_ACCESS_DENIED'
  | 'GOOGLE_OAUTH_POPUP_FAILED_TO_OPEN'
  | 'INVALID_REQUEST'
  | 'GOOGLE_CODE_EXCHANGE_FAILED'
  | 'GOOGLE_REQUIRED_SCOPE_MISSING'
  | 'GOOGLE_IDENTITY_VERIFICATION_FAILED'
  | 'GOOGLE_EMAIL_NOT_VERIFIED'
  | 'GOOGLE_ACCOUNT_EMAIL_MISMATCH'
  | 'GOOGLE_ACCOUNT_MISMATCH'
  | 'GOOGLE_SPREADSHEET_CREATE_FAILED'
  | 'GOOGLE_SPREADSHEET_CHECK_FAILED'
  | 'GOOGLE_SPREADSHEET_ACCESS_DENIED'
  | 'DATABASE_CONNECTION_SAVE_FAILED'
  | 'GOOGLE_SYNC_NOT_IMPLEMENTED'
  | 'GOOGLE_ACCESS_REVOKED'
  | 'GOOGLE_REAUTHORIZATION_REQUIRED'
  | 'GOOGLE_REFRESH_TOKEN_MISSING'
  | 'SPREADSHEET_NOT_FOUND'
  | 'SYNC_ALREADY_RUNNING'
  | 'GOOGLE_RATE_LIMIT'
  | 'GOOGLE_API_ERROR'
  | 'INVALID_FINANCE_DATA'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR'

export type ApiErrorPayload = {
  success: false
  error: {
    code: GoogleSheetsErrorCode | string
    message: string
  }
}

export type ApiSuccessPayload<T> = {
  success: true
  data: T
}

export function createErrorPayload(code: GoogleSheetsErrorCode | string, message: string): ApiErrorPayload {
  return {
    success: false,
    error: {
      code,
      message,
    },
  }
}

export function createSuccessPayload<T>(data: T): ApiSuccessPayload<T> {
  return {
    success: true,
    data,
  }
}

export function logServerError(scope: string, error: unknown, context?: Record<string, unknown>) {
  if (!context) {
    console.error(scope, error)
    return
  }
  console.error(scope, { ...context, error })
}
