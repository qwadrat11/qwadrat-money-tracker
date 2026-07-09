import { Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/ui/Button'
import { Card, CardDescription, CardTitle } from '../components/ui/Card'
import { Field, Input, Select } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/toastContext'
import type { AppSettings } from '../types'
import { tapHaptic } from '../services/haptics'

export function SettingsPage({
  settings,
  updateSettings,
}: {
  settings: AppSettings
  updateSettings: (settings: AppSettings) => Promise<unknown>
}) {
  const { notify } = useToast()
  const [draft, setDraft] = useState(settings)
  const [topic, setTopic] = useState<'storage' | 'state' | 'roles' | null>(null)

  useEffect(() => setDraft(settings), [settings])

  return (
    <>
      <PageHeader title="Настройки" description="Параметры рабочего пространства и финансовые значения по умолчанию." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,600px)_1fr]">
        <Card>
          <CardTitle>Рабочее пространство</CardTitle>
          <CardDescription>Настройки сохраняются в локальном хранилище через сервис данных.</CardDescription>
          <form
            className="mt-5 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault()
              await updateSettings(draft)
              void tapHaptic('success')
              notify('Настройки сохранены')
            }}
          >
            <Field label="Название пространства">
              <Input value={draft.workspaceName} onChange={(event) => setDraft({ ...draft, workspaceName: event.target.value })} />
            </Field>
            <Field label="Месячный бюджет">
              <Input type="number" min="0" value={draft.monthlyBudget} onChange={(event) => setDraft({ ...draft, monthlyBudget: Number(event.target.value) })} />
            </Field>
            <Field label="Способ оплаты по умолчанию">
              <Input value={draft.defaultPaymentMethod} onChange={(event) => setDraft({ ...draft, defaultPaymentMethod: event.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Валюта">
                <Select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value as AppSettings['currency'] })}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="UAH">UAH</option>
                </Select>
              </Field>
              <Field label="Тема">
                <Select value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value as AppSettings['theme'] })}>
                  <option value="light">Светлая</option>
                  <option value="dark">Темная</option>
                </Select>
              </Field>
            </div>
            <Button type="submit"><Save className="h-4 w-4" />Сохранить настройки</Button>
          </form>
        </Card>
        <Card>
          <CardTitle>Архитектура</CardTitle>
          <CardDescription>Интерфейс не обращается к LocalStorage напрямую. React Query работает с сервисом данных, который позже можно заменить на Supabase.</CardDescription>
          <div className="mt-5 grid gap-2">
            <button className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-left text-sm text-zinc-700 transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-950" onClick={() => setTopic('storage')}>
              Локальная база: <span className="font-medium text-zinc-950 dark:text-zinc-50">financeRepository</span>
            </button>
            <button className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-left text-sm text-zinc-700 transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-950" onClick={() => setTopic('state')}>
              Состояние: <span className="font-medium text-zinc-950 dark:text-zinc-50">React Query + persisted state</span>
            </button>
            <button className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-left text-sm text-zinc-700 transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-950" onClick={() => setTopic('roles')}>
              Роли: <span className="font-medium text-zinc-950 dark:text-zinc-50">user и admin</span>
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                await updateSettings({ ...settings, theme: settings.theme === 'dark' ? 'light' : 'dark' })
                void tapHaptic('selection')
                notify(settings.theme === 'dark' ? 'Включена светлая тема' : 'Включена темная тема')
              }}
            >
              Переключить тему
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await updateSettings({ ...settings, hasSeenOnboarding: false })
                void tapHaptic('selection')
                notify('Onboarding снова будет показан при следующем запуске')
              }}
            >
              Показать onboarding снова
            </Button>
          </div>
        </Card>
      </div>
      <Modal
        open={topic !== null}
        title={topic === 'storage' ? 'LocalStorage' : topic === 'state' ? 'Состояние приложения' : 'Роли'}
        description="Короткая справка о текущей архитектуре."
        onClose={() => setTopic(null)}
      >
        <div className="space-y-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {topic === 'storage' && <p>Все данные пишутся через единый сервис данных. Компоненты не обращаются к LocalStorage напрямую.</p>}
          {topic === 'state' && <p>React Query хранит кэш, а мутации обновляют локальную базу. Позже этот слой можно заменить на удаленный API.</p>}
          {topic === 'roles' && <p>Структура пользователей уже готова к ролям user и admin. Админский раздел управляет локальными сущностями и демо-данными.</p>}
        </div>
      </Modal>
    </>
  )
}
