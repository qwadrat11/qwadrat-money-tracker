import { Download, FileJson, Sheet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardDescription, CardTitle } from '../components/ui/Card'
import { useToast } from '../components/ui/toastContext'
import { prepareGoogleSheetsExport, toCsv, type GoogleSheetsPayload } from '../services/googleSheetsExport'
import { tapHaptic } from '../services/haptics'
import type { Account, Category, ExportRow, Transaction } from '../types'
import { downloadFile } from '../utils/export'

export function ExportPage({ transactions, categories, accounts }: { transactions: Transaction[]; categories: Category[]; accounts: Account[] }) {
  const { notify } = useToast()
  const [payload, setPayload] = useState<GoogleSheetsPayload | null>(null)
  const rows: ExportRow[] = useMemo(() => transactions.map((item) => ({
    date: item.date,
    type: typeLabel(item.type),
    account: accounts.find((account) => account.id === item.accountId)?.name ?? 'Счет',
    category: categories.find((category) => category.id === item.categoryId)?.name ?? 'Другое',
    description: item.description,
    paymentMethod: item.paymentMethod,
    amount: item.amount,
    currency: item.currency,
  })), [transactions, categories, accounts])

  return (
    <>
      <PageHeader title="Экспорт" description="Подготовьте данные для бухгалтерии или таблиц." />
      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => { downloadFile('operations.csv', toCsv(rows), 'text/csv;charset=utf-8'); void tapHaptic('success'); notify('CSV экспортирован') }}>
              <Download className="h-4 w-4" />Экспорт CSV
            </Button>
            <Button variant="secondary" onClick={() => { downloadFile('operations.json', JSON.stringify(rows, null, 2), 'application/json'); void tapHaptic('success'); notify('JSON экспортирован') }}>
              <FileJson className="h-4 w-4" />Экспорт JSON
            </Button>
            <Button variant="secondary" onClick={() => { const next = prepareGoogleSheetsExport(rows); setPayload(next); void tapHaptic('selection'); notify('Данные для Google Sheets подготовлены') }}>
              <Sheet className="h-4 w-4" />Подготовить Google Sheets
            </Button>
          </div>
          <p className="mt-3 text-[13px] leading-5 text-zinc-500">Файл выгружается локально, без сервера и без потери данных.</p>
        </Card>
        <Card>
          <p className="text-[13px] font-medium text-zinc-500">Строк готово</p>
          <p className="mt-2 text-3xl font-semibold">{rows.length}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>Дата</Badge>
            <Badge>Тип</Badge>
            <Badge>Счет</Badge>
            <Badge>Категория</Badge>
            <Badge>Сумма</Badge>
          </div>
        </Card>
      </div>
      {payload && (
        <Card className="mb-4">
          <CardTitle>Пакет Google Sheets</CardTitle>
          <CardDescription>{payload.spreadsheetTitle} · {payload.range} · {new Date(payload.preparedAt).toLocaleString()}</CardDescription>
          <pre className="mt-4 max-h-48 overflow-auto rounded-2xl bg-zinc-950 p-4 text-[12px] text-zinc-100">{JSON.stringify(payload, null, 2)}</pre>
        </Card>
      )}
      <Card>
        <CardTitle>Предпросмотр</CardTitle>
        <CardDescription>Проверьте строки перед экспортом.</CardDescription>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Нет данных для экспорта" description="Добавьте хотя бы одну операцию, чтобы собрать CSV, JSON или пакет для Google Sheets." icon={Sheet} />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-400">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-3 font-medium">Дата</th><th className="font-medium">Тип</th><th className="font-medium">Счет</th><th className="font-medium">Категория</th><th className="font-medium">Описание</th><th className="font-medium">Оплата</th><th className="font-medium">Сумма</th><th className="font-medium">Валюта</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.date}-${index}`} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="py-3">{row.date}</td><td>{row.type}</td><td>{row.account}</td><td>{row.category}</td><td>{row.description}</td><td>{row.paymentMethod}</td><td>{row.amount}</td><td>{row.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </>
  )
}

function typeLabel(type: Transaction['type']) {
  if (type === 'income') return 'Доход'
  if (type === 'expense') return 'Расход'
  return 'Перевод'
}
