import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { financeRepository, getInitialState, type PersistedState } from '../services/storage'
import type { Account, AppSettings, Category, ReceiptScanResult, Transaction, User } from '../types'

const financeKey = ['finance-state'] as const

export function useFinanceStore() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: financeKey,
    queryFn: financeRepository.getState,
    initialData: getInitialState,
  })

  const state = query.data

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.settings.theme === 'dark')
  }, [state.settings.theme])

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: financeKey })
  }

  function optimistic(updater: (state: PersistedState) => PersistedState) {
    queryClient.setQueryData<PersistedState>(financeKey, (previous) => updater(previous ?? getInitialState()))
  }

  const addTransaction = useMutation({
    mutationFn: financeRepository.addTransaction,
    onSuccess: invalidate,
  })
  const duplicateTransaction = useMutation({
    mutationFn: financeRepository.duplicateTransaction,
    onSuccess: invalidate,
  })
  const updateTransaction = useMutation({
    mutationFn: financeRepository.updateTransaction,
    onSuccess: invalidate,
  })
  const deleteTransaction = useMutation({
    mutationFn: financeRepository.deleteTransaction,
    onMutate: (id) => optimistic((prev) => ({ ...prev, transactions: prev.transactions.filter((item) => item.id !== id) })),
    onSuccess: invalidate,
  })
  const clearTransactions = useMutation({
    mutationFn: financeRepository.clearTransactions,
    onSuccess: invalidate,
  })
  const addAccount = useMutation({
    mutationFn: financeRepository.addAccount,
    onSuccess: invalidate,
  })
  const duplicateAccount = useMutation({
    mutationFn: financeRepository.duplicateAccount,
    onSuccess: invalidate,
  })
  const updateAccount = useMutation({
    mutationFn: financeRepository.updateAccount,
    onSuccess: invalidate,
  })
  const reorderAccount = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => financeRepository.reorderAccount(id, direction),
    onSuccess: invalidate,
  })
  const archiveAccount = useMutation({
    mutationFn: financeRepository.archiveAccount,
    onSuccess: invalidate,
  })
  const deleteAccount = useMutation({
    mutationFn: financeRepository.deleteAccount,
    onSuccess: invalidate,
  })
  const addCategory = useMutation({
    mutationFn: financeRepository.addCategory,
    onSuccess: invalidate,
  })
  const duplicateCategory = useMutation({
    mutationFn: financeRepository.duplicateCategory,
    onSuccess: invalidate,
  })
  const updateCategory = useMutation({
    mutationFn: financeRepository.updateCategory,
    onSuccess: invalidate,
  })
  const reorderCategory = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => financeRepository.reorderCategory(id, direction),
    onSuccess: invalidate,
  })
  const deleteCategory = useMutation({
    mutationFn: financeRepository.deleteCategory,
    onSuccess: invalidate,
  })
  const addUser = useMutation({
    mutationFn: financeRepository.addUser,
    onSuccess: invalidate,
  })
  const updateUser = useMutation({
    mutationFn: financeRepository.updateUser,
    onSuccess: invalidate,
  })
  const deleteUser = useMutation({
    mutationFn: financeRepository.deleteUser,
    onSuccess: invalidate,
  })
  const updateSettings = useMutation({
    mutationFn: financeRepository.updateSettings,
    onSuccess: invalidate,
  })
  const resetDemoData = useMutation({
    mutationFn: financeRepository.resetDemoData,
    onSuccess: invalidate,
  })
  const generateDemoData = useMutation({
    mutationFn: financeRepository.generateDemoData,
    onSuccess: invalidate,
  })
  const addReceiptScan = useMutation({
    mutationFn: financeRepository.addReceiptScan,
    onSuccess: invalidate,
  })

  return {
    ...state,
    isLoading: query.isLoading,
    isSaving:
      addTransaction.isPending ||
      duplicateTransaction.isPending ||
      updateTransaction.isPending ||
      deleteTransaction.isPending ||
      clearTransactions.isPending ||
      addAccount.isPending ||
      duplicateAccount.isPending ||
      updateAccount.isPending ||
      reorderAccount.isPending ||
      archiveAccount.isPending ||
      deleteAccount.isPending ||
      addCategory.isPending ||
      duplicateCategory.isPending ||
      updateCategory.isPending ||
      reorderCategory.isPending ||
      deleteCategory.isPending ||
      addUser.isPending ||
      updateUser.isPending ||
      deleteUser.isPending ||
      updateSettings.isPending ||
      resetDemoData.isPending ||
      generateDemoData.isPending,
    actions: {
      addTransaction: (input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => addTransaction.mutateAsync(input),
      duplicateTransaction: (id: string) => duplicateTransaction.mutateAsync(id),
      updateTransaction: (input: Transaction) => updateTransaction.mutateAsync(input),
      deleteTransaction: (id: string) => deleteTransaction.mutateAsync(id),
      clearTransactions: () => clearTransactions.mutateAsync(),
      addAccount: (input: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => addAccount.mutateAsync(input),
      duplicateAccount: (id: string) => duplicateAccount.mutateAsync(id),
      updateAccount: (input: Account) => updateAccount.mutateAsync(input),
      reorderAccount: (id: string, direction: 'up' | 'down') => reorderAccount.mutateAsync({ id, direction }),
      archiveAccount: (id: string) => archiveAccount.mutateAsync(id),
      deleteAccount: (id: string) => deleteAccount.mutateAsync(id),
      addCategory: (input: Omit<Category, 'id' | 'isDefault'>) => addCategory.mutateAsync(input),
      duplicateCategory: (id: string) => duplicateCategory.mutateAsync(id),
      updateCategory: (input: Category) => updateCategory.mutateAsync(input),
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
  }
}
