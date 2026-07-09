import { defaultCategories, defaultSettings, demoAccounts, demoTransactions, demoUsers, generateDemoTransactions } from '../data/demoData'
import type { Account, AccountBalance, AppSettings, Category, ReceiptScanResult, Transaction, User } from '../types'
import { uid } from '../utils/format'

const KEY = 'expense-saas:v1'

export type PersistedState = {
  accounts: Account[]
  transactions: Transaction[]
  categories: Category[]
  users: User[]
  receiptScans: ReceiptScanResult[]
  settings: AppSettings
}

export function getInitialState(): PersistedState {
  return {
    accounts: demoAccounts,
    transactions: demoTransactions,
    categories: defaultCategories,
    users: demoUsers,
    receiptScans: [],
    settings: defaultSettings,
  }
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return getInitialState()
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const defaults = getInitialState()
    const accounts = (parsed.accounts ?? defaults.accounts).map((account) => ({
      ...account,
      balance: account.balance ?? account.startingBalance ?? 0,
      startingBalance: account.startingBalance ?? account.balance ?? 0,
      archived: account.archived ?? false,
      includeInTotalBalance: account.includeInTotalBalance ?? true,
      icon: account.icon ?? 'Wallet',
      color: account.color ?? '#525252',
    }))
    const fallbackAccountId = accounts[0]?.id ?? defaults.accounts[0].id
    return {
      accounts,
      transactions: (parsed.transactions ?? defaults.transactions).map((transaction) => ({
        ...transaction,
        accountId: transaction.accountId ?? fallbackAccountId,
      })),
      categories: (parsed.categories ?? defaults.categories).map((category) => ({
        ...category,
        icon: category.icon ?? 'CircleEllipsis',
      })),
      users: parsed.users ?? defaults.users,
      receiptScans: parsed.receiptScans ?? [],
      settings: {
        ...defaults.settings,
        ...parsed.settings,
        hasSeenOnboarding: parsed.settings?.hasSeenOnboarding ?? defaults.settings.hasSeenOnboarding,
        dashboardWidgetOrder: normalizeDashboardWidgetOrder(
          parsed.settings?.dashboardWidgetOrder ?? defaults.settings.dashboardWidgetOrder,
          defaults.settings.dashboardWidgetOrder,
        ),
      },
    }
  } catch {
    return getInitialState()
  }
}

export function loadLegacyState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      accounts: parsed.accounts ?? [],
      transactions: parsed.transactions ?? [],
      categories: parsed.categories ?? [],
      users: parsed.users ?? [],
      receiptScans: parsed.receiptScans ?? [],
      settings: parsed.settings ?? getInitialState().settings,
    }
  } catch {
    return null
  }
}

export function saveState(state: PersistedState) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function clearState() {
  localStorage.removeItem(KEY)
}

function normalizeDashboardWidgetOrder(order: string[] | undefined, defaultOrder: string[]) {
  const known = new Set(defaultOrder)
  const filtered = (order ?? []).filter((item) => known.has(item))
  return [...filtered, ...defaultOrder.filter((item) => !filtered.includes(item))]
}

async function delay() {
  await new Promise((resolve) => window.setTimeout(resolve, 120))
}

function moveItem<T extends { id: string }>(items: T[], id: string, direction: 'up' | 'down') {
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) return items
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

export const financeRepository = {
  async getState() {
    await delay()
    return loadState()
  },
  async replaceState(state: PersistedState) {
    await delay()
    saveState(state)
    return state
  },
  async resetDemoData() {
    await delay()
    const state = getInitialState()
    saveState(state)
    return state
  },
  async generateDemoData() {
    await delay()
    const state = { ...loadState(), transactions: generateDemoTransactions() }
    saveState(state)
    return state
  },
  async addAccount(input: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) {
    await delay()
    const now = new Date().toISOString()
    const state = loadState()
    const account = { ...input, id: uid('acc'), createdAt: now, updatedAt: now }
    saveState({ ...state, accounts: [...state.accounts, account] })
    return account
  },
  async duplicateAccount(id: string) {
    await delay()
    const state = loadState()
    const source = state.accounts.find((account) => account.id === id)
    if (!source) return id
    const now = new Date().toISOString()
    const duplicate = { ...source, id: uid('acc'), name: `${source.name} (копия)`, createdAt: now, updatedAt: now }
    saveState({ ...state, accounts: [...state.accounts, duplicate] })
    return duplicate
  },
  async updateAccount(account: Account) {
    await delay()
    const state = loadState()
    const nextAccount = { ...account, updatedAt: new Date().toISOString() }
    saveState({ ...state, accounts: state.accounts.map((item) => (item.id === account.id ? nextAccount : item)) })
    return nextAccount
  },
  async reorderAccount(id: string, direction: 'up' | 'down') {
    await delay()
    const state = loadState()
    saveState({ ...state, accounts: moveItem(state.accounts, id, direction) })
    return id
  },
  async archiveAccount(id: string) {
    await delay()
    const state = loadState()
    saveState({
      ...state,
      accounts: state.accounts.map((account) =>
        account.id === id ? { ...account, archived: true, updatedAt: new Date().toISOString() } : account,
      ),
    })
    return id
  },
  async deleteAccount(id: string) {
    await delay()
    const state = loadState()
    const fallback = state.accounts.find((account) => account.id !== id && !account.archived)?.id ?? state.accounts.find((account) => account.id !== id)?.id
    saveState({
      ...state,
      accounts: state.accounts.filter((account) => account.id !== id),
      transactions: fallback
        ? state.transactions.map((transaction) => ({
            ...transaction,
            accountId: transaction.accountId === id ? fallback : transaction.accountId,
            toAccountId: transaction.toAccountId === id ? fallback : transaction.toAccountId,
          }))
        : state.transactions.filter((transaction) => transaction.accountId !== id && transaction.toAccountId !== id),
    })
    return id
  },
  async addTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) {
    await delay()
    const now = new Date().toISOString()
    const state = loadState()
    const transaction = { ...input, id: uid('tx'), createdAt: now, updatedAt: now }
    const next = { ...state, transactions: [transaction, ...state.transactions] }
    saveState(next)
    return transaction
  },
  async duplicateTransaction(id: string) {
    await delay()
    const state = loadState()
    const source = state.transactions.find((transaction) => transaction.id === id)
    if (!source) return id
    const now = new Date().toISOString()
    const duplicate = { ...source, id: uid('tx'), description: `${source.description} (копия)`, createdAt: now, updatedAt: now }
    saveState({ ...state, transactions: [duplicate, ...state.transactions] })
    return duplicate
  },
  async updateTransaction(transaction: Transaction) {
    await delay()
    const state = loadState()
    const nextTransaction = { ...transaction, updatedAt: new Date().toISOString() }
    const next = {
      ...state,
      transactions: state.transactions.map((item) => (item.id === transaction.id ? nextTransaction : item)),
    }
    saveState(next)
    return nextTransaction
  },
  async deleteTransaction(id: string) {
    await delay()
    const state = loadState()
    saveState({ ...state, transactions: state.transactions.filter((item) => item.id !== id) })
    return id
  },
  async clearTransactions() {
    await delay()
    const state = loadState()
    saveState({ ...state, transactions: [] })
  },
  async addCategory(input: Omit<Category, 'id' | 'isDefault'>) {
    await delay()
    const state = loadState()
    const category = { ...input, id: uid('cat'), isDefault: false }
    saveState({ ...state, categories: [...state.categories, category] })
    return category
  },
  async duplicateCategory(id: string) {
    await delay()
    const state = loadState()
    const source = state.categories.find((category) => category.id === id)
    if (!source) return id
    const duplicate = { ...source, id: uid('cat'), name: `${source.name} (копия)`, isDefault: false }
    saveState({ ...state, categories: [...state.categories, duplicate] })
    return duplicate
  },
  async updateCategory(category: Category) {
    await delay()
    const state = loadState()
    saveState({ ...state, categories: state.categories.map((item) => (item.id === category.id ? category : item)) })
    return category
  },
  async reorderCategory(id: string, direction: 'up' | 'down') {
    await delay()
    const state = loadState()
    saveState({ ...state, categories: moveItem(state.categories, id, direction) })
    return id
  },
  async deleteCategory(id: string) {
    await delay()
    const state = loadState()
    const fallback = state.categories.find((item) => item.id === 'other')?.id ?? state.categories[0]?.id
    saveState({
      ...state,
      categories: state.categories.filter((item) => item.id !== id || item.isDefault),
      transactions: state.transactions.map((item) => (item.categoryId === id && fallback ? { ...item, categoryId: fallback } : item)),
    })
    return id
  },
  async updateUser(user: User) {
    await delay()
    const state = loadState()
    saveState({ ...state, users: state.users.map((item) => (item.id === user.id ? user : item)) })
    return user
  },
  async addUser(input: Omit<User, 'id'>) {
    await delay()
    const state = loadState()
    const user = { ...input, id: uid('user') }
    saveState({ ...state, users: [...state.users, user] })
    return user
  },
  async deleteUser(id: string) {
    await delay()
    const state = loadState()
    saveState({ ...state, users: state.users.filter((item) => item.id !== id) })
    return id
  },
  async updateSettings(settings: AppSettings) {
    await delay()
    const state = loadState()
    saveState({ ...state, settings })
    return settings
  },
  async addReceiptScan(scan: ReceiptScanResult) {
    await delay()
    const state = loadState()
    saveState({ ...state, receiptScans: [scan, ...state.receiptScans].slice(0, 30) })
    return scan
  },
}

export function getAccountBalances(accounts: Account[], transactions: Transaction[], month = new Date().toISOString().slice(0, 7)): AccountBalance[] {
  return accounts.map((account) => {
    let balance = account.balance ?? account.startingBalance ?? 0
    let monthlyIncome = 0
    let monthlyExpense = 0

    for (const transaction of transactions) {
      if (transaction.type === 'income' && transaction.accountId === account.id) {
        balance += transaction.amount
        if (transaction.date.startsWith(month)) monthlyIncome += transaction.amount
      }
      if (transaction.type === 'expense' && transaction.accountId === account.id) {
        balance -= transaction.amount
        if (transaction.date.startsWith(month)) monthlyExpense += transaction.amount
      }
      if (transaction.type === 'transfer') {
        if (transaction.accountId === account.id) balance -= transaction.amount
        if (transaction.toAccountId === account.id) balance += transaction.amount
      }
    }

    return { ...account, balance, monthlyIncome, monthlyExpense }
  })
}
