import type { LucideIcon } from 'lucide-react'
import { ArrowRight, WalletCards, ScanLine, SlidersHorizontal } from 'lucide-react'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

export function OnboardingModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      title="Добро пожаловать"
      description="Короткая настройка перед первым запуском. Дальше все сохранится локально и будет работать как обычное приложение."
      onClose={onClose}
      className="sm:max-w-2xl"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Step icon={WalletCards} title="Счета" text="Создайте карты, наличные и накопления, чтобы видеть общий баланс." />
        <Step icon={SlidersHorizontal} title="Операции" text="Добавляйте расходы, доходы и переводы. Все пересчитывается автоматически." />
        <Step icon={ScanLine} title="AI-скан" text="Загружайте чек или фото, чтобы быстро превратить его в расход." />
      </div>
      <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        На первом экране уже есть демо-данные. Их можно удалить или заменить своими.
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>Понятно</Button>
        <Button onClick={onClose}>
          Начать работу
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Modal>
  )
}

function Step({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon
  title: string
  text: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{title}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
    </div>
  )
}
