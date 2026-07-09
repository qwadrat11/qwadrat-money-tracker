import { supabase } from '../lib/supabase'
import { defaultCategories, defaultSettings, demoUsers } from '../data/demoData'
import type { Account, AppSettings, Category, Currency, ReceiptScanResult, Transaction, User } from '../types'
import { normalizeCategoryType } from '../utils/category'

type ProfileRow = {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
  updated_at: string
}

type AccountRow = {
  id: string
  user_id: string
  name: string
  type: Account['type']
  balance: number | string | null
  currency: Currency | null
  icon: string | null
  color: string | null
  is_archived: boolean | null
  include_in_total: boolean | null
  created_at: string
  updated_at: string
}

type CategoryRow = {
  id: string
  user_id: string
  name: string
  type: Category['type']
  icon: string | null
  color: string | null
  created_at: string
  updated_at: string
}

type TransactionRow = {
  id: string
  user_id: string
  account_id: string | null
  category_id: string | null
  type: Transaction['type']
  amount: number | string
  title: string
  note: string | null
  date: string
  created_at: string
  updated_at: string
  to_account_id?: string | null
}

type BudgetRow = {
  id: string
  user_id: string
  month: string
  limit_amount: number | string
  created_at: string
  updated_at: string
}

type AppSettingsRow = {
  id: string
  user_id: string
  data: unknown
  created_at: string
  updated_at: string
}

type SettingsData = AppSettings & {
  users?: User[]
  receiptScans?: ReceiptScanResult[]
}

export type SupabaseFinanceState = {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  settings: SettingsData
  users: User[]
  receiptScans: ReceiptScanResult[]
  budget: BudgetRow | null
  wasSeeded: boolean
  profile?: ProfileRow
}

type AccountInput = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>
type CategoryInput = Omit<Category, 'id' | 'isDefault'>
type TransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
  createdAt?: string
  updatedAt?: string
}

const currentMonth = () => new Date().toISOString().slice(0, 7)

type QueryErrorLike = {
  message?: string
  code?: string | null
  details?: string | null
  hint?: string | null
}

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase Auth не настроен')
  }
  return supabase
}

async function getAuthedUser() {
  const client = ensureSupabase()
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Сначала войдите в аккаунт')
  return data.user
}

function now() {
  return new Date().toISOString()
}

function logSupabaseError(label: string, error: QueryErrorLike) {
  if (!import.meta.env.DEV) return
  console.error(label, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  })
}

function toSupabaseError(label: string, error: QueryErrorLike, fallback = 'Не удалось загрузить данные из Supabase') {
  logSupabaseError(label, error)
  const suffix = [
    error.message ? `message: ${error.message}` : null,
    error.code ? `code: ${error.code}` : null,
    error.details ? `details: ${error.details}` : null,
    error.hint ? `hint: ${error.hint}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
  return new Error(`${fallback}${suffix ? ` (${suffix})` : ''}`)
}

async function runQuery<T>(
  label: string,
  query: PromiseLike<{ data: T | null; error: QueryErrorLike | null }>,
  fallback = 'Не удалось загрузить данные из Supabase',
) {
  const result = await query
  if (result.error) {
    throw toSupabaseError(label, result.error, fallback)
  }
  return result.data
}

function asNumber(value: number | string | null | undefined) {
  return Number(value ?? 0)
}

function encodeTransactionNote(paymentMethod: string, currency: Currency) {
  return JSON.stringify({ paymentMethod, currency })
}

function decodeTransactionNote(note: string | null | undefined, fallbackCurrency: Currency = 'USD') {
  if (!note) return { paymentMethod: '', currency: fallbackCurrency }
  try {
    const parsed = JSON.parse(note) as Partial<{ paymentMethod: string; currency: Currency }>
    if (parsed && typeof parsed === 'object') {
      return {
        paymentMethod: parsed.paymentMethod ?? note,
        currency: parsed.currency ?? fallbackCurrency,
      }
    }
  } catch {
    return { paymentMethod: note, currency: fallbackCurrency }
  }
  return { paymentMethod: note, currency: fallbackCurrency }
}

function parseSettingsData(raw: unknown): SettingsData {
  const source = (raw ?? {}) as Partial<SettingsData>
  return {
    ...defaultSettings,
    ...source,
    users: Array.isArray(source.users) ? source.users : demoUsers,
    receiptScans: Array.isArray(source.receiptScans) ? source.receiptScans : [],
    dashboardWidgetOrder: normalizeDashboardOrder(source.dashboardWidgetOrder ?? defaultSettings.dashboardWidgetOrder),
  }
}

function normalizeDashboardOrder(order: string[]) {
  const defaultOrder = defaultSettings.dashboardWidgetOrder
  const known = new Set(defaultOrder)
  const filtered = order.filter((item): item is string => known.has(item))
  return [...filtered, ...defaultOrder.filter((item) => !filtered.includes(item))]
}

function mapProfile(row: ProfileRow | null | undefined, email: string): ProfileRow {
  return {
    id: row?.id ?? '',
    email: row?.email ?? email,
    display_name: row?.display_name ?? email.split('@')[0] ?? 'qwadrat',
    created_at: row?.created_at ?? now(),
    updated_at: row?.updated_at ?? now(),
  }
}

function mapAccount(row: AccountRow): Account {
  const balance = asNumber(row.balance)
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency ?? 'USD',
    icon: row.icon ?? 'Wallet',
    color: row.color ?? '#525252',
    balance,
    startingBalance: balance,
    archived: row.is_archived ?? false,
    includeInTotalBalance: row.include_in_total ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon ?? 'CircleEllipsis',
    color: row.color ?? '#737373',
    type: normalizeCategoryType(row.type),
    isDefault: defaultCategories.some((category) => category.name === row.name),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTransaction(row: TransactionRow, fallbackAccountId: string, fallbackCategoryId: string, fallbackCurrency: Currency = 'USD'): Transaction {
  const note = decodeTransactionNote(row.note, fallbackCurrency)
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    date: row.date.slice(0, 10),
    amount: asNumber(row.amount),
    categoryId: row.category_id ?? fallbackCategoryId,
    accountId: row.account_id ?? fallbackAccountId,
    toAccountId: row.to_account_id ?? undefined,
    description: row.title,
    paymentMethod: note.paymentMethod,
    currency: note.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBudget(row: BudgetRow | null | undefined) {
  return {
    month: row?.month ?? currentMonth(),
    limitAmount: asNumber(row?.limit_amount ?? defaultSettings.monthlyBudget),
  }
}

async function ensureProfile(userId: string, email: string) {
  const client = ensureSupabase()
  const profile = mapProfile(null, email)
  const result = await client.from('profiles').upsert(
    {
      id: userId,
      email,
      display_name: profile.display_name,
      updated_at: now(),
    },
    { onConflict: 'id' },
  )
  if (result.error) throw toSupabaseError('Failed to upsert profile', result.error)
}

async function ensureSeedData(userId: string, email: string) {
  const client = ensureSupabase()
  const [profileResult, settingsResult] = await Promise.all([
    client.from('profiles').select('id').eq('id', userId).maybeSingle(),
    client.from('app_settings').select('id, data').eq('user_id', userId).limit(1),
  ])

  if (profileResult.error) throw toSupabaseError('Failed to load profile seed probe', profileResult.error)
  if (settingsResult.error) throw toSupabaseError('Failed to load app_settings seed probe', settingsResult.error)

  const shouldSeedSettings = (settingsResult.data?.length ?? 0) === 0
  if (shouldSeedSettings) {
    const result = await client.from('app_settings').insert({
      user_id: userId,
      data: {},
    })
    if (result.error) throw toSupabaseError('Failed to seed app_settings', result.error)
  } else {
    const current = parseSettingsData(settingsResult.data?.[0] ? (settingsResult.data[0] as { data?: unknown }).data : {})
    const result = await client
      .from('app_settings')
      .update({
        data: current,
        updated_at: now(),
      })
      .eq('user_id', userId)
    if (result.error) throw toSupabaseError('Failed to update app_settings seed data', result.error)
  }

  await ensureProfile(userId, email)
  return shouldSeedSettings
}

async function fetchRawData(userId: string, email: string) {
  const client = ensureSupabase()
  const accounts = await runQuery<AccountRow[]>(
    'Failed to load accounts',
    client.from('accounts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
  )
  const categories = await runQuery<CategoryRow[]>(
    'Failed to load categories',
    client.from('categories').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
  )
  const transactions = await runQuery<TransactionRow[]>(
    'Failed to load transactions',
    client
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
  )
  const budgets = await runQuery<BudgetRow[]>(
    'Failed to load budgets',
    client.from('budgets').select('*').eq('user_id', userId).order('month', { ascending: false }).limit(12),
  )
  const settings = await runQuery<AppSettingsRow | null>(
    'Failed to load app_settings',
    client.from('app_settings').select('*').eq('user_id', userId).maybeSingle(),
  )
  const profile = await runQuery<ProfileRow | null>(
    'Failed to load profiles',
    client.from('profiles').select('*').eq('id', userId).maybeSingle(),
  )

  const mappedAccounts = (accounts ?? []).map(mapAccount)
  const fallbackAccountId = mappedAccounts[0]?.id ?? ''
  const mappedCategories = (categories ?? []).map(mapCategory)
  const fallbackCategoryId = mappedCategories[0]?.id ?? ''
  const mappedTransactions = (transactions ?? []).map((row) => mapTransaction(row, fallbackAccountId, fallbackCategoryId, mappedAccounts[0]?.currency ?? 'USD'))
  const budgetRow = (budgets ?? [])[0] ?? null
  const budget = mapBudget(budgetRow)
  const settingsData = parseSettingsData(settings?.data ?? {})
  settingsData.monthlyBudget = budget.limitAmount
  const users = Array.isArray(settingsData.users) ? settingsData.users : demoUsers
  const receiptScans = Array.isArray(settingsData.receiptScans) ? settingsData.receiptScans : []

  return {
    accounts: mappedAccounts,
    categories: mappedCategories,
    transactions: mappedTransactions,
    settings: settingsData,
    users,
    receiptScans,
    budget: budgetRow,
    profile: mapProfile(profile, email),
  }
}

export async function getUserData(_userId?: string): Promise<SupabaseFinanceState> {
  const user = await getAuthedUser()
  if (import.meta.env.DEV) {
    console.log('Current user:', user.id)
  }
  const wasSeeded = await ensureSeedData(user.id, user.email ?? '')
  const state = await fetchRawData(user.id, user.email ?? '')
  if (import.meta.env.DEV) {
    console.log('Loaded accounts:', state.accounts.length)
    console.log('Loaded transactions:', state.transactions.length)
  }
  return {
    ...state,
    wasSeeded,
  }
}

export async function getAccounts() {
  const { accounts } = await getUserData()
  return accounts
}

export async function getTransactions() {
  const { transactions } = await getUserData()
  return transactions
}

export async function getCategories() {
  const { categories } = await getUserData()
  return categories
}

export async function getBudget(month: string = currentMonth()) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const { data, error } = await client.from('budgets').select('*').eq('user_id', user.id).eq('month', month).maybeSingle()
  if (error) throw error
  return data ? mapBudget(data) : { month, limitAmount: defaultSettings.monthlyBudget }
}

export async function getSettings() {
  const { settings } = await getUserData()
  return settings
}

export async function createAccount(input: AccountInput) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const nowIso = now()
  const row = {
    user_id: user.id,
    name: input.name,
    type: input.type,
    balance: input.balance ?? input.startingBalance ?? 0,
    currency: input.currency,
    icon: input.icon,
    color: input.color,
    is_archived: input.archived ?? false,
    include_in_total: input.includeInTotalBalance ?? true,
    created_at: nowIso,
    updated_at: nowIso,
  }
  const { data, error } = await client.from('accounts').insert(row).select('*').single()
  if (error) throw error
  return mapAccount(data as AccountRow)
}

export async function updateAccount(id: string, patch: Partial<Account>) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const current = await client.from('accounts').select('*').eq('id', id).eq('user_id', user.id).single()
  if (current.error) throw current.error
  const next = {
    name: patch.name ?? (current.data as AccountRow).name,
    type: patch.type ?? (current.data as AccountRow).type,
    balance: patch.balance ?? patch.startingBalance ?? asNumber((current.data as AccountRow).balance),
    currency: patch.currency ?? (current.data as AccountRow).currency ?? 'USD',
    icon: patch.icon ?? (current.data as AccountRow).icon ?? 'Wallet',
    color: patch.color ?? (current.data as AccountRow).color ?? '#525252',
    is_archived: patch.archived ?? (current.data as AccountRow).is_archived ?? false,
    include_in_total: patch.includeInTotalBalance ?? (current.data as AccountRow).include_in_total ?? true,
    created_at: patch.createdAt ?? (current.data as AccountRow).created_at,
    updated_at: now(),
  }
  const { data, error } = await client.from('accounts').update(next).eq('id', id).eq('user_id', user.id).select('*').single()
  if (error) throw error
  return mapAccount(data as AccountRow)
}

export async function createCategory(input: CategoryInput) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const nowIso = now()
  const { data, error } = await client
    .from('categories')
    .insert({
      user_id: user.id,
      name: input.name,
      type: normalizeCategoryType(input.type),
      icon: input.icon,
      color: input.color,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single()
  if (error) throw error
  return mapCategory(data as CategoryRow)
}

export async function updateCategory(id: string, patch: (Partial<Category> & { createdAt?: string })) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const current = await client.from('categories').select('*').eq('id', id).eq('user_id', user.id).single()
  if (current.error) throw current.error
  const { data, error } = await client
    .from('categories')
    .update({
      name: patch.name ?? (current.data as CategoryRow).name,
      type: normalizeCategoryType(patch.type ?? (current.data as CategoryRow).type),
      icon: patch.icon ?? (current.data as CategoryRow).icon ?? 'CircleEllipsis',
      color: patch.color ?? (current.data as CategoryRow).color ?? '#737373',
      created_at: patch.createdAt ?? (current.data as CategoryRow).created_at,
      updated_at: now(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()
  if (error) throw error
  return mapCategory(data as CategoryRow)
}

export async function deleteCategory(id: string) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const [categories, transactions] = await Promise.all([
    client.from('categories').select('*').eq('user_id', user.id),
    client.from('transactions').select('*').eq('user_id', user.id),
  ])
  if (categories.error) throw categories.error
  if (transactions.error) throw transactions.error
  const current = (categories.data ?? []).find((item) => item.id === id) as CategoryRow | undefined
  if (!current) return id
  const fallback = (categories.data ?? []).find((item) => item.id !== id && normalizeCategoryType((item as CategoryRow).type) === normalizeCategoryType(current.type)) as CategoryRow | undefined
  await Promise.all(
    (transactions.data ?? [])
      .filter((item) => item.category_id === id)
      .map((item) =>
        client
          .from('transactions')
          .update({
            category_id: fallback?.id ?? null,
            updated_at: now(),
          })
          .eq('id', item.id)
          .eq('user_id', user.id),
      ),
  )
  const { error } = await client.from('categories').delete().eq('id', id).eq('user_id', user.id)
  if (error) throw error
  return id
}

export async function deleteAccount(id: string) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const [accounts, tx] = await Promise.all([
    client.from('accounts').select('*').eq('user_id', user.id),
    client.from('transactions').select('*').eq('user_id', user.id),
  ])
  if (accounts.error) throw accounts.error
  if (tx.error) throw tx.error

  const currentAccount = (accounts.data ?? []).find((item) => item.id === id) as AccountRow | undefined
  if (!currentAccount) return id
  const fallback = (accounts.data ?? []).find((item) => item.id !== id && !(item as AccountRow).is_archived) as AccountRow | undefined

  if (fallback) {
    await client
      .from('accounts')
      .update({
        balance: asNumber(fallback.balance) + asNumber(currentAccount.balance),
        updated_at: now(),
      })
      .eq('id', fallback.id)
      .eq('user_id', user.id)
  }

  if (fallback) {
    const transactions = (tx.data ?? []) as TransactionRow[]
    const accountChanges = transactions.filter((item) => item.account_id === id || item.to_account_id === id)
    await Promise.all(
      accountChanges.map((item) =>
        client
          .from('transactions')
          .update({
            account_id: item.account_id === id ? fallback.id : item.account_id,
            to_account_id: item.to_account_id === id ? fallback.id : item.to_account_id ?? null,
            updated_at: now(),
          })
          .eq('id', item.id)
          .eq('user_id', user.id),
      ),
    )
  } else {
    await client.from('transactions').delete().eq('user_id', user.id).or(`account_id.eq.${id},to_account_id.eq.${id}`)
  }

  const { error } = await client.from('accounts').delete().eq('id', id).eq('user_id', user.id)
  if (error) throw error
  return id
}

function transactionEffect(transaction: TransactionInput) {
  const amount = transaction.amount
  if (transaction.type === 'income') {
    return [{ accountId: transaction.accountId, delta: amount }]
  }
  if (transaction.type === 'expense') {
    return [{ accountId: transaction.accountId, delta: -amount }]
  }
  return [
    { accountId: transaction.accountId, delta: -amount },
    { accountId: transaction.toAccountId ?? transaction.accountId, delta: amount },
  ]
}

async function applyBalanceDeltas(userId: string, changes: { accountId: string; delta: number }[]) {
  const client = ensureSupabase()
  const merged = new Map<string, number>()
  for (const change of changes) {
    merged.set(change.accountId, (merged.get(change.accountId) ?? 0) + change.delta)
  }
  await Promise.all(
    [...merged.entries()].map(async ([accountId, delta]) => {
      if (!delta) return
      const { data, error } = await client.from('accounts').select('*').eq('id', accountId).eq('user_id', userId).single()
      if (error) throw error
      const current = data as AccountRow
      await client
        .from('accounts')
        .update({
          balance: asNumber(current.balance) + delta,
          updated_at: now(),
        })
        .eq('id', accountId)
        .eq('user_id', userId)
    }),
  )
}

export async function createTransaction(input: TransactionInput) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const nowIso = now()
  const row: Omit<TransactionRow, 'id'> = {
    user_id: user.id,
    account_id: input.accountId,
    category_id: input.categoryId || null,
    type: input.type,
    amount: input.amount,
    title: input.description,
    note: encodeTransactionNote(input.paymentMethod || '', input.currency),
    date: input.date.length > 10 ? input.date.slice(0, 10) : input.date,
    created_at: nowIso,
    updated_at: nowIso,
    to_account_id: input.toAccountId ?? null,
  }
  const { data, error } = await client.from('transactions').insert(row).select('*').single()
  if (error) throw error
  await applyBalanceDeltas(user.id, transactionEffect(input))
  return mapTransaction(data as TransactionRow, input.accountId, input.categoryId, input.currency)
}

export async function updateTransaction(id: string, patch: Partial<Transaction>) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const { data: current, error: currentError } = await client.from('transactions').select('*').eq('id', id).eq('user_id', user.id).single()
  if (currentError) throw currentError
  const previous = current as TransactionRow
  const merged: TransactionInput = {
    id: previous.id,
    userId: previous.user_id,
    type: patch.type ?? previous.type,
    date: (patch.date ?? previous.date).slice(0, 10),
    amount: patch.amount ?? asNumber(previous.amount),
    categoryId: patch.categoryId ?? previous.category_id ?? '',
    accountId: patch.accountId ?? previous.account_id ?? '',
    toAccountId: patch.toAccountId ?? previous.to_account_id ?? undefined,
    description: patch.description ?? previous.title,
    paymentMethod: patch.paymentMethod ?? previous.note ?? '',
    currency: patch.currency ?? 'USD',
    createdAt: previous.created_at,
    updatedAt: now(),
  }
  const { data, error } = await client
    .from('transactions')
    .update({
      account_id: merged.accountId,
      category_id: merged.categoryId,
      type: merged.type,
      amount: merged.amount,
      title: merged.description,
      note: encodeTransactionNote(merged.paymentMethod, merged.currency),
      date: merged.date,
      updated_at: merged.updatedAt,
      to_account_id: merged.toAccountId ?? null,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()
  if (error) throw error

  const oldEffect = transactionEffect({
    ...merged,
    accountId: previous.account_id ?? merged.accountId,
    toAccountId: previous.to_account_id ?? undefined,
    type: previous.type,
    amount: asNumber(previous.amount),
  })
  const newEffect = transactionEffect(merged)
  await applyBalanceDeltas(user.id, [
    ...oldEffect.map((item) => ({ accountId: item.accountId, delta: -item.delta })),
    ...newEffect,
  ])
  return mapTransaction(data as TransactionRow, merged.accountId, merged.categoryId, merged.currency)
}

export async function deleteTransaction(id: string) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const { data, error } = await client.from('transactions').select('*').eq('id', id).eq('user_id', user.id).single()
  if (error) throw error
  const current = data as TransactionRow
  await client.from('transactions').delete().eq('id', id).eq('user_id', user.id)
  const effect = transactionEffect({
    id: current.id,
    userId: current.user_id,
    type: current.type,
    date: current.date,
    amount: asNumber(current.amount),
    categoryId: current.category_id ?? '',
    accountId: current.account_id ?? '',
    toAccountId: current.to_account_id ?? undefined,
    description: current.title,
    paymentMethod: current.note ?? '',
    currency: decodeTransactionNote(current.note).currency,
    createdAt: current.created_at,
    updatedAt: current.updated_at,
  })
  await applyBalanceDeltas(user.id, effect.map((item) => ({ accountId: item.accountId, delta: -item.delta })))
  return id
}

export async function getBudgetRow(month = currentMonth()) {
  return getBudget(month)
}

export async function updateBudget(month: string, limitAmount: number) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const { data, error } = await client
    .from('budgets')
    .upsert(
      {
        user_id: user.id,
        month,
        limit_amount: limitAmount,
        updated_at: now(),
      },
      { onConflict: 'user_id,month' },
    )
    .select('*')
    .single()
  if (error) throw error
  return mapBudget(data as BudgetRow)
}

export async function updateSettings(input: AppSettings) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const payload = {
    ...input,
    users: input.users ?? demoUsers,
    receiptScans: input.receiptScans ?? [],
    dashboardWidgetOrder: normalizeDashboardOrder(input.dashboardWidgetOrder ?? defaultSettings.dashboardWidgetOrder),
  }
  const { data, error } = await client
    .from('app_settings')
    .upsert(
      {
        user_id: user.id,
        data: payload,
        updated_at: now(),
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single()
  if (error) throw error

  await updateBudget(currentMonth(), payload.monthlyBudget)

  const settings = parseSettingsData((data as { data?: unknown }).data)
  settings.monthlyBudget = payload.monthlyBudget
  settings.users = payload.users
  settings.receiptScans = payload.receiptScans
  return settings
}

export async function importLegacyData(legacy: {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  settings: AppSettings
  users: User[]
  receiptScans: ReceiptScanResult[]
}) {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  await client.from('transactions').delete().eq('user_id', user.id)
  await client.from('accounts').delete().eq('user_id', user.id)
  await client.from('categories').delete().eq('user_id', user.id)
  await client.from('budgets').delete().eq('user_id', user.id)
  await client.from('app_settings').delete().eq('user_id', user.id)

  const accountIdMap = new Map<string, string>()
  const categoryIdMap = new Map<string, string>()
  const accountsBase = new Date('2026-07-01T10:00:00.000Z')
  const categoriesBase = new Date('2026-07-01T11:00:00.000Z')

  const accounts = legacy.accounts.map((account, index) => {
    const id = crypto.randomUUID()
    accountIdMap.set(account.id, id)
    return {
      id,
      user_id: user.id,
      name: account.name,
      type: account.type,
      balance: account.balance ?? account.startingBalance ?? 0,
      currency: account.currency,
      icon: account.icon,
      color: account.color,
      is_archived: account.archived,
      include_in_total: account.includeInTotalBalance,
      created_at: new Date(accountsBase.getTime() + index * 1000).toISOString(),
      updated_at: new Date(accountsBase.getTime() + index * 1000).toISOString(),
    }
  })

  const categories = legacy.categories.map((category, index) => {
    const id = crypto.randomUUID()
    categoryIdMap.set(category.id, id)
    return {
      id,
      user_id: user.id,
      name: category.name,
      type: normalizeCategoryType(category.type),
      icon: category.icon,
      color: category.color,
      created_at: new Date(categoriesBase.getTime() + index * 1000).toISOString(),
      updated_at: new Date(categoriesBase.getTime() + index * 1000).toISOString(),
    }
  })

  await client.from('accounts').insert(accounts)
  await client.from('categories').insert(categories)
  await client.from('budgets').insert({
    user_id: user.id,
    month: currentMonth(),
    limit_amount: legacy.settings.monthlyBudget ?? defaultSettings.monthlyBudget,
  })

  const transactions = legacy.transactions.map((transaction) => ({
    id: crypto.randomUUID(),
    user_id: user.id,
    account_id: accountIdMap.get(transaction.accountId) ?? accounts[0]?.id ?? null,
    category_id: categoryIdMap.get(transaction.categoryId) ?? categories[0]?.id ?? null,
    type: transaction.type,
    amount: transaction.amount,
    title: transaction.description,
    note: encodeTransactionNote(transaction.paymentMethod, transaction.currency),
    date: transaction.date,
    created_at: transaction.createdAt,
    updated_at: transaction.updatedAt,
    to_account_id: transaction.toAccountId ? accountIdMap.get(transaction.toAccountId) ?? null : null,
  }))

  if (transactions.length > 0) {
    await client.from('transactions').insert(transactions)
  }

  await updateSettings({
    ...legacy.settings,
    users: legacy.users,
    receiptScans: legacy.receiptScans,
  })
}

export async function clearTransactions() {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  const { error } = await client.from('transactions').delete().eq('user_id', user.id)
  if (error) throw error
}

export async function resetDemoData() {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  await client.from('transactions').delete().eq('user_id', user.id)
  await client.from('accounts').delete().eq('user_id', user.id)
  await client.from('categories').delete().eq('user_id', user.id)
  await client.from('budgets').delete().eq('user_id', user.id)
  await client.from('app_settings').delete().eq('user_id', user.id)
  await ensureSeedData(user.id, user.email ?? '')
}

export async function generateDemoData() {
  const client = ensureSupabase()
  const user = await getAuthedUser()
  await resetDemoData()
  const { data: accountsData, error: accountsError } = await client.from('accounts').select('*').eq('user_id', user.id)
  if (accountsError) throw accountsError
  const { data: categoriesData, error: categoriesError } = await client.from('categories').select('*').eq('user_id', user.id)
  if (categoriesError) throw categoriesError
  const accounts = (accountsData ?? []) as AccountRow[]
  const categories = (categoriesData ?? []) as CategoryRow[]
  const activeAccounts = accounts.filter((account) => !account.is_archived)
  const expenseCategories = categories.filter((category) => normalizeCategoryType(category.type) === 'expense')
  const incomeCategories = categories.filter((category) => normalizeCategoryType(category.type) === 'income')
  const baseDate = new Date()
  const items: Omit<TransactionRow, 'id'>[] = []

  for (let index = 0; index < 24; index += 1) {
    const date = new Date(baseDate)
    date.setDate(baseDate.getDate() - index)
    const isoDate = date.toISOString().slice(0, 10)
    const isIncome = index % 6 === 0
    const account = activeAccounts[index % Math.max(activeAccounts.length, 1)]
    if (!account) break
    const categoryPool = isIncome ? incomeCategories : expenseCategories
    const category = categoryPool[index % Math.max(categoryPool.length, 1)]
    items.push({
      user_id: user.id,
      account_id: account.id,
      category_id: category?.id ?? null,
      type: isIncome ? 'income' : 'expense',
      amount: isIncome ? 1200 + index * 30 : 35 + (index * 13) % 180,
      title: isIncome ? 'Сгенерированный доход' : `Сгенерированный расход ${index + 1}`,
      note: isIncome ? 'Перевод' : 'Карта',
      date: isoDate,
      created_at: `${isoDate}T10:00:00.000Z`,
      updated_at: `${isoDate}T10:00:00.000Z`,
      to_account_id: null,
    })
  }

  if (items.length > 0) {
    await client.from('transactions').insert(items)
    await applyBalanceDeltas(
      user.id,
      items.flatMap((item) =>
        transactionEffect({
          id: crypto.randomUUID(),
          userId: user.id,
          type: item.type,
          date: item.date,
          amount: asNumber(item.amount),
          categoryId: item.category_id ?? '',
          accountId: item.account_id ?? '',
          toAccountId: item.to_account_id ?? undefined,
          description: item.title,
          paymentMethod: decodeTransactionNote(item.note).paymentMethod,
          currency: decodeTransactionNote(item.note).currency,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        }),
      ),
    )
  }
}
