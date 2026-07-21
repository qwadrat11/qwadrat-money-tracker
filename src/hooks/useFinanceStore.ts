import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { defaultSettings } from '../data/demoData'
import { clearState as clearLegacyState, loadLegacyState } from '../services/storage'
import {
  clearTransactions as clearRemoteTransactions,
  createAccount,
  createCategory,
  createTransaction,
  deleteAccount as deleteRemoteAccount,
  deleteCategory as deleteRemoteCategory,
  deleteTransaction as deleteRemoteTransaction,
  generateDemoData as generateRemoteDemoData,
  getUserData,
  importLegacyData,
  resetDemoData as resetRemoteDemoData,
  updateAccount as updateRemoteAccount,
  updateCategory as updateRemoteCategory,
  updateSettings as updateRemoteSettings,
  updateTransaction as updateRemoteTransaction,
  type SupabaseFinanceState,
} from '../services/supabaseData'
import type { Account, AppSettings, Category, ReceiptScanResult, Transaction, User } from '../types'

const financeKey = ['finance-state']
const migrationKeyPrefix = 'qwadrat-finance-tracker:migration'

type MigrationState = {
  status: 'idle' | 'available' | 'importing' | 'skipped' | 'done'
  legacy?: ReturnType<typeof loadLegacyState>
}

function emptyFinanceState(): SupabaseFinanceState {
  return {
    accounts: [],
    categories: [],
    transactions: [],
    settings: { ...defaultSettings, monthlyBudget: 0 },
    users: [],
    receiptScans: [],
    budget: null,
    wasSeeded: false,
  }
}

function toggleTheme(theme: AppSettings['theme']) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function useFinanceStore() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [migrationState, setMigrationState] = useState<MigrationState>({ status: 'idle' })

  useEffect(() => {
    if (activeUserId === userId) return

    void queryClient.cancelQueries({ queryKey: financeKey, exact: false })
    queryClient.removeQueries({ queryKey: financeKey, exact: false })
    setMigrationState({ status: 'idle' })
    setActiveUserId(userId)
  }, [activeUserId, queryClient, userId])

  const query = useQuery({
    queryKey: [...financeKey, userId],
    queryFn: () => getUserData(),
    enabled: Boolean(userId && activeUserId === userId),
  })

  const state = activeUserId === userId ? query.data ?? emptyFinanceState() : emptyFinanceState()

  useEffect(() => {
    toggleTheme(state.settings.theme)
  }, [state.settings.theme])

  useEffect(() => {
    if (!userId || !supabase || activeUserId !== userId) return

    const channel = supabase.channel(`finance-sync:${userId}`)
    const tables = ['accounts', 'categories', 'transactions', 'budgets', 'app_settings'] as const

    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: [...financeKey, userId] })
        },
      )
    }

    void channel.subscribe()

    const client = supabase
    return () => {
      void client.removeChannel(channel)
    }
  }, [activeUserId, queryClient, userId])

  useEffect(() => {
    if (!userId || !query.data || activeUserId !== userId) return

    const legacy = loadLegacyState()
    const flagKey = `${migrationKeyPrefix}:${userId}`
    const migrationFlag = localStorage.getItem(flagKey)

    if (migrationFlag === 'imported') {
      setMigrationState({ status: 'done' })
      return
    }
    if (migrationFlag === 'skipped') {
      setMigrationState({ status: 'skipped' })
      return
    }
    if (legacy && query.data.wasSeeded && (legacy.accounts.length || legacy.categories.length || legacy.transactions.length || legacy.users.length || legacy.receiptScans.length)) {
      setMigrationState({ status: 'available', legacy })
      return
    }
    setMigrationState({ status: 'idle' })
  }, [activeUserId, query.data, userId])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...financeKey, userId] })

  const addTransaction = useMutation({
    mutationFn: createTransaction,
    onSuccess: invalidate,
  })
  const duplicateTransaction = useMutation({
    mutationFn: async (id: string) => {
      const source = state.transactions.find((transaction) => transaction.id === id)
      if (!source) return id
      return createTransaction({
        type: source.type,
        date: source.date,
        amount: source.amount,
        categoryId: source.categoryId,
        accountId: source.accountId,
        toAccountId: source.toAccountId,
        description: `${source.description} (копия)`,
        paymentMethod: source.paymentMethod,
        currency: source.currency,
        userId: source.userId,
      })
    },
    onSuccess: invalidate,
  })
  const updateTransaction = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Transaction> }) => updateRemoteTransaction(id, patch),
    onSuccess: invalidate,
  })
  const deleteTransaction = useMutation({
    mutationFn: deleteRemoteTransaction,
    onSuccess: invalidate,
  })
  const clearTransactions = useMutation({
    mutationFn: clearRemoteTransactions,
    onSuccess: invalidate,
  })
  const addAccount = useMutation({
    mutationFn: createAccount,
    onSuccess: invalidate,
  })
  const duplicateAccount = useMutation({
    mutationFn: async (id: string) => {
      const source = state.accounts.find((account) => account.id === id)
      if (!source) return id
      return createAccount({
        ...source,
        name: `${source.name} (копия)`,
      })
    },
    onSuccess: invalidate,
  })
  const updateAccount = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Account> }) => updateRemoteAccount(id, patch),
    onSuccess: invalidate,
  })
  const reorderAccount = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      const index = state.accounts.findIndex((account) => account.id === id)
      if (index < 0) return id
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= state.accounts.length) return id
      const current = state.accounts[index]
      const next = state.accounts[target]
      await updateRemoteAccount(current.id, { createdAt: next.createdAt })
      await updateRemoteAccount(next.id, { createdAt: current.createdAt })
      return id
    },
    onSuccess: invalidate,
  })
  const archiveAccount = useMutation({
    mutationFn: async (id: string) => updateRemoteAccount(id, { archived: true }),
    onSuccess: invalidate,
  })
  const deleteAccount = useMutation({
    mutationFn: deleteRemoteAccount,
    onSuccess: invalidate,
  })
  const addCategory = useMutation({
    mutationFn: createCategory,
    onSuccess: invalidate,
  })
  const duplicateCategory = useMutation({
    mutationFn: async (id: string) => {
      const source = state.categories.find((category) => category.id === id)
      if (!source) return id
      return createCategory({
        ...source,
        name: `${source.name} (копия)`,
      })
    },
    onSuccess: invalidate,
  })
  const updateCategory = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Category> & { createdAt?: string } }) => updateRemoteCategory(id, patch),
    onSuccess: invalidate,
  })
  const reorderCategory = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      const index = state.categories.findIndex((category) => category.id === id)
      if (index < 0) return id
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= state.categories.length) return id
      const current = state.categories[index]
      const next = state.categories[target]
      await updateRemoteCategory(current.id, { createdAt: next.createdAt })
      await updateRemoteCategory(next.id, { createdAt: current.createdAt })
      return id
    },
    onSuccess: invalidate,
  })
  const deleteCategory = useMutation({
    mutationFn: deleteRemoteCategory,
    onSuccess: invalidate,
  })
  const updateSettings = useMutation({
    mutationFn: updateRemoteSettings,
    onSuccess: invalidate,
  })
  const resetDemoData = useMutation({
    mutationFn: resetRemoteDemoData,
    onSuccess: invalidate,
  })
  const generateDemoData = useMutation({
    mutationFn: generateRemoteDemoData,
    onSuccess: invalidate,
  })
  const addReceiptScan = useMutation({
    mutationFn: async (scan: ReceiptScanResult) => {
      await updateRemoteSettings({
        ...state.settings,
        users: state.users,
        receiptScans: [scan, ...(state.receiptScans ?? [])].slice(0, 30),
      })
      return scan
    },
    onSuccess: invalidate,
  })
  const addUser = useMutation({
    mutationFn: async (input: Omit<User, 'id'>) => {
      await updateRemoteSettings({
        ...state.settings,
        users: [...state.users, { ...input, id: crypto.randomUUID() }],
        receiptScans: state.receiptScans,
      })
    },
    onSuccess: invalidate,
  })
  const updateUser = useMutation({
    mutationFn: async (input: User) => {
      await updateRemoteSettings({
        ...state.settings,
        users: state.users.map((item) => (item.id === input.id ? input : item)),
        receiptScans: state.receiptScans,
      })
    },
    onSuccess: invalidate,
  })
  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      await updateRemoteSettings({
        ...state.settings,
        users: state.users.filter((item) => item.id !== id),
        receiptScans: state.receiptScans,
      })
    },
    onSuccess: invalidate,
  })

  async function importLocalData() {
    if (!userId || !migrationState.legacy) return
    setMigrationState((current) => ({ ...current, status: 'importing' }))
    await importLegacyData(migrationState.legacy)
    clearLegacyState()
    localStorage.setItem(`${migrationKeyPrefix}:${userId}`, 'imported')
    setMigrationState({ status: 'done' })
    await invalidate()
  }

  function skipLocalDataImport() {
    if (!userId) return
    localStorage.setItem(`${migrationKeyPrefix}:${userId}`, 'skipped')
    setMigrationState({ status: 'skipped' })
  }

  return {
    ...state,
    isLoading: Boolean(userId) && activeUserId !== userId || (query.isLoading && !query.data),
    isError: query.isError,
    error: query.error,
    migration: migrationState,
    actions: {
      addTransaction: (input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => addTransaction.mutateAsync(input),
      duplicateTransaction: (id: string) => duplicateTransaction.mutateAsync(id),
      updateTransaction: (input: Transaction) => updateTransaction.mutateAsync({ id: input.id, patch: input }),
      deleteTransaction: (id: string) => deleteTransaction.mutateAsync(id),
      clearTransactions: () => clearTransactions.mutateAsync(),
      addAccount: (input: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => addAccount.mutateAsync(input),
      duplicateAccount: (id: string) => duplicateAccount.mutateAsync(id),
      updateAccount: (input: Account) => updateAccount.mutateAsync({ id: input.id, patch: input }),
      reorderAccount: (id: string, direction: 'up' | 'down') => reorderAccount.mutateAsync({ id, direction }),
      archiveAccount: (id: string) => archiveAccount.mutateAsync(id),
      deleteAccount: (id: string) => deleteAccount.mutateAsync(id),
      addCategory: (input: Omit<Category, 'id' | 'isDefault'>) => addCategory.mutateAsync(input),
      duplicateCategory: (id: string) => duplicateCategory.mutateAsync(id),
      updateCategory: (input: Category) => updateCategory.mutateAsync({ id: input.id, patch: input }),
      reorderCategory: (id: string, direction: 'up' | 'down') => reorderCategory.mutateAsync({ id, direction }),
      deleteCategory: (id: string) => deleteCategory.mutateAsync(id),
      addUser: (input: Omit<User, 'id'>) => addUser.mutateAsync(input),
      updateUser: (input: User) => updateUser.mutateAsync(input),
      deleteUser: (id: string) => deleteUser.mutateAsync(id),
      updateSettings: (input: AppSettings) => updateSettings.mutateAsync(input),
      resetDemoData: () => resetDemoData.mutateAsync(),
      generateDemoData: () => generateDemoData.mutateAsync(),
      addReceiptScan: (input: ReceiptScanResult) => addReceiptScan.mutateAsync(input),
    },
    refetch: () => query.refetch(),
    importLocalData,
    skipLocalDataImport,
  }
}
