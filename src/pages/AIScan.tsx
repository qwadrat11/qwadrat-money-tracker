import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { BrainCircuit, CameraIcon, ReceiptText, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardDescription, CardTitle } from '../components/ui/Card'
import { Field, Input, Select } from '../components/ui/Field'
import { useToast } from '../components/ui/toastContext'
import { tapHaptic } from '../services/haptics'
import { parseReceipt } from '../services/receiptScannerService'
import type { AccountBalance, AppSettings, Category, ReceiptScanResult, Transaction } from '../types'

export function AIScan({
  accounts,
  categories,
  settings,
  addTransaction,
  addReceiptScan,
}: {
  accounts: AccountBalance[]
  categories: Category[]
  settings: AppSettings
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<unknown>
  addReceiptScan: (scan: ReceiptScanResult) => Promise<unknown>
}) {
  const { notify } = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [result, setResult] = useState<ReceiptScanResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function analyze(file?: File, imageUrl?: string, imageName?: string) {
    if (!file && !imageUrl) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(imageUrl ?? (file ? URL.createObjectURL(file) : null))
    setLoading(true)
    setError('')
    try {
      const scan = await parseReceipt({ file, imageName, categories, accounts, settings })
      setResult(scan)
      await addReceiptScan(scan)
      void tapHaptic('success')
      notify(scan.message ?? 'Чек распознан')
    } catch {
      setError('Не удалось обработать изображение. Попробуйте другой чек.')
      void tapHaptic('error')
      notify('Ошибка распознавания чека')
    } finally {
      setLoading(false)
    }
  }

  async function takePhoto() {
    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
      })
      await analyze(undefined, photo.webPath, 'iphone-photo.jpg')
    } catch {
      setError('Фото не выбрано или доступ к камере не разрешен.')
      void tapHaptic('warning')
    }
  }

  return (
    <>
      <PageHeader title="AI-скан" description="Загрузите чек, скриншот или сделайте фото на iPhone. Если API ключа нет, включается mock-анализ." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <Card>
          <div
            className="relative flex min-h-[420px] w-full flex-col items-center justify-center overflow-hidden rounded-[1.25rem] border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center transition dark:border-zinc-800 dark:bg-zinc-900/30"
            onDrop={(event) => { event.preventDefault(); void analyze(event.dataTransfer.files[0]) }}
            onDragOver={(event) => event.preventDefault()}
          >
            {previewUrl ? (
              <>
                <img src={previewUrl} alt="Предпросмотр чека" className="absolute inset-0 h-full w-full object-contain p-6" />
                <Button className="absolute right-4 top-4" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>Заменить</Button>
              </>
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-zinc-500" />
                <p className="mt-4 text-lg font-semibold">Загрузите чек или скриншот</p>
                <p className="mt-2 max-w-md text-sm text-zinc-500">PNG, JPG или HEIC. На iPhone можно открыть камеру.</p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Button type="button" onClick={() => inputRef.current?.click()}><UploadCloud className="h-4 w-4" />Выбрать файл</Button>
                  <Button type="button" variant="secondary" onClick={() => void takePhoto()}><CameraIcon className="h-4 w-4" />Сделать фото</Button>
                </div>
                {!Capacitor.isNativePlatform() && <p className="mt-3 text-xs text-zinc-500">В браузере кнопка фото откроет системный выбор изображения.</p>}
              </>
            )}
            <input ref={inputRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={(event) => void analyze(event.target.files?.[0])} />
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Результат</CardTitle>
              <CardDescription>Проверьте поля перед сохранением расхода.</CardDescription>
            </div>
            {result && <Button variant="ghost" size="icon" aria-label="Очистить скан" onClick={() => { setResult(null); setPreviewUrl(null) }}><X className="h-4 w-4" /></Button>}
          </div>
          {error && <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">{error}</div>}
          {loading ? (
            <div className="mt-6 space-y-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />)}</div>
          ) : !result ? (
            <div className="mt-6"><EmptyState icon={BrainCircuit} title="Чек не загружен" description="После загрузки появятся редактируемые поля." /></div>
          ) : (
            <ScanEditor result={result} accounts={accounts} categories={categories} onChange={setResult} onSave={async () => {
              await addTransaction({
                type: 'expense',
                date: result.date,
                amount: result.total,
                categoryId: result.suggestedCategoryId,
                accountId: result.suggestedAccountId,
                description: result.store,
                paymentMethod: 'AI-скан',
                currency: result.currency,
                userId: 'u-1',
              })
              void tapHaptic('success')
              notify('Чек сохранен как расход')
            }} />
          )}
        </Card>
      </div>
    </>
  )
}

function ScanEditor({ result, accounts, categories, onChange, onSave }: {
  result: ReceiptScanResult
  accounts: AccountBalance[]
  categories: Category[]
  onChange: (result: ReceiptScanResult) => void
  onSave: () => Promise<void>
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">{result.source === 'mock' ? 'Mock-анализ' : 'OpenAI Vision'}</Badge>
        <Badge className="bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">Уверенность {Math.round(result.confidence * 100)}%</Badge>
      </div>
      {result.message && <div className="rounded-2xl bg-zinc-50 p-3 text-[13px] leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{result.message}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Магазин"><Input value={result.store} onChange={(event) => onChange({ ...result, store: event.target.value })} /></Field>
        <Field label="Сумма"><Input type="number" value={result.total} onChange={(event) => onChange({ ...result, total: Number(event.target.value) })} /></Field>
        <Field label="Дата"><Input type="date" value={result.date} onChange={(event) => onChange({ ...result, date: event.target.value })} /></Field>
        <Field label="Валюта"><Select value={result.currency} onChange={(event) => onChange({ ...result, currency: event.target.value as ReceiptScanResult['currency'] })}><option value="USD">USD</option><option value="EUR">EUR</option><option value="UAH">UAH</option></Select></Field>
        <Field label="Категория"><Select value={result.suggestedCategoryId} onChange={(event) => onChange({ ...result, suggestedCategoryId: event.target.value })}>{categories.filter((category) => category.type !== 'income').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
        <Field label="Счет"><Select value={result.suggestedAccountId} onChange={(event) => onChange({ ...result, suggestedAccountId: event.target.value })}>{accounts.filter((account) => !account.archived).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Позиции</p>
        <div className="space-y-2">
          {result.items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="grid grid-cols-[1fr_72px_96px] gap-2 rounded-xl bg-zinc-50 p-2 dark:bg-zinc-900">
              <Input value={item.name} onChange={(event) => { const items = [...result.items]; items[index] = { ...item, name: event.target.value }; onChange({ ...result, items }) }} />
              <Input type="number" value={item.quantity} onChange={(event) => { const items = [...result.items]; items[index] = { ...item, quantity: Number(event.target.value) }; onChange({ ...result, items }) }} />
              <Input type="number" value={item.price} onChange={(event) => { const items = [...result.items]; items[index] = { ...item, price: Number(event.target.value) }; onChange({ ...result, items }) }} />
            </div>
          ))}
        </div>
      </div>
      <Button className="w-full" onClick={() => void onSave()}><ReceiptText className="h-4 w-4" />Сохранить как расход</Button>
      <p className="text-xs text-zinc-500">Уверенность: {Math.round(result.confidence * 100)}%</p>
    </div>
  )
}
