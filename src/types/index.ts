export type TransactionType = 'income' | 'expense' | 'transfer'

export type Role = 'user' | 'admin'

export type Currency = 'USD' | 'EUR' | 'UAH'

export type AccountType = 'cash' | 'bank_card' | 'savings' | 'crypto' | 'credit_card' | 'other'

export type Account = {
  id: string
  name: string
  type: AccountType
  currency: Currency
  icon: string
  color: string
  balance: number
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
