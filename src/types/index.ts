export type TransactionType = 'income' | 'expense' | 'transfer'

export type Role = 'user' | 'admin'

export type Currency = 'USD' | 'EUR' | 'UAH'

export type AccountType = 'cash' | 'bank_card' | 'savings' | 'crypto' | 'crypto_portfolio' | 'credit_card' | 'other'

export type Account = {
  id: string
  name: string
  type: AccountType
  currency: Currency
  icon: string
  color: string
  balance: number
  baseBalance?: number
  startingBalance: number
  archived: boolean
  includeInTotalBalance: boolean
  createdAt: string
  updatedAt: string
}

export type Category = {
  id: string
  name: string
  icon: string
  color: string
  type: TransactionType | 'both'
  isDefault: boolean
  createdAt?: string
  updatedAt?: string
}

export type Transaction = {
  id: string
  type: TransactionType
  date: string
  amount: number
  categoryId: string
  accountId: string
  toAccountId?: string
  description: string
  paymentMethod: string
  currency: Currency
  baseCurrency?: Currency
  exchangeRate?: number | null
  convertedAmount?: number | null
  exchangeRateDate?: string | null
  exchangeRateSource?: 'identity' | 'NBU' | null
  destinationAmount?: number
  destinationCurrency?: Currency
  userId: string
  createdAt: string
  updatedAt: string
}

export type User = {
  id: string
  name: string
  email: string
  role: Role
  status: 'active' | 'invited'
}

export type ReceiptItem = {
  name: string
  quantity: number
  price: number
}

export type ReceiptScanResult = {
  total: number
  store: string
  date: string
  currency: Currency
  items: ReceiptItem[]
  suggestedCategoryId: string
  suggestedAccountId: string
  confidence: number
  imageName?: string
  source: 'mock' | 'openai'
  message?: string
}

export type ExportRow = {
  date: string
  type: string
  account: string
  category: string
  description: string
  paymentMethod: string
  amount: number
  currency: Currency
}

export type AppSettings = {
  monthlyBudget: number
  currency: Currency
  baseCurrency: Currency
  theme: 'light' | 'dark'
  workspaceName: string
  defaultPaymentMethod: string
  hasSeenOnboarding: boolean
  dashboardWidgetOrder: string[]
  users?: User[]
  receiptScans?: ReceiptScanResult[]
}

export type AccountBalance = Account & {
  balance: number
  monthlyIncome: number
  monthlyExpense: number
}

export type GoogleSheetsConnectionStatus = {
  googleEmail: string | null
  spreadsheetUrl: string | null
  connectionStatus: 'not_connected' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'reauthorization_required'
  syncStatus: 'idle' | 'syncing' | 'success' | 'error'
  lastSyncedAt: string | null
  lastSyncError: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type GoogleSheetsSyncLog = {
  id: string
  status: 'started' | 'success' | 'error'
  triggerType: 'manual' | 'automatic' | 'initial'
  rowsWritten: number
  errorCode: GoogleSheetsErrorCode | null
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
  createdAt: string
}

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

export type GoogleSheetsApiError = {
  success: false
  error: {
    code: GoogleSheetsErrorCode | string
    message: string
  }
}
