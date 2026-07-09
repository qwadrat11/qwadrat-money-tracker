import { Save } from 'lucide-react'
import { useState } from 'react'
import type { Account, AppSettings, Category, Transaction, TransactionType } from '../types'
import { Button } from './ui/Button'
import { Field, Input, Select, Textarea } from './ui/Field'
import { getDefaultCategoryId, getTransferCategoryId } from '../utils/category'

type Draft = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>

export function TransactionForm({
  accounts,
  categories,
  settings,
  initial,
  onSubmit,
  submitLabel = 'Сохранить',
}: {
  accounts: Account[]
  categories: Category[]
  settings: AppSettings
  initial?: Draft | Transaction
  onSubmit: (transaction: Draft | Transaction) => void | Promise<void>
  submitLabel?: string
}) {
  const activeAccounts = accounts.filter((account) => !account.archived)
  const firstAccount = activeAccounts[0]?.id ?? accounts[0]?.id ?? ''
  const [draft, setDraft] = useState<Draft | Transaction>(
    initial ?? {
      type: 'expense',
      date: new Date().toISOString().slice(0, 10),
      amount: 0,
      categoryId: getDefaultCategoryId(categories, 'expense'),
      accountId: firstAccount,
      toAccountId: activeAccounts.find((account) => account.id !== firstAccount)?.id,
      description: '',
      paymentMethod: settings.defaultPaymentMethod,
      currency: settings.currency,
      userId: 'u-1',
    },
  )

  const availableCategories =
    draft.type === 'transfer'
      ? categories.filter((category) => category.type === 'expense')
      : categories.filter((category) => category.type === draft.type || category.type === 'both')

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!draft.description.trim() || draft.amount <= 0 || !draft.accountId) return
        if (draft.type === 'transfer' && (!draft.toAccountId || draft.toAccountId === draft.accountId)) return
        void onSubmit(draft)
      }}
    >
      <Field label="Тип операции">
        <Select
          value={draft.type}
          onChange={(event) => {
            const type = event.target.value as TransactionType
            setDraft((prev) => ({
              ...prev,
              type,
              categoryId:
                type === 'transfer'
                  ? getTransferCategoryId(categories)
                  : getDefaultCategoryId(categories, type),
            }))
          }}
        >
          <option value="expense">Расход</option>
          <option value="income">Доход</option>
          <option value="transfer">Перевод</option>
        </Select>
      </Field>
      <Field label="Дата">
        <Input value={draft.date} type="date" onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
      </Field>
      <Field label={draft.type === 'transfer' ? 'Со счета' : 'Счет операции'}>
        <Select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}>
          {activeAccounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </Select>
      </Field>
      {draft.type === 'transfer' && (
        <Field label="На счет">
          <Select value={draft.toAccountId ?? ''} onChange={(event) => setDraft({ ...draft, toAccountId: event.target.value })}>
            <option value="">Выберите счет</option>
            {activeAccounts.filter((account) => account.id !== draft.accountId).map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Сумма">
        <Input
          min="0"
          step="0.01"
          type="number"
          value={draft.amount || ''}
          onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })}
        />
      </Field>
      {draft.type !== 'transfer' && (
        <Field label="Категория операции">
          <Select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
            {availableCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Способ оплаты">
        <Input
          value={draft.paymentMethod}
          onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}
          placeholder="Apple Pay, карта, наличные"
        />
      </Field>
      <Field label="Валюта операции">
        <Select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value as Draft['currency'] })}>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="UAH">UAH</option>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Описание">
          <Textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="Например: продукты, зарплата, перевод в накопления"
          />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit">
          <Save className="h-4 w-4" />
          {submitLabel}
        </Button>
        <p className="text-xs text-zinc-500">Все поля сохраняются локально и сразу обновляют балансы.</p>
      </div>
    </form>
  )
}
