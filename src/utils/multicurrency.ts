import type { Currency, Transaction } from '../types'

// Historical P&L always uses the immutable rate snapshot saved on the transaction.
// Current account valuation is intentionally separate and must use a current-rate snapshot.
export function transactionBaseAmount(transaction: Transaction, baseCurrency: Currency) {
  if (transaction.baseCurrency === baseCurrency && transaction.convertedAmount != null) return transaction.convertedAmount
  if (transaction.currency === baseCurrency) return transaction.amount
  return null
}

export function sumInBaseCurrency(transactions: Transaction[], baseCurrency: Currency) {
  return transactions.reduce((sum, transaction) => sum + (transactionBaseAmount(transaction, baseCurrency) ?? 0), 0)
}

export function hasMissingRateSnapshot(transaction: Transaction, baseCurrency: Currency) {
  return transaction.currency !== baseCurrency && transactionBaseAmount(transaction, baseCurrency) == null
}
