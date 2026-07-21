import type { AccountType } from '../types'

export const accountTypeLabels: Record<AccountType, string> = {
  cash: 'Наличные',
  bank_card: 'Банковская карта',
  savings: 'Накопления',
  crypto: 'Крипто',
  crypto_portfolio: 'Криптопортфель',
  credit_card: 'Кредитная карта',
  other: 'Другое',
}

export const accountIconNames = ['Wallet', 'CreditCard', 'PiggyBank', 'Bitcoin', 'Landmark', 'CircleEllipsis'] as const

export const accountIconLabels: Record<(typeof accountIconNames)[number], string> = {
  Wallet: 'Кошелек',
  CreditCard: 'Карта',
  PiggyBank: 'Копилка',
  Bitcoin: 'Крипто',
  Landmark: 'Банк',
  CircleEllipsis: 'Другое',
}
