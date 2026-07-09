import type { Account, AppSettings, Category, Transaction, User } from '../types'

export const defaultCategories: Category[] = [
  { id: 'food', name: 'Еда', icon: 'Utensils', color: '#525252', type: 'expense', isDefault: true },
  { id: 'transport', name: 'Транспорт', icon: 'Train', color: '#737373', type: 'expense', isDefault: true },
  { id: 'home', name: 'Дом', icon: 'Home', color: '#404040', type: 'expense', isDefault: true },
  { id: 'health', name: 'Здоровье', icon: 'HeartPulse', color: '#737373', type: 'expense', isDefault: true },
  { id: 'entertainment', name: 'Развлечения', icon: 'Sparkles', color: '#525252', type: 'expense', isDefault: true },
  { id: 'subscriptions', name: 'Подписки', icon: 'Repeat', color: '#404040', type: 'expense', isDefault: true },
  { id: 'shopping', name: 'Покупки', icon: 'ShoppingBag', color: '#737373', type: 'expense', isDefault: true },
  { id: 'car', name: 'Авто', icon: 'Car', color: '#525252', type: 'expense', isDefault: true },
  { id: 'other', name: 'Другое', icon: 'CircleEllipsis', color: '#737373', type: 'expense', isDefault: true },
  { id: 'salary', name: 'Зарплата', icon: 'BriefcaseBusiness', color: '#262626', type: 'income', isDefault: true },
  { id: 'freelance', name: 'Фриланс', icon: 'Laptop', color: '#404040', type: 'income', isDefault: true },
]

export const demoUsers: User[] = [
  { id: 'u-1', name: 'Алексей Морозов', email: 'alex@example.com', role: 'admin', status: 'active' },
  { id: 'u-2', name: 'Мария Иванова', email: 'mira@example.com', role: 'user', status: 'active' },
  { id: 'u-3', name: 'Иван Петров', email: 'ivan@example.com', role: 'user', status: 'invited' },
]

export const demoAccounts: Account[] = [
  account('acc-card', 'Основная карта', 'bank_card', 1250, 'CreditCard', '#525252'),
  account('acc-cash', 'Наличные', 'cash', 320, 'Wallet', '#737373'),
  account('acc-savings', 'Накопления', 'savings', 8200, 'PiggyBank', '#404040'),
  account('acc-crypto', 'Крипто', 'crypto', 940, 'Bitcoin', '#525252'),
]

export const demoTransactions: Transaction[] = [
  tx('t-1', 'income', '2026-07-01', 6200, 'salary', 'acc-card', 'Июльская зарплата', 'Карта'),
  tx('t-2', 'expense', '2026-07-02', 84.5, 'food', 'acc-card', 'Продукты', 'Apple Pay'),
  tx('t-3', 'expense', '2026-07-03', 46, 'transport', 'acc-card', 'Uber и метро', 'Apple Pay'),
  tx('t-4', 'expense', '2026-07-05', 129, 'subscriptions', 'acc-card', 'Подписки на сервисы', 'Карта'),
  tx('t-5', 'expense', '2026-07-07', 310, 'home', 'acc-card', 'Товары для дома', 'Карта'),
  tx('t-6', 'income', '2026-07-08', 1450, 'freelance', 'acc-card', 'Дизайн-аудит', 'Перевод'),
  tx('t-7', 'expense', '2026-07-09', 220, 'shopping', 'acc-card', 'Обувь', 'Карта'),
  tx('t-8', 'expense', '2026-07-11', 74, 'entertainment', 'acc-cash', 'Ужин и кино', 'Наличные'),
  tx('t-9', 'expense', '2026-07-13', 58, 'health', 'acc-card', 'Аптека', 'Apple Pay'),
  tx('t-10', 'expense', '2026-07-15', 96, 'car', 'acc-card', 'Топливо', 'Карта'),
  tx('t-11', 'expense', '2026-06-26', 68, 'food', 'acc-cash', 'Кафе', 'Наличные'),
  tx('t-12', 'transfer', '2026-07-06', 500, 'other', 'acc-card', 'Перевод в накопления', 'Перевод', 'acc-savings'),
]

export const defaultSettings: AppSettings = {
  monthlyBudget: 3600,
  currency: 'USD',
  theme: 'light',
  workspaceName: 'Ledger OS',
  defaultPaymentMethod: 'Apple Pay',
  hasSeenOnboarding: false,
  dashboardWidgetOrder: ['balance', 'expenses', 'income', 'budget', 'quick-actions', 'daily-spending', 'categories', 'balance-history', 'recent-activity'],
}

export function generateDemoTransactions(): Transaction[] {
  const categories = ['food', 'transport', 'home', 'health', 'entertainment', 'subscriptions', 'shopping', 'car']
  const methods = ['Apple Pay', 'Карта', 'Наличные', 'Перевод']
  const today = new Date()
  const generated: Transaction[] = []

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - index)
    const isoDate = date.toISOString().slice(0, 10)
    const isIncome = index % 17 === 0
    generated.push(
      tx(
        `generated-${index}`,
        isIncome ? 'income' : 'expense',
        isoDate,
        isIncome ? 1200 + index * 15 : 18 + ((index * 13) % 240),
        isIncome ? (index % 2 === 0 ? 'salary' : 'freelance') : categories[index % categories.length],
        index % 5 === 0 ? 'acc-cash' : 'acc-card',
        isIncome ? 'Сгенерированный доход' : `Сгенерированный расход ${index + 1}`,
        methods[index % methods.length],
      ),
    )
  }

  return [...demoTransactions, ...generated]
}

function tx(
  id: string,
  type: Transaction['type'],
  date: string,
  amount: number,
  categoryId: string,
  accountId: string,
  description: string,
  paymentMethod: string,
  toAccountId?: string,
): Transaction {
  return {
    id,
    type,
    date,
    amount,
    categoryId,
    accountId,
    toAccountId,
    description,
    paymentMethod,
    currency: 'USD',
    userId: 'u-1',
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
  }
}

function account(
  id: string,
  name: string,
  type: Account['type'],
  startingBalance: number,
  icon: string,
  color: string,
): Account {
  return {
    id,
    name,
    type,
    currency: 'USD',
    icon,
    color,
    balance: startingBalance,
    startingBalance,
    archived: false,
    includeInTotalBalance: true,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  }
}
