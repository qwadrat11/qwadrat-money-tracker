import { supabase } from '../lib/supabase'
import type { Currency } from '../types'

export type CurrencyConversion = {
  originalAmount: number
  originalCurrency: Currency
  baseCurrency: Currency
  exchangeRate: number
  convertedAmount: number
  exchangeRateDate: string
  exchangeRateSource: 'identity' | 'NBU'
}

export async function previewCurrencyConversion(input: {
  amount: number
  fromCurrency: Currency
  toCurrency: Currency
  date: string
}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.functions.invoke('currency-convert', { body: input })
  if (error) throw new Error('Не удалось получить курс валют. Повторите попытку')
  const result = data as { success?: boolean; data?: CurrencyConversion; error?: { message?: string } }
  if (!result.success || !result.data) throw new Error(result.error?.message ?? 'Не удалось получить курс валют. Повторите попытку')
  return result.data
}
