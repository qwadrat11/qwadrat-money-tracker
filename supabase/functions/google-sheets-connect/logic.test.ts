import {
  assertFinanceTrackerEmailMatchesGoogle,
  assertSameGoogleAccount,
  buildInitialFormattingRequests,
  buildSafeConnectSuccess,
  buildSpreadsheetTemplate,
  chooseStoredRefreshToken,
  emailsMatch,
  hasRequiredScopes,
  normalizeEmail,
  parseConnectRequestBody,
} from './logic.ts'

Deno.test('normalizeEmail trims and lowercases', () => {
  if (normalizeEmail('  User@Example.com  ') !== 'user@example.com') {
    throw new Error('normalizeEmail failed')
  }
})

Deno.test('emailsMatch ignores case and whitespace', () => {
  if (!emailsMatch('User@Example.com', ' user@example.com ')) {
    throw new Error('emailsMatch should match equivalent emails')
  }
})

Deno.test('parseConnectRequestBody rejects invalid payloads', () => {
  let failed = false
  try {
    parseConnectRequestBody({ code: '' })
  } catch {
    failed = true
  }
  if (!failed) throw new Error('Expected invalid code to fail')
})

Deno.test('assertFinanceTrackerEmailMatchesGoogle fails on mismatch', () => {
  let failed = false
  try {
    assertFinanceTrackerEmailMatchesGoogle('owner@example.com', 'other@example.com')
  } catch (error) {
    failed = String((error as { error?: { code?: string } }).error?.code ?? '').includes('GOOGLE_ACCOUNT_EMAIL_MISMATCH')
  }
  if (!failed) throw new Error('Expected email mismatch')
})

Deno.test('assertSameGoogleAccount fails on account mismatch', () => {
  let failed = false
  try {
    assertSameGoogleAccount('google-sub-a', 'google-sub-b')
  } catch (error) {
    failed = String((error as { error?: { code?: string } }).error?.code ?? '').includes('GOOGLE_ACCOUNT_MISMATCH')
  }
  if (!failed) throw new Error('Expected account mismatch')
})

Deno.test('chooseStoredRefreshToken keeps existing token when new token is missing', () => {
  const result = chooseStoredRefreshToken('ciphertext', null)
  if (result.source !== 'existing' || result.refreshToken !== null) {
    throw new Error('Expected existing refresh token path')
  }
})

Deno.test('chooseStoredRefreshToken prefers the new token when available', () => {
  const result = chooseStoredRefreshToken('ciphertext', '  new-refresh-token  ')
  if (result.source !== 'new' || result.refreshToken !== 'new-refresh-token') {
    throw new Error('Expected new refresh token path')
  }
})

Deno.test('hasRequiredScopes accepts the Google Sheets scope regardless of identity scope aliases', () => {
  if (
    !hasRequiredScopes('openid email profile https://www.googleapis.com/auth/spreadsheets') ||
    !hasRequiredScopes(
      'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/spreadsheets',
    ) ||
    hasRequiredScopes('openid email profile')
  ) {
    throw new Error('Scope check failed')
  }
})

Deno.test('hasRequiredScopes accepts drive.file access', () => {
  if (!hasRequiredScopes('openid email profile https://www.googleapis.com/auth/drive.file')) {
    throw new Error('Expected drive.file to allow spreadsheet access')
  }
})

Deno.test('spreadsheet template contains all required sheets', () => {
  const template = buildSpreadsheetTemplate()
  const titles = template.sheets.map((sheet) => sheet.properties.title)
  if (JSON.stringify(titles) !== JSON.stringify(['Обзор', 'Операции', 'Счета', 'Категории'])) {
    throw new Error('Unexpected spreadsheet template')
  }
})

Deno.test('formatting requests are built for each sheet', () => {
  const result = buildInitialFormattingRequests({
    Обзор: 1,
    Операции: 2,
    Счета: 3,
    Категории: 4,
  })

  if (result.requests.length !== 12) {
    throw new Error('Expected three requests per sheet')
  }
})

Deno.test('safe connect success never contains tokens', () => {
  const response = buildSafeConnectSuccess({
    googleEmail: 'user@example.com',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
    connectionStatus: 'connected',
    syncStatus: 'idle',
    createdNewSpreadsheet: true,
  })

  const json = JSON.stringify(response)
  if (json.includes('token') || json.includes('spreadsheetId') || json.includes('user_id')) {
    throw new Error('Unsafe fields were leaked')
  }
})
