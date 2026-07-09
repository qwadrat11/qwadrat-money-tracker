import type { ReceiptScanResult } from '../types'

export async function parseReceiptImage(file: File): Promise<ReceiptScanResult> {
  await new Promise((resolve) => setTimeout(resolve, 650))

  const seed = file.name.length
  const total = 42 + seed * 3

  return {
    total,
    store: seed % 2 === 0 ? 'Whole Foods Market' : 'Target',
    date: new Date().toISOString().slice(0, 10),
    currency: 'USD',
    items: [
      { name: 'Coffee beans', quantity: 1, price: 18 },
      { name: 'Greek yogurt', quantity: 2, price: 12 },
      { name: 'Fruit mix', quantity: 1, price: Math.max(total - 30, 8) },
    ],
    suggestedCategoryId: seed % 2 === 0 ? 'food' : 'shopping',
    suggestedAccountId: 'acc-card',
    confidence: 0.91,
    source: 'mock',
  }
}
