import { DatabaseZap, Edit3, Plus, RefreshCcw, Trash2, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardDescription, CardTitle } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Field, Input, Select } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/toastContext'
import { tapHaptic } from '../services/haptics'
import type { Account, AppSettings, Category, ReceiptScanResult, Transaction, User } from '../types'

type UserDraft = Omit<User, 'id'>

const emptyUser: UserDraft = { name: '', email: '', role: 'user', status: 'invited' }

export function Admin({
  users,
  categories,
  accounts,
  receiptScans,
  transactions,
  settings,
  resetDemoData,
  clearTransactions,
  generateDemoData,
  addUser,
  updateUser,
  deleteUser,
  updateSettings,
}: {
  users: User[]
  categories: Category[]
  accounts: Account[]
  receiptScans: ReceiptScanResult[]
  transactions: Transaction[]
  settings: AppSettings
  resetDemoData: () => Promise<unknown>
  clearTransactions: () => Promise<unknown>
  generateDemoData: () => Promise<unknown>
  addUser: (user: Omit<User, 'id'>) => Promise<unknown>
  updateUser: (user: User) => Promise<unknown>
  deleteUser: (id: string) => Promise<unknown>
  updateSettings: (settings: AppSettings) => Promise<unknown>
}) {
  const { notify } = useToast()
  const [confirm, setConfirm] = useState<'reset' | 'clear' | 'generate' | null>(null)
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [userDraft, setUserDraft] = useState<UserDraft>(emptyUser)
  const [settingsDraft, setSettingsDraft] = useState(settings)

  const roleLabel = (role: User['role']) => (role === 'admin' ? 'Админ' : 'Пользователь')

  function startUser(user?: User) {
    setEditingUser(user ?? null)
    setUserDraft(user ? { name: user.name, email: user.email, role: user.role, status: user.status } : emptyUser)
    setUserModalOpen(true)
  }

  return (
    <>
      <PageHeader title="Админ" description="Управление данными, пользователями и настройками приложения." />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Пользователи</CardTitle>
              <CardDescription>Заглушки для будущей авторизации и ролей.</CardDescription>
            </div>
            <Button variant="secondary" size="sm" onClick={() => startUser()}><Plus className="h-4 w-4" />Новый пользователь</Button>
          </div>
          <div className="mt-4 space-y-3">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex min-w-0 items-center gap-3">
                  <UsersRound className="h-4 w-4 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-zinc-500">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge>{roleLabel(user.role)}</Badge>
                  <Button variant="ghost" size="icon" aria-label="Редактировать пользователя" onClick={() => startUser(user)}><Edit3 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Удалить пользователя" onClick={() => setDeleteUserId(user.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>Данные</CardTitle>
          <CardDescription>Все действия проходят через LocalStorage-сервис.</CardDescription>
          <div className="mt-5 space-y-3">
            <Button className="w-full justify-start" variant="secondary" onClick={() => setConfirm('generate')}><DatabaseZap className="h-4 w-4" />Сгенерировать демо-данные</Button>
            <Button className="w-full justify-start" variant="secondary" onClick={() => setConfirm('reset')}><RefreshCcw className="h-4 w-4" />Сбросить демо-данные</Button>
            <Button className="w-full justify-start" variant="secondary" onClick={() => setConfirm('clear')}><Trash2 className="h-4 w-4" />Очистить операции</Button>
          </div>
          <div className="mt-5 grid gap-2 text-sm text-zinc-500">
            <span>Счетов: {accounts.length}</span>
            <span>Сканов чеков: {receiptScans.length}</span>
            <span>Категорий: {categories.length}</span>
          </div>
        </Card>
        <Card>
          <CardTitle>Настройки</CardTitle>
          <CardDescription>Базовые значения приложения.</CardDescription>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault()
              await updateSettings(settingsDraft)
              void tapHaptic('success')
              notify('Настройки сохранены')
            }}
          >
            <Field label="Рабочее пространство">
              <Input value={settingsDraft.workspaceName} onChange={(event) => setSettingsDraft({ ...settingsDraft, workspaceName: event.target.value })} />
            </Field>
            <Field label="Способ оплаты по умолчанию">
              <Input value={settingsDraft.defaultPaymentMethod} onChange={(event) => setSettingsDraft({ ...settingsDraft, defaultPaymentMethod: event.target.value })} />
            </Field>
            <Button type="submit" className="w-full">Сохранить настройки</Button>
          </form>
        </Card>
      </div>
      <Card className="mt-4">
        <CardTitle>Все операции</CardTitle>
        <CardDescription>{transactions.length} записей, {categories.length} категорий, {accounts.length} счетов.</CardDescription>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <tbody>
              {transactions.map((item) => (
                <tr key={item.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="py-3">{item.date}</td>
                  <td>{item.type === 'income' ? 'Доход' : item.type === 'expense' ? 'Расход' : 'Перевод'}</td>
                  <td>{categories.find((category) => category.id === item.categoryId)?.name ?? 'Другое'}</td>
                  <td>{item.description}</td>
                  <td className="text-right font-medium">{item.amount} {item.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal open={userModalOpen} title={editingUser ? 'Редактировать пользователя' : 'Новый пользователь'} onClose={() => { setUserModalOpen(false); setEditingUser(null); setUserDraft(emptyUser) }}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!userDraft.name.trim() || !userDraft.email.trim()) return
            if (editingUser) {
              await updateUser({ ...editingUser, ...userDraft })
              void tapHaptic('success')
              notify('Пользователь обновлен')
            } else {
              await addUser(userDraft)
              void tapHaptic('success')
              notify('Пользователь создан')
            }
            setEditingUser(null)
            setUserDraft(emptyUser)
            setUserModalOpen(false)
          }}
        >
          <Field label="Имя"><Input value={userDraft.name} onChange={(event) => setUserDraft({ ...userDraft, name: event.target.value })} /></Field>
          <Field label="Электронная почта"><Input type="email" value={userDraft.email} onChange={(event) => setUserDraft({ ...userDraft, email: event.target.value })} /></Field>
          <Field label="Роль"><Select value={userDraft.role} onChange={(event) => setUserDraft({ ...userDraft, role: event.target.value as User['role'] })}><option value="user">Пользователь</option><option value="admin">Админ</option></Select></Field>
          <Field label="Статус"><Select value={userDraft.status} onChange={(event) => setUserDraft({ ...userDraft, status: event.target.value as User['status'] })}><option value="active">Активен</option><option value="invited">Приглашен</option></Select></Field>
          <div className="sm:col-span-2"><Button type="submit">{editingUser ? 'Сохранить' : 'Создать пользователя'}</Button></div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm === 'clear' ? 'Очистить операции?' : confirm === 'generate' ? 'Сгенерировать демо-данные?' : 'Сбросить демо-данные?'}
        description="Действие обновит локальное хранилище и все страницы приложения."
        confirmLabel="Продолжить"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === 'clear') void clearTransactions().then(() => { void tapHaptic('warning'); notify('Операции очищены') })
          if (confirm === 'reset') void resetDemoData().then(() => { void tapHaptic('selection'); notify('Демо-данные сброшены') })
          if (confirm === 'generate') void generateDemoData().then(() => { void tapHaptic('success'); notify('Демо-данные созданы') })
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteUserId)}
        title="Удалить пользователя?"
        description="Пользователь будет удален из локального набора данных."
        confirmLabel="Удалить"
        onClose={() => setDeleteUserId(null)}
        onConfirm={() => {
          if (!deleteUserId) return
          void deleteUser(deleteUserId).then(() => { void tapHaptic('warning'); notify('Пользователь удален') })
        }}
      />
    </>
  )
}
