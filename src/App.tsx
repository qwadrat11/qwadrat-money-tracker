import { lazy, Suspense, useState } from 'react'
import { AuthLoader } from './auth/AuthLoader'
import { AuthScreen } from './auth/AuthScreen'
import { useAuth } from './auth/useAuth'
import { AppShell, type PageKey } from './components/AppShell'
import { OnboardingModal } from './components/OnboardingModal'
import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { ToastProvider } from './components/ui/Toast'
import { useFinanceStore } from './hooks/useFinanceStore'
import { getAccountBalances } from './services/storage'

const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })))
const Accounts = lazy(() => import('./pages/Accounts').then((module) => ({ default: module.Accounts })))
const Transactions = lazy(() => import('./pages/Transactions').then((module) => ({ default: module.Transactions })))
const Categories = lazy(() => import('./pages/Categories').then((module) => ({ default: module.Categories })))
const AIScan = lazy(() => import('./pages/AIScan').then((module) => ({ default: module.AIScan })))
const ExportPage = lazy(() => import('./pages/Export').then((module) => ({ default: module.ExportPage })))
const Admin = lazy(() => import('./pages/Admin').then((module) => ({ default: module.Admin })))
const SettingsPage = lazy(() => import('./pages/Settings').then((module) => ({ default: module.SettingsPage })))

function App() {
  const { session, loading: authLoading } = useAuth()
  const [page, setPage] = useState<PageKey>('dashboard')
  const { accounts, transactions, categories, users, receiptScans, settings, actions, isLoading, isError, error, migration, importLocalData, skipLocalDataImport } =
    useFinanceStore()
  const accountBalances = getAccountBalances(accounts, transactions)
  const onboardingOpen = !settings.hasSeenOnboarding

  if (authLoading) {
    return <AuthLoader />
  }

  if (!session) {
    return (
      <ToastProvider>
        <AuthScreen />
      </ToastProvider>
    )
  }

  if (isLoading) {
    return (
      <ToastProvider>
        <div className="grid min-h-screen place-items-center bg-[var(--app-bg)]">
          <Card className="animate-pop w-[min(360px,calc(100vw-2rem))]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
              <div className="flex-1">
                <div className="h-3 w-32 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-2 h-2 w-48 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
              </div>
            </div>
            <p className="mt-4 text-[13px] text-zinc-500">Загружаем данные...</p>
          </Card>
        </div>
      </ToastProvider>
    )
  }

  if (isError) {
    return (
      <ToastProvider>
        <div className="grid min-h-screen place-items-center bg-[var(--app-bg)] px-4">
          <Card className="animate-pop w-[min(420px,calc(100vw-2rem))] text-center">
            <p className="text-[18px] font-medium text-zinc-950 dark:text-zinc-50">Не удалось загрузить данные</p>
            <p className="mt-2 text-[14px] text-zinc-500 dark:text-zinc-400">
              {error instanceof Error ? error.message : 'Проверьте соединение и попробуйте еще раз.'}
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button className="flex-1" onClick={() => void actions.resetDemoData()}>
                Восстановить демо-данные
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => void window.location.reload()}>
                Обновить
              </Button>
            </div>
          </Card>
        </div>
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      {(migration.status === 'available' || migration.status === 'importing') && (
        <div className="fixed left-1/2 top-4 z-50 w-[min(560px,calc(100vw-1rem))] -translate-x-1/2">
          <Card className="animate-pop border border-zinc-200/70 bg-white/90 p-4 shadow-[0_18px_50px_rgba(24,24,27,0.12)] backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/90">
            <p className="text-[15px] font-medium text-zinc-950 dark:text-zinc-50">Найдены локальные данные</p>
            <p className="mt-1 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400">Перенести их в аккаунт, чтобы видеть одинаковые данные на всех устройствах?</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" onClick={() => void importLocalData()} disabled={migration.status === 'importing'}>
                {migration.status === 'importing' ? 'Переносим...' : 'Перенести'}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={skipLocalDataImport}>
                Пропустить
              </Button>
            </div>
          </Card>
        </div>
      )}
      <AppShell page={page} settings={settings} onPageChange={setPage} onThemeChange={(theme) => void actions.updateSettings({ ...settings, theme })}>
        <Suspense fallback={<PageSkeleton />}>
          {page === 'dashboard' && (
            <Dashboard
              transactions={transactions}
              categories={categories}
              accounts={accountBalances}
              settings={settings}
              updateSettings={actions.updateSettings}
              addTransaction={actions.addTransaction}
              onNavigate={setPage}
            />
          )}
          {page === 'accounts' && (
            <Accounts
              accounts={accountBalances}
              transactions={transactions}
              categories={categories}
              settings={settings}
              addTransaction={actions.addTransaction}
              addAccount={actions.addAccount}
              updateAccount={actions.updateAccount}
              archiveAccount={actions.archiveAccount}
              deleteAccount={actions.deleteAccount}
            />
          )}
          {page === 'transactions' && (
            <Transactions
              accounts={accountBalances}
              transactions={transactions}
              categories={categories}
              settings={settings}
              addTransaction={actions.addTransaction}
              duplicateTransaction={actions.duplicateTransaction}
              updateTransaction={actions.updateTransaction}
              deleteTransaction={actions.deleteTransaction}
            />
          )}
          {page === 'categories' && (
            <Categories
              categories={categories}
              addCategory={actions.addCategory}
              duplicateCategory={actions.duplicateCategory}
              updateCategory={actions.updateCategory}
              reorderCategory={actions.reorderCategory}
              deleteCategory={actions.deleteCategory}
            />
          )}
          {page === 'ai' && <AIScan accounts={accountBalances} categories={categories} settings={settings} addTransaction={actions.addTransaction} addReceiptScan={actions.addReceiptScan} />}
          {page === 'export' && <ExportPage transactions={transactions} categories={categories} accounts={accounts} />}
          {page === 'admin' && (
            <Admin
              users={users}
              categories={categories}
              accounts={accounts}
              receiptScans={receiptScans}
              transactions={transactions}
              settings={settings}
              resetDemoData={actions.resetDemoData}
              clearTransactions={actions.clearTransactions}
              generateDemoData={actions.generateDemoData}
              addUser={actions.addUser}
              updateUser={actions.updateUser}
              deleteUser={actions.deleteUser}
              updateSettings={actions.updateSettings}
            />
          )}
          {page === 'settings' && <SettingsPage settings={settings} updateSettings={actions.updateSettings} />}
        </Suspense>
      </AppShell>
      <OnboardingModal open={onboardingOpen} onClose={() => void actions.updateSettings({ ...settings, hasSeenOnboarding: true })} />
    </ToastProvider>
  )
}

function PageSkeleton() {
  return (
    <div className="grid gap-4 animate-enter">
      <div className="h-8 w-44 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="h-32 animate-pulse bg-zinc-100 dark:bg-zinc-900" />
        ))}
      </div>
    </div>
  )
}

export default App
