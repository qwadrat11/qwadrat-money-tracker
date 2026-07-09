import type { Category, TransactionType } from '../types'

export function getDefaultCategoryId(categories: Category[], type: Exclude<TransactionType, 'transfer'>) {
  return categories.find((category) => category.type === type)?.id ?? categories[0]?.id ?? ''
}

export function getTransferCategoryId(categories: Category[]) {
  return categories.find((category) => category.type === 'expense')?.id ?? categories[0]?.id ?? ''
}

export function normalizeCategoryType(type: Category['type']): Exclude<Category['type'], 'both'> {
  return type === 'income' ? 'income' : 'expense'
}
