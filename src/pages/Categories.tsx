import { ArrowDown, ArrowUp, Copy, Edit3, Plus, Tags, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CategoryIcon } from '../components/CategoryIcon'
import { categoryIconLabels, categoryIconNames } from '../constants/categoryIcons'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Field, Input, Select } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/toastContext'
import { tapHaptic } from '../services/haptics'
import type { Category } from '../types'

type CategoryDraft = Omit<Category, 'id' | 'isDefault'>

const emptyDraft: CategoryDraft = { name: '', icon: 'CircleEllipsis', color: '#525252', type: 'expense' }

export function Categories({
  categories,
  addCategory,
  duplicateCategory,
  updateCategory,
  reorderCategory,
  deleteCategory,
}: {
  categories: Category[]
  addCategory: (category: Omit<Category, 'id' | 'isDefault'>) => Promise<unknown>
  duplicateCategory: (id: string) => Promise<unknown>
  updateCategory: (category: Category) => Promise<unknown>
  reorderCategory: (id: string, direction: 'up' | 'down') => Promise<unknown>
  deleteCategory: (id: string) => Promise<unknown>
}) {
  const { notify } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [draft, setDraft] = useState<CategoryDraft>(emptyDraft)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  function startCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setModalOpen(true)
  }

  function startEdit(category: Category) {
    setEditing(category)
    setDraft({ name: category.name, icon: category.icon, color: category.color, type: category.type })
    setModalOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Категории"
        description="Настройте категории для аналитики, фильтров и экспорта."
        action={<Button onClick={startCreate}><Plus className="h-4 w-4" />Новая категория</Button>}
      />
      <Card>
        {categories.length === 0 ? (
          <EmptyState icon={Tags} title="Категорий нет" description="Создайте категории для аналитики и фильтров." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <div
                key={category.id}
                role="button"
                tabIndex={0}
                onClick={() => startEdit(category)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    startEdit(category)
                  }
                }}
                className="animate-enter group flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50/40 p-4 transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" style={{ color: category.color }}>
                    <CategoryIcon category={category} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{category.name}</p>
                    <p className="text-xs text-zinc-500">{category.isDefault ? 'Базовая' : 'Своя'} · {category.type === 'income' ? 'доход' : category.type === 'expense' ? 'расход' : 'оба типа'}</p>
                  </div>
                </div>
                <div className="flex opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                  <Button variant="ghost" size="icon" aria-label="Переместить выше" disabled={category.id === categories[0]?.id} onClick={(event) => { event.stopPropagation(); void reorderCategory(category.id, 'up').then(() => { void tapHaptic('selection'); notify('Категория перемещена выше') }) }}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Переместить ниже" disabled={category.id === categories[categories.length - 1]?.id} onClick={(event) => { event.stopPropagation(); void reorderCategory(category.id, 'down').then(() => { void tapHaptic('selection'); notify('Категория перемещена ниже') }) }}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Дублировать категорию" onClick={(event) => { event.stopPropagation(); void duplicateCategory(category.id).then(() => { void tapHaptic('success'); notify('Категория скопирована') }) }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Редактировать категорию" onClick={() => startEdit(category)}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Удалить категорию" disabled={category.isDefault} onClick={() => setConfirmId(category.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal
        open={modalOpen}
        title={editing ? 'Редактировать категорию' : 'Новая категория'}
        description="Иконка и цвет используются в операциях, графиках и экспорте."
        onClose={() => setModalOpen(false)}
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!draft.name.trim()) return
            if (editing) {
              await updateCategory({ ...editing, ...draft, name: draft.name.trim() })
              void tapHaptic('success')
              notify('Категория обновлена')
            } else {
              await addCategory({ ...draft, name: draft.name.trim() })
              void tapHaptic('success')
              notify('Категория создана')
            }
            setModalOpen(false)
          }}
        >
          <Field label="Название">
            <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Путешествия" />
          </Field>
          <Field label="Тип">
            <Select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Category['type'] })}>
              <option value="expense">Расход</option>
              <option value="income">Доход</option>
              <option value="both">Оба типа</option>
            </Select>
          </Field>
          <Field label="Иконка">
            <Select value={draft.icon} onChange={(event) => setDraft({ ...draft, icon: event.target.value })}>
              {categoryIconNames.map((icon) => <option key={icon} value={icon}>{categoryIconLabels[icon]}</option>)}
            </Select>
          </Field>
          <Field label="Цвет">
            <Input value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} type="color" className="p-1" />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-between rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-100 dark:bg-zinc-900" style={{ color: draft.color }}>
                <CategoryIcon category={draft} />
              </span>
              <div>
                <p className="text-sm font-medium">{draft.name || 'Предпросмотр'}</p>
                <p className="text-xs text-zinc-500">{draft.type === 'income' ? 'Доход' : draft.type === 'expense' ? 'Расход' : 'Оба типа'}</p>
              </div>
            </div>
            <Badge>{editing ? 'Редактирование' : 'Новая'}</Badge>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">{editing ? 'Сохранить' : 'Создать категорию'}</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(confirmId)}
        title="Удалить категорию?"
        description="Операции этой категории будут перенесены в резервную категорию."
        confirmLabel="Удалить"
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (!confirmId) return
          void deleteCategory(confirmId).then(() => {
            void tapHaptic('warning')
            notify('Категория удалена')
          })
        }}
      />
    </>
  )
}
