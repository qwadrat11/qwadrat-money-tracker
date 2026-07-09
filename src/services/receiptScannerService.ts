import type { Account, AppSettings, Category, ReceiptScanResult } from '../types'
import { getDefaultCategoryId } from '../utils/category'

type ParseReceiptInput = {
  file?: File
  imageName?: string
  categories: Category[]
  accounts: Account[]
  settings: AppSettings
}

export async function parseReceipt(input: ParseReceiptInput): Promise<ReceiptScanResult> {
  const hasApiKey = Boolean(import.meta.env.VITE_OPENAI_API_KEY)
  if (!hasApiKey) {
    return mockReceiptParser(input, 'OpenAI API ключ не настроен. Включен безопасный mock-режим распознавания.')
  }

  try {
    return await mockReceiptParser(input, 'OpenAI Vision пока не подключен. Сформирован качественный mock-результат.')
  } catch {
    return mockReceiptParser(input, 'Не удалось обработать чек. Показан mock-результат, чтобы ничего не сломалось.')
  }
}

async function mockReceiptParser({ file, imageName, categories, accounts, settings }: ParseReceiptInput, message: string): Promise<ReceiptScanResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 700))
  const name = file?.name ?? imageName ?? 'receipt.jpg'
  const seed = name.length
  const total = 38 + seed * 2
  const suggestedCategoryId = getDefaultCategoryId(categories, 'expense')
  const suggestedAccountId = accounts.find((account) => !account.archived)?.id ?? accounts[0]?.id ?? ''

  return {
    total,
    store: seed % 2 === 0 ? 'Супермаркет' : 'Магазин',
    date: new Date().toISOString().slice(0, 10),
    currency: settings.currency,
    items: [
      { name: 'Кофе', quantity: 1, price: 14 },
      { name: 'Йогурт', quantity: 2, price: 10 },
      { name: 'Фрукты', quantity: 1, price: Math.max(total - 24, 8) },
    ],
    suggestedCategoryId,
    suggestedAccountId,
    confidence: 0.91,
    imageName: name,
    source: 'mock',
    message,
  }
}
