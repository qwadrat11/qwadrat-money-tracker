export type SupportedCurrency = 'USD' | 'EUR' | 'UAH'

export type TransactionNoteData = {
  paymentMethod: string
  currency: SupportedCurrency
  format: 'empty' | 'legacy' | 'json'
  raw: string
}

type TransactionNoteInput = string | null | undefined | Record<string, unknown>

function normalizeCurrency(value: unknown, fallback: SupportedCurrency): SupportedCurrency {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'EUR' || normalized === 'UAH' || normalized === 'USD') return normalized
  return fallback
}

function normalizePaymentMethod(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function decodeTransactionNote(note: TransactionNoteInput, fallbackCurrency: SupportedCurrency = 'USD'): TransactionNoteData {
  if (note == null) return { paymentMethod: '', currency: fallbackCurrency, format: 'empty', raw: '' }

  if (typeof note === 'object') {
    return {
      paymentMethod: normalizePaymentMethod(note.paymentMethod) || normalizePaymentMethod(note.payment_method) || normalizePaymentMethod(note.method) || normalizePaymentMethod(note.paymentMethodName),
      currency: normalizeCurrency(note.currency ?? note.currencyCode ?? note.currency_code, fallbackCurrency),
      format: 'json',
      raw: JSON.stringify(note),
    }
  }

  const raw = String(note)
  const trimmed = raw.trim()
  if (!trimmed) return { paymentMethod: '', currency: fallbackCurrency, format: 'empty', raw }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed === 'string') return { paymentMethod: parsed.trim(), currency: fallbackCurrency, format: 'json', raw }
    if (Array.isArray(parsed)) return { paymentMethod: normalizePaymentMethod(parsed[0]) || raw, currency: normalizeCurrency(parsed[1], fallbackCurrency), format: 'json', raw }
    if (isPlainObject(parsed)) {
      return {
        paymentMethod: normalizePaymentMethod(parsed.paymentMethod) || normalizePaymentMethod(parsed.payment_method) || normalizePaymentMethod(parsed.method) || normalizePaymentMethod(parsed.paymentMethodName) || raw,
        currency: normalizeCurrency(parsed.currency ?? parsed.currencyCode ?? parsed.currency_code, fallbackCurrency),
        format: 'json',
        raw,
      }
    }
  } catch {
    // Broken historical JSON is valid legacy text and must not abort a sync.
  }
  return { paymentMethod: raw, currency: fallbackCurrency, format: 'legacy', raw }
}

export function encodeTransactionNote(paymentMethod: string, currency: SupportedCurrency) {
  return JSON.stringify({ paymentMethod: paymentMethod.trim(), currency })
}
