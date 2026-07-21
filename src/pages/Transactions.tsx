import {
  Copy,
  Edit3,
  Plus,
  Pin,
  ReceiptText,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AccountBalance,
  AppSettings,
  Category,
  Transaction,
  TransactionType,
} from "../types";
import { currentMonth, formatDate, formatMoney } from "../utils/format";
import { tapHaptic } from "../services/haptics";
import { useToast } from "../components/ui/toastContext";
import { AccountIcon } from "../components/AccountIcon";
import { CategoryIcon } from "../components/CategoryIcon";
import { EmptyState } from "../components/EmptyState";
import { TransactionForm } from "../components/TransactionForm";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { cn } from "../utils/cn";

type FilterType = "all" | TransactionType;
type FilterScope = "all" | "month" | "categories" | "accounts";
type GroupKey = "today" | "yesterday" | "week" | "earlier";

export function Transactions({
  accounts,
  transactions,
  categories,
  settings,
  addTransaction,
  duplicateTransaction,
  updateTransaction,
  deleteTransaction,
}: {
  accounts: AccountBalance[];
  transactions: Transaction[];
  categories: Category[];
  settings: AppSettings;
  addTransaction: (
    transaction: Omit<Transaction, "id" | "createdAt" | "updatedAt">
  ) => Promise<unknown>;
  duplicateTransaction: (id: string) => Promise<unknown>;
  updateTransaction: (transaction: Transaction) => Promise<unknown>;
  deleteTransaction: (id: string) => Promise<unknown>;
}) {
  const { notify } = useToast();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [scope, setScope] = useState<FilterScope>("all");
  const [editing, setEditing] = useState<Transaction | null | undefined>(
    undefined
  );
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [groupByPin, setGroupByPin] = useState<string | null>(null);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const monthKey = currentMonth();
    return transactions.filter((item) => {
      const category =
        categoryMap.get(item.categoryId)?.name.toLowerCase() ?? "";
      const account = accountMap.get(item.accountId)?.name.toLowerCase() ?? "";
      const toAccount = item.toAccountId
        ? accountMap.get(item.toAccountId)?.name.toLowerCase() ?? ""
        : "";
      const inMonth = item.date.startsWith(monthKey);
      return (
        (typeFilter === "all" || item.type === typeFilter) &&
        (scope !== "month" || inMonth) &&
        (!normalized ||
          item.description.toLowerCase().includes(normalized) ||
          item.paymentMethod.toLowerCase().includes(normalized) ||
          category.includes(normalized) ||
          account.includes(normalized) ||
          toAccount.includes(normalized))
      );
    });
  }, [accountMap, categoryMap, query, scope, transactions, typeFilter]);

  const visible = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const groups = useMemo(() => groupTransactions(visible), [visible]);
  const activeCount =
    Number(typeFilter !== "all") +
    Number(scope !== "all") +
    Number(Boolean(query.trim()));

  function resetFilters() {
    setQuery("");
    setTypeFilter("all");
    setScope("all");
    setGroupByPin(null);
    void tapHaptic("selection");
  }

  function openEdit(item: Transaction) {
    setEditing(item);
  }

  return (
    <>
      <div className="space-y-6 sm:space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="ds-caption font-medium text-zinc-500">Мои операции</p>
            <h1 className="ds-display mt-2 text-zinc-950 dark:text-zinc-50">
              {t("pages.transactions")}
            </h1>
          </div>
          <Button onClick={() => setEditing(null)}>
            <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
            Новая
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            className="h-14 rounded-full pl-11 text-[16px] sm:h-12 sm:text-[14px]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip
            active={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
          >
            Все
          </Chip>
          <Chip
            active={typeFilter === "expense"}
            onClick={() => setTypeFilter("expense")}
          >
            Расходы
          </Chip>
          <Chip
            active={typeFilter === "income"}
            onClick={() => setTypeFilter("income")}
          >
            Доходы
          </Chip>
          <Chip
            active={typeFilter === "transfer"}
            onClick={() => setTypeFilter("transfer")}
          >
            Переводы
          </Chip>
          <Chip
            active={scope === "month"}
            onClick={() => setScope(scope === "month" ? "all" : "month")}
          >
            Месяц
          </Chip>
          <Chip
            active={scope === "categories"}
            onClick={() =>
              setScope(scope === "categories" ? "all" : "categories")
            }
          >
            Кат.
          </Chip>
          <Chip
            active={scope === "accounts"}
            onClick={() => setScope(scope === "accounts" ? "all" : "accounts")}
          >
            Счета
          </Chip>
        </div>

        <div className="flex items-center justify-between">
          <p className="ds-caption font-medium text-zinc-500">
            {visible.length} операций
          </p>
          {activeCount > 0 && (
            <button
              type="button"
              className="ds-caption font-medium text-zinc-500"
              onClick={resetFilters}
            >
              Сбросить
            </button>
          )}
        </div>

        <div className="space-y-6">
          {groups.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Операций нет"
              description="Попробуйте другой фильтр или добавьте новую операцию."
            />
          ) : (
            groups.map((group) => (
              <section key={group.key} className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="ds-section-title text-zinc-950 dark:text-zinc-50">
                      {group.label}
                    </p>
                    <p className="ds-caption mt-1 text-zinc-500">
                      {group.items.length} операций
                    </p>
                  </div>
                  {group.key === groupByPin && (
                    <span className="ds-caption text-zinc-500">Закреплено</span>
                  )}
                </div>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <SwipeCard
                      key={item.id}
                      item={item}
                      account={accountMap.get(item.accountId)}
                      toAccount={
                        item.toAccountId
                          ? accountMap.get(item.toAccountId)
                          : undefined
                      }
                      category={categoryMap.get(item.categoryId)}
                      onEdit={() => openEdit(item)}
                      onDuplicate={() =>
                        void duplicateTransaction(item.id).then(() => {
                          void tapHaptic("success");
                          notify("Операция скопирована");
                        })
                      }
                      onDelete={() => setConfirmId(item.id)}
                      onPin={() => {
                        setGroupByPin((current) =>
                          current === item.id ? null : item.id
                        );
                        void tapHaptic("selection");
                      }}
                      pinned={groupByPin === item.id}
                      scope={scope}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <Button
        className="fixed bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+1rem)] right-4 z-40 h-14 w-14 rounded-full shadow-[0_18px_40px_rgba(24,24,27,0.18)] lg:bottom-6"
        onClick={() => setEditing(null)}
        aria-label="Новая операция"
      >
        <Plus className="h-5 w-5" />
      </Button>

      <Modal
        open={editing !== undefined}
        title={editing ? "Редактировать операцию" : "Новая операция"}
        description="Операция сразу обновит балансы счетов и графики."
        onClose={() => setEditing(undefined)}
      >
        <TransactionForm
          accounts={accounts}
          categories={categories}
          settings={settings}
          initial={editing ?? undefined}
          submitLabel={editing ? "Сохранить" : "Создать"}
          onSubmit={async (transaction) => {
            if (editing) {
              await updateTransaction(transaction as Transaction);
              notify("Операция обновлена");
            } else {
              await addTransaction(
                transaction as Omit<
                  Transaction,
                  "id" | "createdAt" | "updatedAt"
                >
              );
              notify("Операция создана");
            }
            void tapHaptic("success");
            setEditing(undefined);
          }}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmId)}
        title="Удалить операцию?"
        description="Операция будет удалена, а балансы счетов пересчитаются автоматически."
        confirmLabel="Удалить"
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (!confirmId) return;
          void deleteTransaction(confirmId).then(() => {
            void tapHaptic("warning");
            notify("Операция удалена");
          });
        }}
      />
    </>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "motion-soft inline-flex h-11 shrink-0 items-center rounded-full px-4 text-[13px] font-medium sm:h-10 sm:px-3.5 sm:text-[12px]",
        active
          ? "bg-zinc-950 text-white shadow-[0_12px_28px_rgba(24,24,27,0.16)] dark:bg-white dark:text-zinc-950"
          : "bg-white text-zinc-600 shadow-[0_10px_22px_rgba(24,24,27,0.05)] hover:text-zinc-950 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      )}
    >
      {children}
    </button>
  );
}

function SwipeCard({
  item,
  account,
  toAccount,
  category,
  onEdit,
  onDuplicate,
  onDelete,
  onPin,
  pinned,
  scope,
}: {
  item: Transaction;
  account?: AccountBalance;
  toAccount?: AccountBalance;
  category?: Category;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPin: () => void;
  pinned: boolean;
  scope: FilterScope;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);

  return (
    <div className="animate-enter relative isolate overflow-hidden rounded-[1.6rem] ds-surface">
      <div className="absolute inset-y-0 right-0 z-10 flex w-80 items-stretch">
        <button
          className="flex-1 bg-zinc-100 text-[12px] font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          onClick={onPin}
        >
          <Pin className="mx-auto mb-1 h-4 w-4" />
          {pinned ? "Открепить" : "Закрепить"}
        </button>
        <button
          className="flex-1 bg-zinc-50 text-[12px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          onClick={onDuplicate}
        >
          <Copy className="mx-auto mb-1 h-4 w-4" />
          Копия
        </button>
        <button
          className="flex-1 bg-zinc-50 text-[12px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          onClick={onEdit}
        >
          <Edit3 className="mx-auto mb-1 h-4 w-4" />
          Изменить
        </button>
        <button
          className="flex-1 bg-zinc-950 text-[12px] font-medium text-white dark:bg-white dark:text-zinc-950"
          onClick={onDelete}
        >
          <Trash2 className="mx-auto mb-1 h-4 w-4" />
          Удалить
        </button>
      </div>
      <div
        className="relative z-20 bg-white transition-transform duration-200 dark:bg-zinc-950"
        style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }}
        onPointerDown={(event) => {
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          startX.current = event.clientX;
          startOffset.current = offset;
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          const next = Math.max(
            -216,
            Math.min(72, startOffset.current + (event.clientX - startX.current))
          );
          setOffset(next);
        }}
        onPointerUp={() => {
          setDragging(false);
          setOffset((current) =>
            current < -110 ? -216 : current > 48 ? 72 : 0
          );
        }}
        onPointerCancel={() => {
          setDragging(false);
          setOffset(0);
        }}
      >
        <button
          type="button"
          className="block min-h-[92px] w-full px-4 py-4 text-left"
          onClick={() => {
            if (offset < 0) {
              setOffset(0);
              return;
            }
            onEdit();
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-[1.15rem] bg-zinc-100 dark:bg-zinc-900"
                style={{ color: account?.color ?? "#18181b" }}
              >
                {item.type === "transfer" ? (
                  <AccountIcon account={account} className="h-6.5 w-6.5" />
                ) : (
                  <CategoryIcon category={category} className="h-6.5 w-6.5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  {item.description || "Операция"}
                </p>
                <p className="mt-1 truncate text-[13px] leading-5 text-zinc-500">
                  {category?.name ?? "Другое"}
                  {scope !== "categories"
                    ? ` · ${account?.name ?? "Счет"}`
                    : ""}
                  {item.toAccountId && toAccount ? ` → ${toAccount.name}` : ""}
                </p>
                <p className="mt-1 text-[13px] leading-5 text-zinc-500">
                  {formatDate(item.date)}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[16px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                {item.type === "expense"
                  ? "-"
                  : item.type === "income"
                  ? "+"
                  : ""}
                {formatMoney(item.amount, item.currency)}
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

function groupTransactions(transactions: Transaction[]) {
  const now = new Date();
  const today = stripTime(now);
  const yesterday = stripTime(addDays(now, -1));
  const weekStart = stripTime(addDays(now, -6));

  const sections: { key: GroupKey; label: string; items: Transaction[] }[] = [
    { key: "today", label: "Сегодня", items: [] },
    { key: "yesterday", label: "Вчера", items: [] },
    { key: "week", label: "На этой неделе", items: [] },
    { key: "earlier", label: "Ранее", items: [] },
  ];

  transactions.forEach((item) => {
    const date = stripTime(new Date(item.date));
    if (date >= today) sections[0].items.push(item);
    else if (date >= yesterday && date < today) sections[1].items.push(item);
    else if (date >= weekStart) sections[2].items.push(item);
    else sections[3].items.push(item);
  });

  return sections.filter((section) => section.items.length > 0);
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}
