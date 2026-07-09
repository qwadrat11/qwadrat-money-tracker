import type { ExportRow } from '../types'

export type GoogleSheetsPayload = {
  spreadsheetTitle: string
  range: string
  rows: ExportRow[]
  preparedAt: string
}

export function prepareGoogleSheetsExport(rows: ExportRow[]): GoogleSheetsPayload {
  return {
    spreadsheetTitle: 'Экспорт личных финансов',
    range: 'Операции!A:H',
    rows,
    preparedAt: new Date().toISOString(),
  }
}

export function toCsv(rows: ExportRow[]) {
  const header = ['Дата', 'Тип', 'Счет', 'Категория', 'Описание', 'Способ оплаты', 'Сумма', 'Валюта']
  const lines = rows.map((row) =>
    [
      row.date,
      row.type,
      row.account,
      row.category,
      row.description,
      row.paymentMethod,
      row.amount,
      row.currency,
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(','),
  )

  return [header.join(','), ...lines].join('\n')
}
