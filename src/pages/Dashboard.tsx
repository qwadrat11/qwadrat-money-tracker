import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  defaultAnimateLayoutChanges,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, Check, GripVertical, RotateCcw, SlidersHorizontal, WalletCards, type LucideIcon } from 'lucide-react'
import { AccountIcon } from '../components/AccountIcon'
import { CategoryIcon } from '../components/CategoryIcon'
import type { PageKey } from '../components/AppShell'
import { Button } from '../components/ui/Button'
import { Card, CardDescription, CardTitle } from '../components/ui/Card'
import { Field, Input } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { TransactionForm } from '../components/TransactionForm'
import { accountTypeLabels } from '../constants/accounts'
import type { AccountBalance, AppSettings, Category, Transaction } from '../types'
import { formatDate, formatMoney, monthLabel } from '../utils/format'
import { cn } from '../utils/cn'
import { tapHaptic } from '../services/haptics'
import { useToast } from '../components/ui/toastContext'

type MetricKey = 'balance' | 'income' | 'expenses' | 'budget'
type DashboardWidgetId =
  | 'balance'
  | 'expenses'
  | 'income'
  | 'budget'
  | 'quick-actions'
  | 'daily-spending'
  | 'categories'
  | 'budget-progress'
  | 'balance-history'
  | 'recent-activity'

const currentMonthKey = new Date().toISOString().slice(0, 7)
const overviewBlocksOrderKey = 'ledger_overview_blocks_order'
const defaultOverviewBlockOrder: DashboardWidgetId[] = ['balance', 'expenses', 'income', 'budget', 'quick-actions']
export function Dashboard({
  transactions,
  categories,
  accounts,
  settings,
  updateSettings,
  addTransaction,
  onNavigate,
}: {
  transactions: Transaction[]
  categories: Category[]
  accounts: AccountBalance[]
  settings: AppSettings
  updateSettings: (settings: AppSettings) => Promise<unknown>
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<unknown>
  onNavigate: (page: PageKey) => void
}) {
  const { notify } = useToast()
  const [metric, setMetric] = useState<MetricKey | null>(null)
  const [budgetDraft, setBudgetDraft] = useState(settings.monthlyBudget)
  const [quickActionOpen, setQuickActionOpen] = useState(false)
  const [quickActionMode, setQuickActionMode] = useState<'expense' | 'income'>('expense')
  const [quickActionSeed, setQuickActionSeed] = useState(0)
  const [editingBlocks, setEditingBlocks] = useState(false)
  const monthTransactions = useMemo(() => transactions.filter((item) => item.date.startsWith(currentMonthKey)), [transactions])
  const incomeTransactions = useMemo(() => monthTransactions.filter((item) => item.type === 'income'), [monthTransactions])
  const expenseTransactions = useMemo(() => monthTransactions.filter((item) => item.type === 'expense'), [monthTransactions])
  const activeAccounts = useMemo(() => accounts.filter((account) => !account.archived), [accounts])
  const balanceAccounts = useMemo(() => activeAccounts.filter((account) => account.includeInTotalBalance !== false), [activeAccounts])
  const defaultAccount = activeAccounts[0]
  const income = sum(monthTransactions.filter((item) => item.type === 'income'))
  const expenses = sum(monthTransactions.filter((item) => item.type === 'expense'))
  const totalBalance = balanceAccounts.reduce((acc, account) => acc + account.balance, 0)
  const budgetProgress = Math.min(100, Math.round((expenses / Math.max(settings.monthlyBudget, 1)) * 100))
  const daysInMonth = new Date(Number(currentMonthKey.slice(0, 4)), Number(currentMonthKey.slice(5, 7)), 0).getDate()
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])
  const balanceHistory = useMemo(() => buildBalanceHistory(transactions, balanceAccounts), [transactions, balanceAccounts])
  const daily = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, index) => {
        const day = `${currentMonthKey}-${String(index + 1).padStart(2, '0')}`
        return { day: String(index + 1), Расходы: sum(monthTransactions.filter((item) => item.type === 'expense' && item.date === day)) }
      }),
    [daysInMonth, monthTransactions],
  )
  const byCategory = useMemo(
    () =>
      categories
        .map((category) => ({ name: category.name, color: category.color, value: sum(monthTransactions.filter((item) => item.type === 'expense' && item.categoryId === category.id)) }))
        .filter((item) => item.value > 0),
    [categories, monthTransactions],
  )
  const recent = useMemo(() => [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), [transactions])
  const openMetric = useCallback(
    (next: MetricKey) => {
      void tapHaptic('selection')
      setBudgetDraft(settings.monthlyBudget)
      setMetric(next)
    },
    [settings.monthlyBudget],
  )
  const openQuickAction = useCallback(
    (mode: 'expense' | 'income') => {
      if (!defaultAccount) {
        void tapHaptic('warning')
        notify('Сначала добавьте хотя бы один счет')
        return
      }
      setQuickActionMode(mode)
      setQuickActionSeed((value) => value + 1)
      setQuickActionOpen(true)
      void tapHaptic('selection')
    },
    [defaultAccount, notify],
  )
  const overviewBlocks = useMemo(
    () =>
      buildOverviewBlocks({
        totalBalance,
        income,
        expenses,
        budgetProgress,
        balanceHistory,
        daily,
        byCategory,
        recent,
        accountMap,
        categoryMap,
        settings,
        onNavigate,
        openMetric,
        openQuickAction,
      }),
    [totalBalance, income, expenses, budgetProgress, balanceHistory, daily, byCategory, recent, accountMap, categoryMap, settings.currency, settings.monthlyBudget],
  )
  const overviewBlockIds = useMemo(() => overviewBlocks.map((block) => block.id), [overviewBlocks])
  const [overviewOrder, setOverviewOrder] = useState<DashboardWidgetId[]>(() => loadOverviewOrder(overviewBlockIds))
  const [activeBlockId, setActiveBlockId] = useState<DashboardWidgetId | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    setOverviewOrder((current) => normalizeOverviewOrder(current, overviewBlockIds))
  }, [overviewBlockIds])

  useEffect(() => {
    localStorage.setItem(overviewBlocksOrderKey, JSON.stringify(overviewOrder))
  }, [overviewOrder])

  const visibleBlocks = useMemo(() => {
    const map = new Map(overviewBlocks.map((block) => [block.id, block]))
    return overviewOrder.map((id) => map.get(id)).filter(Boolean) as typeof overviewBlocks
  }, [overviewBlocks, overviewOrder])

  const resetOrder = useCallback(() => {
    const next = buildDefaultOverviewOrder(overviewBlockIds)
    setOverviewOrder(next)
    localStorage.setItem(overviewBlocksOrderKey, JSON.stringify(next))
  }, [overviewBlockIds])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveBlockId(event.active.id as DashboardWidgetId)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveBlockId(null)
    if (!over || active.id === over.id) return
    setOverviewOrder((current) => {
      const oldIndex = current.indexOf(active.id as DashboardWidgetId)
      const newIndex = current.indexOf(over.id as DashboardWidgetId)
      if (oldIndex < 0 || newIndex < 0) return current
      return arrayMove(current, oldIndex, newIndex)
    })
  }, [])
  const handleDragCancel = useCallback(() => {
    setActiveBlockId(null)
  }, [])

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3 sm:mb-6">
        <div className="min-w-0">
          <h1 className="ds-display text-zinc-950 dark:text-zinc-50">Обзор</h1>
          <p className="ds-caption mt-3 text-zinc-500 dark:text-zinc-400">{`Спокойная сводка за ${monthLabel(currentMonthKey)}.`}</p>
        </div>
        <Button
          variant="secondary"
          aria-label="Настроить блоки"
          className="motion-soft h-11 shrink-0 rounded-full px-3 shadow-[0_10px_24px_rgba(24,24,27,0.06)] sm:h-12 sm:px-4"
          onClick={() => {
            void tapHaptic('selection')
            setEditingBlocks((value) => !value)
          }}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Настроить</span>
        </Button>
      </div>
      {editingBlocks && (
        <div className="motion-soft mb-4 flex items-center justify-between gap-3 rounded-[1.35rem] border border-zinc-200/70 bg-white/80 px-4 py-3 shadow-[0_12px_32px_rgba(24,24,27,0.05)] backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/70">
          <div>
            <p className="text-[14px] font-medium text-zinc-950 dark:text-zinc-50">Настройка блоков</p>
            <p className="ds-caption text-zinc-500 dark:text-zinc-400">Порядок сохранится автоматически.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" className="rounded-full" onClick={resetOrder}>
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Сбросить</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full"
              onClick={() => {
                void tapHaptic('selection')
                setEditingBlocks(false)
              }}
            >
              <Check className="h-4 w-4" />
              <span className="hidden sm:inline">Готово</span>
            </Button>
          </div>
        </div>
      )}
      {editingBlocks ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
          <SortableContext items={visibleBlocks.map((block) => block.id)} strategy={rectSortingStrategy}>
            <div className="overviewBlocksGrid grid w-full gap-4 md:grid-cols-2">
              {visibleBlocks.map((block) => (
                <OverviewSortableItem key={block.id} id={block.id} span={block.span} editing={editingBlocks} activeId={activeBlockId}>
                  {block.render()}
                </OverviewSortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="overviewBlocksGrid grid w-full gap-4 md:grid-cols-2">
          {visibleBlocks.map((block) => (
            <div key={block.id} className={cn('w-full min-w-0', block.span === 2 && 'md:col-span-2')}>
              {block.render()}
            </div>
          ))}
        </div>
      )}
      <OverviewBlockDetailSheet
        isOpen={Boolean(metric)}
        blockId={metric}
        onClose={() => setMetric(null)}
        data={{
          currentMonth: currentMonthKey,
          monthLabel: monthLabel(currentMonthKey),
          currency: settings.currency,
          totalBalance,
          totalBalanceDelta: balanceHistory.length > 1 ? balanceHistory[balanceHistory.length - 1].balance - balanceHistory[balanceHistory.length - 2].balance : 0,
          budget: settings.monthlyBudget,
          budgetDraft,
          setBudgetDraft,
          budgetProgress,
          budgetRemaining: settings.monthlyBudget - expenses,
          income,
          expenses,
          balanceHistory,
          accounts,
          incomeTransactions,
          expenseTransactions,
          recentTransactions: recent,
          categories,
          accountMap,
          categoryMap,
          settings,
          updateSettings,
          onNavigate,
          onOpenAccounts: () => onNavigate('accounts'),
          onOpenTransactions: () => onNavigate('transactions'),
          onOpenIncome: () => openQuickAction('income'),
          onOpenExpense: () => openQuickAction('expense'),
          onOpenTransfer: () => onNavigate('accounts'),
          notify,
        }}
      />
      <Modal
        open={quickActionOpen}
        title={quickActionMode === 'expense' ? 'Добавить расход' : 'Добавить доход'}
        description="Операция сразу обновит балансы и графики."
        onClose={() => setQuickActionOpen(false)}
        className="sm:max-w-3xl"
      >
        {defaultAccount && (
          <TransactionForm
            key={`${quickActionMode}-${quickActionSeed}`}
            accounts={accounts}
            categories={categories}
            settings={settings}
            initial={{
              id: 'draft',
              type: quickActionMode,
              date: new Date().toISOString().slice(0, 10),
              amount: 0,
              categoryId:
                quickActionMode === 'income'
                  ? categories.find((item) => item.type !== 'expense')?.id ?? 'other'
                  : categories.find((item) => item.type !== 'income')?.id ?? 'other',
              accountId: defaultAccount.id,
              description: '',
              paymentMethod: settings.defaultPaymentMethod,
              currency: defaultAccount.currency,
              userId: 'u-1',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }}
            submitLabel={quickActionMode === 'expense' ? 'Добавить расход' : 'Добавить доход'}
            onSubmit={async (transaction) => {
              await addTransaction(transaction as Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>)
              void tapHaptic('success')
              notify(quickActionMode === 'expense' ? 'Расход добавлен' : 'Доход добавлен')
              setQuickActionOpen(false)
            }}
          />
        )}
      </Modal>
    </>
  )
}

function buildOverviewBlocks({
  totalBalance,
  income,
  expenses,
  budgetProgress,
  balanceHistory,
  daily,
  byCategory,
  recent,
  accountMap,
  categoryMap,
  settings,
  onNavigate,
  openMetric,
  openQuickAction,
}: {
  totalBalance: number
  income: number
  expenses: number
  budgetProgress: number
  balanceHistory: { label: string; balance: number }[]
  daily: { day: string; Расходы: number }[]
  byCategory: { name: string; color: string; value: number }[]
  recent: Transaction[]
  accountMap: Map<string, AccountBalance>
  categoryMap: Map<string, Category>
  settings: AppSettings
  onNavigate: (page: PageKey) => void
  openMetric: (metric: MetricKey) => void
  openQuickAction: (mode: 'expense' | 'income') => void
}) {
  return [
    {
      id: 'balance' as const,
      span: 1,
      render: () => <Metric onClick={() => openMetric('balance')} title="Общий баланс" value={formatMoney(totalBalance, settings.currency)} icon={WalletCards} />,
    },
    {
      id: 'expenses' as const,
      span: 1,
      render: () => <Metric onClick={() => openMetric('expenses')} title="Расходы месяца" value={formatMoney(expenses, settings.currency)} icon={ArrowDownRight} />,
    },
    {
      id: 'income' as const,
      span: 1,
      render: () => <Metric onClick={() => openMetric('income')} title="Доходы месяца" value={formatMoney(income, settings.currency)} icon={ArrowUpRight} />,
    },
    {
      id: 'budget' as const,
      span: 1,
      render: () => <Metric onClick={() => openMetric('budget')} title="Осталось бюджета" value={formatMoney(settings.monthlyBudget - expenses, settings.currency)} icon={WalletCards} />,
    },
    {
      id: 'quick-actions' as const,
      span: 2,
      render: () => (
        <Card className="animate-pop">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Быстрые действия</CardTitle>
              <CardDescription>Добавляйте расход или доход в один тап.</CardDescription>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button
              variant="secondary"
              className="h-14 justify-start rounded-[1.45rem] px-4 text-[15px] font-medium"
              onClick={() => openQuickAction('expense')}
            >
              <ArrowDownRight className="h-[18px] w-[18px] text-zinc-500" />
              Добавить расход
            </Button>
            <Button
              variant="secondary"
              className="h-14 justify-start rounded-[1.45rem] px-4 text-[15px] font-medium"
              onClick={() => openQuickAction('income')}
            >
              <ArrowUpRight className="h-[18px] w-[18px] text-zinc-500" />
              Добавить доход
            </Button>
          </div>
        </Card>
      ),
    },
    {
      id: 'daily-spending' as const,
      span: 2,
      render: () => (
        <Card className="min-h-[360px] animate-pop">
          <CardTitle>Расходы по дням</CardTitle>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ left: -20, right: 12, top: 12, bottom: 0 }}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 14, border: '1px solid #e4e4e7' }} />
                <Line type="monotone" dataKey="Расходы" stroke="#18181b" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ),
    },
    {
      id: 'categories' as const,
      span: 1,
      render: () => (
        <Card className="animate-pop">
          <CardTitle>Категории</CardTitle>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} isAnimationActive={false}>
                  {byCategory.map((item) => <Cell key={item.name} fill={item.color} />)}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(Number(value), settings.currency)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid gap-2">
            {byCategory.map((item) => (
              <div key={item.name} className="flex justify-between text-[13px]">
                <span className="text-zinc-500">{item.name}</span>
                <span className="font-medium text-zinc-950 dark:text-zinc-50">{formatMoney(item.value, settings.currency)}</span>
              </div>
            ))}
          </div>
        </Card>
      ),
    },
    {
      id: 'budget-progress' as const,
      span: 1,
      render: () => (
        <Card className="animate-pop">
          <CardTitle>Бюджет</CardTitle>
          <CardDescription>Использовано {budgetProgress}% месячного бюджета.</CardDescription>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
            <div className="h-full rounded-full bg-zinc-950 transition-all dark:bg-white" style={{ width: `${budgetProgress}%` }} />
          </div>
          <div className="mt-4 flex justify-between text-sm">
            <span className="text-zinc-500">Потрачено {formatMoney(expenses, settings.currency)}</span>
            <span className="font-medium">{formatMoney(settings.monthlyBudget, settings.currency)}</span>
          </div>
        </Card>
      ),
    },
    {
      id: 'balance-history' as const,
      span: 2,
      render: () => (
        <Card className="animate-pop">
          <CardTitle>История баланса</CardTitle>
          <CardDescription>Движение общего баланса за последние 6 месяцев.</CardDescription>
          <div className="mt-3 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={balanceHistory} margin={{ left: -20, right: 12, top: 12, bottom: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
                <Tooltip contentStyle={{ borderRadius: 14, border: '1px solid #e4e4e7' }} formatter={(value) => formatMoney(Number(value), settings.currency)} />
                <Line type="monotone" dataKey="balance" stroke="#18181b" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] text-zinc-500">
            {balanceHistory.slice(-3).map((item) => (
              <div key={item.label} className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900">
                <div className="text-zinc-500">{item.label}</div>
                <div className="mt-1 text-sm font-medium text-zinc-950 dark:text-zinc-50">{formatMoney(item.balance, settings.currency)}</div>
              </div>
            ))}
          </div>
        </Card>
      ),
    },
    {
      id: 'recent-activity' as const,
      span: 2,
      render: () => (
        <Card className="animate-pop">
          <div className="flex items-center justify-between">
            <CardTitle>Последняя активность</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('transactions')}>
              Все операции
            </Button>
          </div>
          <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-900">
            {recent.map((item) => {
              const category = categoryMap.get(item.categoryId)
              const account = accountMap.get(item.accountId)
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 py-3 animate-enter">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[1rem] bg-zinc-100 dark:bg-zinc-900">
                      {item.type === 'transfer' ? <AccountIcon account={account} /> : <CategoryIcon category={category} />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-zinc-950 dark:text-zinc-50">{item.description}</p>
                      <p className="text-[12px] text-zinc-500">
                        {formatDate(item.date)} · {account?.name ?? 'Счет'}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[14px] font-semibold tracking-tight">
                    {item.type === 'expense' ? '-' : item.type === 'income' ? '+' : ''}
                    {formatMoney(item.amount, item.currency)}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      ),
    },
  ] satisfies { id: DashboardWidgetId; span: 1 | 2; render: () => ReactNode }[]
}

function OverviewSortableItem({
  id,
  editing,
  span,
  activeId,
  children,
}: {
  id: DashboardWidgetId
  editing: boolean
  span: 1 | 2
  activeId: DashboardWidgetId | null
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
    animateLayoutChanges: (args) => defaultAnimateLayoutChanges(args),
  })

  const transformStyle = transform
    ? CSS.Transform.toString({
        ...transform,
        scaleX: isDragging ? transform.scaleX * 1.015 : transform.scaleX,
        scaleY: isDragging ? transform.scaleY * 1.015 : transform.scaleY,
      })
    : undefined

  const style = {
    transform: transformStyle,
    transition: transition ?? 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease, opacity 180ms ease',
    boxShadow: isDragging ? '0 26px 70px rgba(24, 24, 27, 0.16)' : undefined,
    cursor: isDragging ? 'grabbing' : undefined,
    willChange: editing ? 'transform' : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      data-overview-block={id}
      className={cn(
        'relative w-full min-w-0',
        span === 2 && 'md:col-span-2',
        activeId === id && 'opacity-96',
        isDragging && 'z-20 scale-[1.015] opacity-96',
        editing && 'rounded-[1.7rem] border border-dashed border-zinc-300/80 bg-white/[0.01] p-0.5 dark:border-zinc-700/80',
      )}
      style={style}
    >
      {editing && (
        <button
          type="button"
          aria-label="Перетащить блок"
          className="absolute right-3 top-3 z-20 grid h-9 w-9 cursor-grab place-items-center rounded-full border border-zinc-200/70 bg-white/90 text-zinc-500 shadow-[0_10px_24px_rgba(24,24,27,0.08)] transition-[transform,box-shadow,opacity] duration-200 active:cursor-grabbing active:scale-95 dark:border-zinc-800/70 dark:bg-zinc-950/90 dark:text-zinc-300"
          style={{ touchAction: 'none' }}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className={cn('w-full min-w-0', editing && 'pointer-events-none select-none')}>{children}</div>
    </div>
  )
}

function loadOverviewOrder(registry: DashboardWidgetId[]) {
  try {
    const raw = localStorage.getItem(overviewBlocksOrderKey)
    if (!raw) return buildDefaultOverviewOrder(registry)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(overviewBlocksOrderKey)
      return buildDefaultOverviewOrder(registry)
    }
    const saved = parsed.filter((item): item is string => typeof item === 'string')
    const valid = saved.filter((id): id is DashboardWidgetId => registry.includes(id as DashboardWidgetId))
    if (valid.length === 0) {
      localStorage.removeItem(overviewBlocksOrderKey)
      return buildDefaultOverviewOrder(registry)
    }
    return normalizeOverviewOrder(saved, registry)
  } catch {
    localStorage.removeItem(overviewBlocksOrderKey)
    return buildDefaultOverviewOrder(registry)
  }
}

function buildDefaultOverviewOrder(registry: DashboardWidgetId[]) {
  return [...defaultOverviewBlockOrder.filter((id) => registry.includes(id)), ...registry.filter((id) => !defaultOverviewBlockOrder.includes(id))]
}

function normalizeOverviewOrder(saved: string[], registry: DashboardWidgetId[]): DashboardWidgetId[] {
  const known = new Set(registry)
  const filtered = saved.filter((id): id is DashboardWidgetId => known.has(id as DashboardWidgetId))
  const base = filtered.length > 0 ? filtered : buildDefaultOverviewOrder(registry)
  const unique = [...new Set(base.filter((id) => known.has(id)))] as DashboardWidgetId[]
  return [...unique, ...registry.filter((id) => !unique.includes(id))]
}

function Metric({ title, value, icon: Icon, onClick }: { title: string; value: string; icon: typeof WalletCards; onClick: () => void }) {
  return (
    <button className="w-full text-left active:scale-[0.99]" type="button" onClick={onClick}>
      <Card className="animate-pop w-full">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400">{title}</p>
            <p className="mt-2 text-[30px] font-semibold tracking-tight">{value}</p>
          </div>
          <div className="rounded-[1.1rem] bg-zinc-100 p-3 text-zinc-700 transition active:scale-95 dark:bg-zinc-900 dark:text-zinc-200"><Icon className="h-[18px] w-[18px]" /></div>
        </div>
      </Card>
    </button>
  )
}

function OverviewBlockDetailSheet({
  isOpen,
  blockId,
  data,
  onClose,
}: {
  isOpen: boolean
  blockId: MetricKey | null
  data: OverviewDetailData
  onClose: () => void
}) {
  const [budgetEditOpen, setBudgetEditOpen] = useState(false)

  useEffect(() => {
    if (isOpen && blockId !== 'budget') setBudgetEditOpen(false)
  }, [blockId, isOpen])

  if (!isOpen || !blockId) return null

  const content = buildOverviewDetailContent(blockId, data, {
    budgetEditOpen,
    setBudgetEditOpen,
  })

  return (
    <Modal open hideHeader title="Детали" description={data.monthLabel} onClose={onClose} className="sm:max-w-[860px] sm:rounded-[2.25rem] sm:p-0">
      <div className="flex max-h-[94dvh] min-h-[88dvh] flex-col overflow-hidden rounded-t-[30px] bg-[#f4f4f6] sm:max-h-[88vh] sm:rounded-[32px]">
        <div className="sticky top-0 z-20 border-b border-black/5 bg-[#f4f4f6]/96 px-5 pb-4 pt-3 backdrop-blur-xl sm:px-6">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-black/10 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/80 text-[18px] text-zinc-700 shadow-[0_10px_28px_rgba(24,24,27,0.06)] transition-transform duration-200 active:scale-95"
              aria-label="Закрыть"
              onClick={onClose}
            >
              ×
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[13px] text-zinc-500">{data.monthLabel}</p>
              <h2 className="mt-1 text-[30px] font-medium tracking-tight text-zinc-950 sm:text-[38px]">{detailMeta[blockId].title}</h2>
              <p className="mt-1 text-[14px] text-zinc-500 sm:text-[15px]">{detailMeta[blockId].subtitle(data)}</p>
            </div>
            <div className="w-11" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 pb-[calc(env(safe-area-inset-bottom)+24px)] sm:px-6">
          <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5">
            {content}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function buildOverviewDetailContent(
  blockId: MetricKey,
  data: OverviewDetailData,
  helpers: {
    budgetEditOpen: boolean
    setBudgetEditOpen: (value: boolean) => void
  },
) {
  if (blockId === 'balance') {
    return (
      <>
        <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)] sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] text-zinc-500">{data.monthLabel}</p>
              <p className="mt-2 text-[46px] font-medium tracking-tight text-zinc-950 sm:text-[56px]">{formatMoney(data.totalBalance, data.currency)}</p>
              <p className="mt-3 text-[15px] text-zinc-500">
                <span className={data.totalBalanceDelta >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
                  {data.totalBalanceDelta >= 0 ? '+' : ''}
                  {formatMoney(Math.abs(data.totalBalanceDelta), data.currency)}
                </span>{' '}
                за 30 дней
              </p>
            </div>
            <div className="w-full max-w-[320px] rounded-[1.6rem] bg-[#f5f5f7] p-4">
              <p className="text-[13px] text-zinc-500">Тренд баланса</p>
              <div className="mt-3 h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.balanceHistory} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                    <XAxis dataKey="label" hide />
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Tooltip
                      cursor={false}
                      contentStyle={{ borderRadius: 16, border: '1px solid #e4e4e7' }}
                      formatter={(value) => formatMoney(Number(value), data.currency)}
                    />
                    <Line type="monotone" dataKey="balance" stroke="#18181b" strokeWidth={2.4} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[20px] font-medium tracking-tight text-zinc-950">Быстрые действия</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailAction icon={WalletCards} label="Открыть счета" onClick={data.onOpenAccounts} />
            <DetailAction icon={ArrowUpRight} label="Добавить доход" onClick={data.onOpenIncome} />
            <DetailAction icon={ArrowRightLeft} label="Перевод" onClick={data.onOpenTransfer} />
          </div>
        </section>

        <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[20px] font-medium tracking-tight text-zinc-950">Счета по долям</p>
              <p className="mt-1 text-[13px] text-zinc-500">Распределение общего баланса между активными счетами.</p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {accountShares(data.accounts).map((item) => (
              <div key={item.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-[14px]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[1.1rem]" style={{ backgroundColor: `${item.color}18`, color: item.color }}>
                      <AccountIcon account={item} className="h-5.5 w-5.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[15px] text-zinc-950">{item.name}</p>
                      <p className="text-[12px] text-zinc-500">{accountTypeLabels[item.type]}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[14px] font-medium text-zinc-950">{formatMoney(item.balance, item.currency)}</p>
                    <p className="text-[12px] text-zinc-500">{item.share}%</p>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-zinc-950 transition-all" style={{ width: `${item.share}%`, backgroundColor: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[20px] font-medium tracking-tight text-zinc-950">Последние операции</p>
              <p className="mt-1 text-[13px] text-zinc-500">Скоро можно открыть полную историю.</p>
            </div>
            <Button variant="secondary" size="sm" className="rounded-full" onClick={data.onOpenTransactions}>
              Открыть операции
            </Button>
          </div>
          <div className="mt-4 divide-y divide-black/5">
            {data.recentTransactions.slice(0, 5).map((item) => (
              <DetailTransactionRow key={item.id} transaction={item} category={data.categoryMap.get(item.categoryId)} account={data.accountMap.get(item.accountId) ?? data.accounts[0]} currency={data.currency} />
            ))}
            {data.recentTransactions.length === 0 && <EmptyDetailState title="Операций пока нет" description="Добавьте первый расход или доход, чтобы увидеть движение по счетам." />}
          </div>
        </section>
      </>
    )
  }

  if (blockId === 'budget') {
    return (
      <>
        <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)] sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] text-zinc-500">{data.monthLabel}</p>
              <p className="mt-2 text-[46px] font-medium tracking-tight text-zinc-950 sm:text-[56px]">{formatMoney(data.budgetRemaining, data.currency)}</p>
              <p className="mt-3 text-[15px] text-zinc-500">Осталось из {formatMoney(data.budget, data.currency)}</p>
            </div>
            <div className="w-full max-w-[320px] rounded-[1.6rem] bg-[#f5f5f7] p-4">
              <p className="text-[13px] text-zinc-500">Использование бюджета</p>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-zinc-950 transition-all" style={{ width: `${data.budgetProgress}%` }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-[13px] text-zinc-500">
                <span>Использовано {data.budgetProgress}%</span>
                <span>Осталось {Math.max(0, 100 - data.budgetProgress)}%</span>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[20px] font-medium tracking-tight text-zinc-950">Быстрые действия</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailAction icon={ArrowDownRight} label="Добавить расход" onClick={data.onOpenExpense} />
            <DetailAction icon={WalletCards} label="Изменить лимит" onClick={() => helpers.setBudgetEditOpen(!helpers.budgetEditOpen)} />
            <DetailAction icon={GripVertical} label="Открыть операции" onClick={data.onOpenTransactions} />
          </div>
        </section>

        <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[20px] font-medium tracking-tight text-zinc-950">Инсайты</p>
              <p className="mt-1 text-[13px] text-zinc-500">Ключевые показатели месяца.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniStat label="Расходы месяца" value={formatMoney(data.expenses, data.currency)} />
            <MiniStat label="Доходы месяца" value={formatMoney(data.income, data.currency)} />
            <MiniStat label="Средний расход в день" value={formatMoney(data.expenseTransactions.length ? data.expenses / Math.max(1, new Set(data.expenseTransactions.map((item) => item.date)).size) : 0, data.currency)} />
          </div>
          {helpers.budgetEditOpen && (
            <div className="mt-5 rounded-[1.9rem] bg-[#f5f5f7] p-4">
              <Field label="Новый лимит">
                <Input type="number" value={data.budgetDraft} onChange={(event) => data.setBudgetDraft(Number(event.target.value))} />
              </Field>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  className="rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
                  onClick={async () => {
                    await data.updateSettings({ ...data.settings, monthlyBudget: data.budgetDraft })
                    void tapHaptic('success')
                    data.notify('Бюджет сохранен')
                    helpers.setBudgetEditOpen(false)
                  }}
                >
                  Сохранить лимит
                </Button>
                <Button variant="secondary" className="rounded-full" onClick={() => helpers.setBudgetEditOpen(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[20px] font-medium tracking-tight text-zinc-950">История</p>
              <p className="mt-1 text-[13px] text-zinc-500">Последние расходы, которые формируют бюджет.</p>
            </div>
            <Button variant="secondary" size="sm" className="rounded-full" onClick={data.onOpenTransactions}>
              Все операции
            </Button>
          </div>
          <div className="mt-4 divide-y divide-black/5">
            {data.expenseTransactions.slice(0, 5).map((item) => (
              <DetailTransactionRow key={item.id} transaction={item} category={data.categoryMap.get(item.categoryId)} account={data.accountMap.get(item.accountId) ?? data.accounts[0]} currency={data.currency} />
            ))}
            {data.expenseTransactions.length === 0 && <EmptyDetailState title="Расходов пока нет" description="Добавьте первую операцию, чтобы увидеть историю бюджета." />}
          </div>
        </section>
      </>
    )
  }

  if (blockId === 'expenses') {
    return (
      <>
        <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)] sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] text-zinc-500">{data.monthLabel}</p>
              <p className="mt-2 text-[46px] font-medium tracking-tight text-zinc-950 sm:text-[56px]">{formatMoney(data.expenses, data.currency)}</p>
              <p className="mt-3 text-[15px] text-zinc-500">Расходы за месяц</p>
            </div>
            <div className="w-full max-w-[320px] rounded-[1.6rem] bg-[#f5f5f7] p-4">
              <p className="text-[13px] text-zinc-500">Структура расходов</p>
              <div className="mt-4 space-y-3">
                {categoryBreakdown(data.expenseTransactions, data.categoryMap).slice(0, 4).map((item) => (
                  <div key={item.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="truncate text-zinc-700">{item.name}</span>
                      <span className="font-medium text-zinc-950">{formatMoney(item.value, data.currency)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full" style={{ width: `${item.share}%`, backgroundColor: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[20px] font-medium tracking-tight text-zinc-950">Быстрые действия</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailAction icon={ArrowDownRight} label="Добавить расход" onClick={data.onOpenExpense} />
            <DetailAction icon={GripVertical} label="Открыть операции" onClick={data.onOpenTransactions} />
          </div>
        </section>

        <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)]">
          <p className="text-[20px] font-medium tracking-tight text-zinc-950">Категории расходов</p>
          <div className="mt-5 space-y-4">
            {categoryBreakdown(data.expenseTransactions, data.categoryMap).slice(0, 5).map((item) => (
              <DetailProgressRow key={item.id} label={item.name} value={item.value} share={item.share} color={item.color} currency={data.currency} />
            ))}
            {data.expenseTransactions.length === 0 && <EmptyDetailState title="Расходов пока нет" description="Добавьте первый расход, чтобы увидеть категории." />}
          </div>
        </section>

        <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[20px] font-medium tracking-tight text-zinc-950">Последние расходы</p>
              <p className="mt-1 text-[13px] text-zinc-500">Самые свежие операции месяца.</p>
            </div>
            <Button variant="secondary" size="sm" className="rounded-full" onClick={data.onOpenTransactions}>
              Все операции
            </Button>
          </div>
          <div className="mt-4 divide-y divide-black/5">
            {data.expenseTransactions.slice(0, 5).map((item) => (
              <DetailTransactionRow key={item.id} transaction={item} category={data.categoryMap.get(item.categoryId)} account={data.accountMap.get(item.accountId) ?? data.accounts[0]} currency={data.currency} />
            ))}
            {data.expenseTransactions.length === 0 && <EmptyDetailState title="Расходов пока нет" description="Добавьте первый расход, чтобы увидеть историю." />}
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)] sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] text-zinc-500">{data.monthLabel}</p>
            <p className="mt-2 text-[46px] font-medium tracking-tight text-zinc-950 sm:text-[56px]">{formatMoney(data.income, data.currency)}</p>
            <p className="mt-3 text-[15px] text-zinc-500">Доходы за месяц</p>
          </div>
          <div className="w-full max-w-[320px] rounded-[1.6rem] bg-[#f5f5f7] p-4">
            <p className="text-[13px] text-zinc-500">Источники дохода</p>
            <div className="mt-4 space-y-3">
              {categoryBreakdown(data.incomeTransactions, data.categoryMap).slice(0, 4).map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="truncate text-zinc-700">{item.name}</span>
                    <span className="font-medium text-zinc-950">{formatMoney(item.value, data.currency)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full" style={{ width: `${item.share}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-[20px] font-medium tracking-tight text-zinc-950">Быстрые действия</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailAction icon={ArrowUpRight} label="Добавить доход" onClick={data.onOpenIncome} />
          <DetailAction icon={GripVertical} label="Открыть операции" onClick={data.onOpenTransactions} />
        </div>
      </section>

      <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)]">
        <p className="text-[20px] font-medium tracking-tight text-zinc-950">Источники дохода</p>
        <div className="mt-5 space-y-4">
          {categoryBreakdown(data.incomeTransactions, data.categoryMap).slice(0, 5).map((item) => (
            <DetailProgressRow key={item.id} label={item.name} value={item.value} share={item.share} color={item.color} currency={data.currency} />
          ))}
          {data.incomeTransactions.length === 0 && <EmptyDetailState title="Доходов пока нет" description="Добавьте первый доход, чтобы увидеть источники." />}
        </div>
      </section>

      <section className="overflow-hidden rounded-[2.25rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[20px] font-medium tracking-tight text-zinc-950">Последние доходы</p>
            <p className="mt-1 text-[13px] text-zinc-500">Самые свежие поступления месяца.</p>
          </div>
          <Button variant="secondary" size="sm" className="rounded-full" onClick={data.onOpenTransactions}>
            Все операции
          </Button>
        </div>
        <div className="mt-4 divide-y divide-black/5">
          {data.incomeTransactions.slice(0, 5).map((item) => (
            <DetailTransactionRow key={item.id} transaction={item} category={data.categoryMap.get(item.categoryId)} account={data.accountMap.get(item.accountId) ?? data.accounts[0]} currency={data.currency} />
          ))}
          {data.incomeTransactions.length === 0 && <EmptyDetailState title="Доходов пока нет" description="Добавьте первый доход, чтобы увидеть историю." />}
        </div>
      </section>
    </>
  )
}

type OverviewDetailData = {
  currentMonth: string
  monthLabel: string
  currency: AppSettings['currency']
  totalBalance: number
  totalBalanceDelta: number
  budget: number
  budgetDraft: number
  setBudgetDraft: (value: number) => void
  budgetProgress: number
  budgetRemaining: number
  income: number
  expenses: number
  balanceHistory: { label: string; balance: number }[]
  accounts: AccountBalance[]
  incomeTransactions: Transaction[]
  expenseTransactions: Transaction[]
  recentTransactions: Transaction[]
  categories: Category[]
  accountMap: Map<string, AccountBalance>
  categoryMap: Map<string, Category>
  settings: AppSettings
  updateSettings: (settings: AppSettings) => Promise<unknown>
  onNavigate: (page: PageKey) => void
  onOpenAccounts: () => void
  onOpenTransactions: () => void
  onOpenIncome: () => void
  onOpenExpense: () => void
  onOpenTransfer: () => void
  notify: (message: string) => void
}

const detailMeta: Record<
  MetricKey,
  {
    title: string
    subtitle: (data: OverviewDetailData) => string
  }
> = {
  balance: {
    title: 'Общий баланс',
    subtitle: (data) => `+${formatMoney(Math.abs(data.totalBalanceDelta), data.currency)} за 30 дней`,
  },
  expenses: {
    title: 'Расходы месяца',
    subtitle: (data) => `Текущий расход ${formatMoney(data.expenses, data.currency)}`,
  },
  income: {
    title: 'Доходы месяца',
    subtitle: (data) => `Текущий доход ${formatMoney(data.income, data.currency)}`,
  },
  budget: {
    title: 'Бюджет',
    subtitle: (data) => `Осталось из ${formatMoney(data.budget, data.currency)}`,
  },
}

function DetailAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 items-center justify-center gap-2 rounded-full border border-black/5 bg-white px-4 text-[15px] text-zinc-700 shadow-[0_10px_24px_rgba(24,24,27,0.04)] transition-transform duration-200 active:scale-95"
    >
      <Icon className="h-4.5 w-4.5" />
      <span>{label}</span>
    </button>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.55rem] bg-[#f5f5f7] p-4">
      <p className="text-[12px] text-zinc-500">{label}</p>
      <p className="mt-2 text-[15px] font-medium tracking-tight text-zinc-950">{value}</p>
    </div>
  )
}

function DetailProgressRow({ label, value, share, color, currency }: { label: string; value: number; share: number; color: string; currency: AppSettings['currency'] }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="truncate text-zinc-700">{label}</span>
        <span className="font-medium text-zinc-950">{formatMoney(value, currency)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full" style={{ width: `${Math.max(8, share)}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function DetailTransactionRow({
  transaction,
  category,
  account,
  currency,
}: {
  transaction: Transaction
  category?: Category
  account?: AccountBalance
  currency: AppSettings['currency']
}) {
  return (
    <button type="button" className="flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:bg-zinc-50/80">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[1.1rem] bg-[#f5f5f7] text-zinc-500">
          {transaction.type === 'income' ? <ArrowUpRight className="h-4.5 w-4.5" /> : transaction.type === 'expense' ? <ArrowDownRight className="h-4.5 w-4.5" /> : <ArrowRightLeft className="h-4.5 w-4.5" />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] text-zinc-950">{transaction.description}</p>
          <p className="mt-1 text-[13px] text-zinc-500">
            {formatDate(transaction.date)} · {category?.name ?? 'Категория'} · {account?.name ?? 'Счет'}
          </p>
        </div>
      </div>
      <span className={cn('shrink-0 text-[15px] font-medium tracking-tight', transaction.type === 'expense' ? 'text-rose-500' : transaction.type === 'income' ? 'text-emerald-600' : 'text-zinc-950')}>
        {transaction.type === 'expense' ? '-' : transaction.type === 'income' ? '+' : ''}
        {formatMoney(transaction.amount, currency)}
      </span>
    </button>
  )
}

function EmptyDetailState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.8rem] bg-[#f5f5f7] px-4 py-6 text-center">
      <p className="text-[15px] text-zinc-950">{title}</p>
      <p className="mt-1 text-[13px] text-zinc-500">{description}</p>
    </div>
  )
}

function accountShares(accounts: AccountBalance[]) {
  const active = accounts.filter((account) => !account.archived && account.includeInTotalBalance !== false)
  const total = active.reduce((sum, account) => sum + account.balance, 0) || 1
  return [...active]
    .sort((a, b) => b.balance - a.balance)
    .map((account) => ({
      ...account,
      share: Math.round((account.balance / total) * 100),
    }))
}

function categoryBreakdown(transactions: Transaction[], categoryMap: Map<string, Category>) {
  const totals = new Map<string, { id: string; name: string; value: number; color: string }>()
  for (const item of transactions) {
    const category = categoryMap.get(item.categoryId)
    const name = category?.name ?? 'Другое'
    const color = category?.color ?? '#525252'
    const current = totals.get(item.categoryId) ?? { id: item.categoryId, name, value: 0, color }
    current.value += item.amount
    totals.set(item.categoryId, current)
  }
  const list = [...totals.values()].sort((a, b) => b.value - a.value)
  const total = list.reduce((sum, item) => sum + item.value, 0) || 1
  return list.map((item) => ({ ...item, share: Math.round((item.value / total) * 100) }))
}
function sum(items: Transaction[]) {
  return items.reduce((acc, item) => acc + item.amount, 0)
}

function buildBalanceHistory(transactions: Transaction[], accounts: AccountBalance[]) {
  const current = new Date()
  const series = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(current)
    date.setMonth(current.getMonth() - (5 - index))
    const monthKey = date.toISOString().slice(0, 7)
    const monthEnd = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).toISOString().slice(0, 10)
    const balance = accounts.reduce((acc, account) => acc + account.startingBalance, 0)
      + transactions.reduce((acc, transaction) => {
        if (transaction.date > monthEnd) return acc
        if (transaction.type === 'income') return acc + transaction.amount
        if (transaction.type === 'expense') return acc - transaction.amount
        return acc
      }, 0)
    return {
      label: new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(`${monthKey}-01T00:00:00`)),
      balance,
    }
  })

  return series
}
