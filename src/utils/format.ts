import type { Currency } from '../types'

export function formatMoney(value: number, currency: Currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  )
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(`${month}-01T00:00:00`),
  )
}

export function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}
