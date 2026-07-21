import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  ChevronRight,
  Edit3,
  Plus,
  Settings,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";
import * as Switch from "@radix-ui/react-switch";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AccountIcon } from "../components/AccountIcon";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/ui/Button";
import { Card, CardDescription, CardTitle } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Field, Input, Select } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { TransactionForm } from "../components/TransactionForm";
import {
  accountIconLabels,
  accountIconNames,
  accountTypeLabels,
} from "../constants/accounts";
import { tapHaptic } from "../services/haptics";
import type {
  Account,
  AccountBalance,
  AppSettings,
  Category,
  Transaction,
} from "../types";
import { formatDate, formatMoney } from "../utils/format";
import { cn } from "../utils/cn";
import { useToast } from "../components/ui/toastContext";
import { getDefaultCategoryId, getTransferCategoryId } from "../utils/category";
import { CryptoAccountDetails } from "../components/CryptoAccountDetails";
import { loadCryptoPortfolio } from "../services/cryptoPortfolio";

type AccountDraft = Omit<Account, "id" | "createdAt" | "updatedAt">;
type AccountSettingsDraft = {
  name: string;
  type: Account["type"];
  currency: Account["currency"];
  icon: string;
  color: string;
  balance: number;
  includeInTotalBalance: boolean;
};

const emptyDraft: AccountDraft = {
  name: "",
  type: "bank_card",
  currency: "USD",
  icon: "CreditCard",
  color: "#525252",
  balance: 0,
  startingBalance: 0,
  archived: false,
  includeInTotalBalance: true,
};

export function Accounts({
  accounts,
  transactions,
  categories,
  settings,
  addTransaction,
  addAccount,
  updateAccount,
  archiveAccount,
  deleteAccount,
  cryptoOpenRequest = 0,
}: {
  accounts: AccountBalance[];
  transactions: Transaction[];
  categories: Category[];
  settings: AppSettings;
  addTransaction: (
    transaction: Omit<Transaction, "id" | "createdAt" | "updatedAt">
  ) => Promise<unknown>;
  addAccount: (
    account: Omit<Account, "id" | "createdAt" | "updatedAt">
  ) => Promise<unknown>;
  updateAccount: (account: Account) => Promise<unknown>;
  archiveAccount: (id: string) => Promise<unknown>;
  deleteAccount: (id: string) => Promise<unknown>;
  cryptoOpenRequest?: number;
}) {
  const { notify } = useToast();
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(
    accounts.find((account) => !account.archived)?.id ?? null
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsAccount, setSettingsAccount] = useState<AccountBalance | null>(
    null
  );
  const [settingsDraft, setSettingsDraft] =
    useState<AccountSettingsDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [transferAccount, setTransferAccount] = useState<AccountBalance | null>(
    null
  );
  const [transferOpen, setTransferOpen] = useState(false);
  const [operationAccount, setOperationAccount] =
    useState<AccountBalance | null>(null);
  const [operationMode, setOperationMode] = useState<"income" | "expense">(
    "income"
  );
  const [operationOpen, setOperationOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    type: "archive" | "delete";
    id: string;
  } | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.archived),
    [accounts]
  );
  const cryptoAccount =
    activeAccounts.find((account) => account.type === "crypto_portfolio") ??
    null;
  const cryptoPortfolio = useQuery({
    queryKey: ["crypto-portfolio", cryptoAccount?.id],
    queryFn: () => loadCryptoPortfolio(cryptoAccount!.id),
    enabled: Boolean(cryptoAccount),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
  });
  const valuedAccounts = useMemo(
    () =>
      activeAccounts.map((account) =>
        account.type === "crypto_portfolio"
          ? {
              ...account,
              balance: cryptoPortfolio.data?.summary.portfolioValue ?? 0,
              currency: settings.baseCurrency,
            }
          : account
      ),
    [activeAccounts, cryptoPortfolio.data, settings.baseCurrency]
  );
  const totalBalanceAccounts = useMemo(
    () =>
      valuedAccounts.filter(
        (account) => account.includeInTotalBalance !== false
      ),
    [valuedAccounts]
  );
  const displayAccounts = useMemo(
    () =>
      [...valuedAccounts].sort((a, b) => {
        const priority = accountPriority(a) - accountPriority(b);
        if (priority !== 0) return priority;
        if (b.balance !== a.balance) return b.balance - a.balance;
        return a.name.localeCompare(b.name, "ru");
      }),
    [valuedAccounts]
  );
  const selectedAccount =
    activeAccounts.find((account) => account.id === selectedId) ??
    activeAccounts[0] ??
    null;
  useEffect(() => {
    if (!cryptoOpenRequest || !cryptoAccount) return;
    setSelectedId(cryptoAccount.id);
    setDetailsOpen(true);
  }, [cryptoAccount, cryptoOpenRequest]);
  const totalBalance = useMemo(
    () =>
      totalBalanceAccounts.reduce((sum, account) => sum + account.balance, 0),
    [totalBalanceAccounts]
  );
  const portfolioTrend = useMemo(
    () => buildPortfolioHistory(totalBalanceAccounts, transactions),
    [totalBalanceAccounts, transactions]
  );
  const balanceTrend = useMemo(
    () => buildTrend(totalBalanceAccounts, transactions),
    [totalBalanceAccounts, transactions]
  );
  const assetStructure = useMemo(
    () =>
      buildAssetStructure(
        displayAccounts.filter(
          (account) => account.includeInTotalBalance !== false
        )
      ),
    [displayAccounts]
  );
  const chartStroke = settings.theme === "dark" ? "#f5f5f5" : "#18181b";
  const selectedHistory = useMemo(
    () =>
      selectedAccount ? buildAccountHistory(selectedAccount, transactions) : [],
    [selectedAccount, transactions]
  );
  const selectedTransactions = useMemo(
    () =>
      selectedAccount
        ? transactions
            .filter(
              (transaction) =>
                transaction.accountId === selectedAccount.id ||
                transaction.toAccountId === selectedAccount.id
            )
            .sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [selectedAccount, transactions]
  );

  function openCreate() {
    const existing = accounts.find(
      (account) => account.type === "crypto_portfolio" && !account.archived
    );
    if (draft.type === "crypto_portfolio" && existing) {
      openDetails(existing);
      notify("У вас уже есть активный криптопортфель");
      return;
    }
    setDraft(emptyDraft);
    setCreateOpen(true);
  }

  function openSettings(account: AccountBalance) {
    setSettingsAccount(account);
    setSettingsDraft({
      name: account.name,
      type: account.type,
      currency: account.currency,
      icon: account.icon,
      color: account.color,
      balance: account.balance,
      includeInTotalBalance: account.includeInTotalBalance ?? true,
    });
    setSettingsError(null);
    setSettingsOpen(true);
  }

  function openDetails(account: AccountBalance) {
    setSelectedId(account.id);
    setDetailsOpen(true);
  }

  function openTransfer(account: AccountBalance) {
    if (account.type === "crypto_portfolio") return;
    if (
      activeAccounts.filter(
        (item) => item.type !== "crypto_portfolio" && item.id !== account.id
      ).length === 0
    ) {
      void tapHaptic("warning");
      notify("Для перевода нужен еще один активный счет");
      return;
    }
    setTransferAccount(account);
    setTransferOpen(true);
  }

  function openOperation(account: AccountBalance, mode: "income" | "expense") {
    if (account.type === "crypto_portfolio") return;
    setOperationAccount(account);
    setOperationMode(mode);
    setOperationOpen(true);
  }

  return (
    <>
      <div className="animate-float space-y-6 sm:space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="ds-caption font-medium text-zinc-500">Мои деньги</p>
            <h1 className="ds-display mt-1 text-zinc-950 dark:text-zinc-50">
              {t("pages.accounts")}
            </h1>
          </div>
          <Button
            variant="secondary"
            size="icon"
            className="h-11 w-11 rounded-full shadow-[0_12px_24px_rgba(24,24,27,0.06)]"
            onClick={openCreate}
            aria-label="Новый счет"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <Card className="overflow-hidden p-0 animate-pop">
          <div className="grid gap-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Общий баланс</CardTitle>
                <CardDescription>
                  Все счета вместе и динамика за 30 дней.
                </CardDescription>
              </div>
              <div className="rounded-full bg-zinc-100 px-3 py-2 text-[12px] font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-300">
                {displayAccounts.length} счетов
              </div>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <AnimatedNumber
                value={totalBalance}
                currency={
                  displayAccounts[0]?.currency ??
                  activeAccounts[0]?.currency ??
                  "USD"
                }
                className="text-[2.75rem] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-[3.25rem]"
              />
              <div className="rounded-full bg-zinc-100/80 px-3 py-2 text-[12px] font-medium text-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-300">
                <span
                  className={
                    balanceTrend.delta >= 0
                      ? "text-emerald-600"
                      : "text-rose-500"
                  }
                >
                  {balanceTrend.delta >= 0 ? "+" : ""}
                  {formatMoney(
                    Math.abs(balanceTrend.delta),
                    displayAccounts[0]?.currency ??
                      activeAccounts[0]?.currency ??
                      "USD"
                  )}
                </span>{" "}
                за 30 дней
              </div>
            </div>
            <div className="h-24 rounded-[1.5rem] bg-zinc-50/80 p-3 dark:bg-zinc-900/70">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={portfolioTrend}
                  margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="portfolioFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={chartStroke}
                        stopOpacity={0.18}
                      />
                      <stop
                        offset="95%"
                        stopColor={chartStroke}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      borderRadius: 16,
                      border: "1px solid #e4e4e7",
                    }}
                    formatter={(value) =>
                      formatMoney(
                        Number(value),
                        activeAccounts[0]?.currency ?? "USD"
                      )
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={chartStroke}
                    strokeWidth={2.4}
                    fill="url(#portfolioFill)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          {displayAccounts.length === 0 ? (
            <EmptyState
              icon={WalletCards}
              title="Добавьте первый счет"
              description="Создайте карту, наличные или накопления."
            />
          ) : (
            displayAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => openDetails(account)}
                className="group flex min-h-[112px] items-center justify-between gap-4 rounded-[2rem] border border-zinc-200/70 bg-white px-5 py-5 text-left shadow-[0_14px_34px_rgba(24,24,27,0.05)] transition-[transform,box-shadow,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(24,24,27,0.08)] active:scale-[0.99] dark:border-zinc-800/70 dark:bg-zinc-950 sm:min-h-[96px] sm:px-4 sm:py-4"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-[1.5rem]"
                    style={{
                      backgroundColor: `${account.color}18`,
                      color: account.color,
                    }}
                  >
                    <AccountIcon account={account} className="h-7 w-7" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[1.08rem] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                        {account.name}
                      </p>
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-300">
                        {accountCardTypeLabel(account.type)}
                      </span>
                    </div>
                    {account.type === "crypto_portfolio" &&
                      cryptoPortfolio.data && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                          <span
                            className={
                              (cryptoPortfolio.data.summary
                                .portfolioChange24h ?? 0) >= 0
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }
                          >
                            24 ч.:{" "}
                            {formatMoney(
                              cryptoPortfolio.data.summary.portfolioChange24h,
                              settings.baseCurrency
                            )}
                          </span>
                          <span>
                            • {cryptoPortfolio.data.summary.coinCount} монет
                          </span>
                          <span className="flex -space-x-1">
                            {cryptoPortfolio.data.positions
                              .slice()
                              .sort(
                                (a, b) =>
                                  (b.positionValue ?? 0) -
                                  (a.positionValue ?? 0)
                              )
                              .slice(0, 4)
                              .map((position) =>
                                position.imageUrl ? (
                                  <img
                                    key={position.id}
                                    className="h-5 w-5 rounded-full border border-white"
                                    src={position.imageUrl}
                                    alt=""
                                  />
                                ) : null
                              )}
                          </span>
                        </div>
                      )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <p className="max-w-[9rem] truncate text-[1.35rem] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:max-w-none sm:text-[1.7rem]">
                    {account.type === "crypto_portfolio" &&
                    cryptoPortfolio.isLoading
                      ? "Обновляем…"
                      : formatMoney(account.balance, account.currency)}
                  </p>
                  <ChevronRight className="h-5 w-5 text-zinc-300 transition-transform duration-300 group-hover:translate-x-0.5 dark:text-zinc-600" />
                </div>
              </button>
            ))
          )}
        </div>

        <Card className="animate-pop">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Структура активов</CardTitle>
              <CardDescription>
                Доли по текущему балансу счетов.
              </CardDescription>
            </div>
            <div className="rounded-full bg-zinc-100 px-3 py-2 text-[12px] font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-300">
              {formatMoney(totalBalance, activeAccounts[0]?.currency ?? "USD")}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {assetStructure.length === 0 ? (
              <div className="rounded-[1.35rem] bg-zinc-50 p-4 text-[14px] text-zinc-500 dark:bg-zinc-900">
                Пока нет активных счетов для отображения структуры.
              </div>
            ) : (
              assetStructure.map((item) => (
                <div key={item.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-zinc-950 dark:text-zinc-50">
                        {item.name}
                      </p>
                      <p className="text-[12px] text-zinc-500">
                        {item.typeLabel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                        {item.percent}%
                      </p>
                      <p className="text-[12px] text-zinc-500">
                        {formatMoney(item.value, item.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${item.percent}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={detailsOpen && Boolean(selectedAccount)}
        title={selectedAccount?.name ?? "Счет"}
        description={
          selectedAccount ? accountTypeLabels[selectedAccount.type] : undefined
        }
        onClose={() => setDetailsOpen(false)}
        className="sm:max-w-3xl"
      >
        {selectedAccount?.type === "crypto_portfolio" ? (
          <CryptoAccountDetails account={selectedAccount} settings={settings} />
        ) : (
          selectedAccount && (
            <div className="space-y-5">
              <section className="rounded-[2.25rem] bg-zinc-950 p-5 text-white shadow-[0_24px_60px_rgba(24,24,27,0.18)] dark:bg-white dark:text-zinc-950">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="grid h-16 w-16 place-items-center rounded-[1.6rem] bg-white/10 shadow-inner dark:bg-zinc-950/10"
                      style={{ color: selectedAccount.color }}
                    >
                      <AccountIcon
                        account={selectedAccount}
                        className="h-9 w-9"
                      />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-white/60 dark:text-zinc-500">
                        {accountTypeLabels[selectedAccount.type]}
                      </p>
                      <p className="mt-1 text-[1.35rem] font-semibold tracking-tight text-white dark:text-zinc-950">
                        {selectedAccount.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-full bg-white/10 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-white/15 dark:bg-zinc-950/10 dark:text-zinc-950"
                    onClick={() => openSettings(selectedAccount)}
                  >
                    Настройки
                  </button>
                </div>
                <div className="mt-6">
                  <p className="ds-caption text-white/60 dark:text-zinc-500">
                    Доступно
                  </p>
                  <AnimatedNumber
                    value={selectedAccount.balance}
                    currency={selectedAccount.currency}
                    className="mt-2 text-[3rem] font-semibold tracking-tight text-white dark:text-zinc-950"
                  />
                  <p className="mt-3 text-[13px] text-white/60 dark:text-zinc-500">
                    Баланс обновляется вместе с каждой операцией.
                  </p>
                </div>
              </section>

              <section className="ds-surface rounded-[2rem] p-4 sm:p-5">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="ds-section-title text-zinc-950 dark:text-zinc-50">
                      История
                    </p>
                    <p className="ds-caption mt-1 text-zinc-500">
                      Последние 6 месяцев
                    </p>
                  </div>
                  <p className="ds-caption text-zinc-500">
                    {selectedAccount.currency}
                  </p>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={selectedHistory}
                      margin={{ top: 6, right: 8, left: -18, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 16,
                          border: "1px solid #e4e4e7",
                        }}
                        formatter={(value) =>
                          formatMoney(Number(value), selectedAccount.currency)
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="balance"
                        stroke="#18181b"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="grid grid-cols-3 gap-2">
                <MiniStat
                  label="Доход"
                  value={formatMoney(
                    selectedAccount.monthlyIncome,
                    selectedAccount.currency
                  )}
                />
                <MiniStat
                  label="Расход"
                  value={formatMoney(
                    selectedAccount.monthlyExpense,
                    selectedAccount.currency
                  )}
                />
                <MiniStat
                  label="Переводы"
                  value={formatMoney(
                    sumTransfers(selectedTransactions, selectedAccount.id),
                    selectedAccount.currency
                  )}
                />
              </section>

              <section className="grid grid-cols-2 gap-2">
                <ActionButton
                  onClick={() => openTransfer(selectedAccount)}
                  icon={ArrowRightLeft}
                >
                  Перевод
                </ActionButton>
                <ActionButton
                  onClick={() => openOperation(selectedAccount, "income")}
                  icon={ArrowDownLeft}
                >
                  Пополнить
                </ActionButton>
                <ActionButton
                  onClick={() => openOperation(selectedAccount, "expense")}
                  icon={ArrowUpRight}
                >
                  Снять
                </ActionButton>
                <ActionButton
                  onClick={() => openSettings(selectedAccount)}
                  icon={Settings}
                >
                  Настройки
                </ActionButton>
                <ActionButton
                  onClick={() => openSettings(selectedAccount)}
                  icon={Edit3}
                >
                  Переименовать
                </ActionButton>
                <ActionButton
                  destructive
                  onClick={() =>
                    setConfirm({ type: "delete", id: selectedAccount.id })
                  }
                  icon={Trash2}
                >
                  Удалить
                </ActionButton>
              </section>

              <section className="space-y-3">
                <div>
                  <p className="ds-section-title text-zinc-950 dark:text-zinc-50">
                    Последние операции
                  </p>
                  <p className="ds-caption mt-1 text-zinc-500">
                    Недавние движения по счету
                  </p>
                </div>
                {selectedTransactions.length === 0 ? (
                  <EmptyState
                    icon={WalletCards}
                    title="Пока пусто"
                    description="У этого счета еще нет операций."
                  />
                ) : (
                  <div className="space-y-2">
                    {selectedTransactions.slice(0, 5).map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between rounded-[1.55rem] bg-zinc-50 px-4 py-3 shadow-[0_10px_24px_rgba(24,24,27,0.05)] dark:bg-zinc-900"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-zinc-950 dark:text-zinc-50">
                            {transaction.description || "Операция"}
                          </p>
                          <p className="ds-caption text-zinc-500">
                            {formatDate(transaction.date)}
                          </p>
                        </div>
                        <p className="shrink-0 text-[14px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                          {signedAmount(transaction, selectedAccount.id)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )
        )}
      </Modal>

      <AccountSettingsSheet
        open={
          settingsOpen && Boolean(settingsAccount) && Boolean(settingsDraft)
        }
        account={settingsAccount}
        draft={settingsDraft}
        transactions={transactions}
        saving={settingsSaving}
        error={settingsError}
        onChange={(next) => setSettingsDraft(next)}
        onClose={() => {
          setSettingsOpen(false);
          setSettingsAccount(null);
          setSettingsDraft(null);
          setSettingsError(null);
          setSettingsSaving(false);
        }}
        onSave={async () => {
          if (!settingsAccount || !settingsDraft) return;
          const name = settingsDraft.name.trim();
          if (!name) {
            setSettingsError("Введите название счета");
            return;
          }
          if (!Number.isFinite(settingsDraft.balance)) {
            setSettingsError("Укажите корректный баланс");
            return;
          }

          setSettingsSaving(true);
          try {
            const impact =
              settingsAccount.balance - settingsAccount.startingBalance;
            const startingBalance = settingsDraft.balance - impact;
            await updateAccount({
              ...settingsAccount,
              name,
              type: settingsDraft.type,
              currency: settingsDraft.currency,
              icon: settingsDraft.icon,
              color: settingsDraft.color,
              includeInTotalBalance: settingsDraft.includeInTotalBalance,
              startingBalance,
            });
            void tapHaptic("success");
            notify("Счет обновлен");
            setSettingsOpen(false);
            setSettingsAccount(null);
            setSettingsDraft(null);
            setSettingsError(null);
          } finally {
            setSettingsSaving(false);
          }
        }}
        onArchive={async () => {
          if (!settingsAccount) return;
          await archiveAccount(settingsAccount.id);
          void tapHaptic("selection");
          notify("Счет архивирован");
          setSettingsOpen(false);
          setSettingsAccount(null);
          setSettingsDraft(null);
        }}
        onDelete={() => {
          if (!settingsAccount) return;
          setConfirm({ type: "delete", id: settingsAccount.id });
          setSettingsOpen(false);
        }}
        onIncome={() => {
          if (settingsAccount) openOperation(settingsAccount, "income");
        }}
        onExpense={() => {
          if (settingsAccount) openOperation(settingsAccount, "expense");
        }}
        onTransfer={() => {
          if (settingsAccount) openTransfer(settingsAccount);
        }}
      />

      <CreateAccountModal
        createOpen={createOpen}
        onCreateClose={() => setCreateOpen(false)}
        draft={draft}
        setDraft={setDraft}
        addAccount={addAccount}
        notify={notify}
        accounts={accounts}
        baseCurrency={settings.baseCurrency}
        onOpenExisting={(account) => openDetails(account)}
      />

      <Modal
        open={transferOpen}
        title="Перевод"
        description={transferAccount ? transferAccount.name : undefined}
        onClose={() => {
          setTransferOpen(false);
          setTransferAccount(null);
        }}
      >
        {transferAccount && (
          <TransactionForm
            accounts={accounts}
            categories={categories}
            settings={{
              monthlyBudget: 0,
              currency: transferAccount.currency,
              baseCurrency: settings.baseCurrency,
              theme: "light",
              workspaceName: "",
              defaultPaymentMethod: "Перевод",
              hasSeenOnboarding: true,
              dashboardWidgetOrder: settings.dashboardWidgetOrder,
            }}
            initial={{
              id: "draft",
              type: "transfer",
              date: new Date().toISOString().slice(0, 10),
              amount: 0,
              categoryId: getTransferCategoryId(categories),
              accountId: transferAccount.id,
              toAccountId:
                activeAccounts.find(
                  (account) => account.id !== transferAccount.id
                )?.id ?? "",
              description: "",
              paymentMethod: "Перевод",
              currency: transferAccount.currency,
              userId: "u-1",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }}
            submitLabel="Создать перевод"
            onSubmit={async (transaction) => {
              await addTransaction({
                ...transaction,
                type: "transfer",
                categoryId: getTransferCategoryId(categories),
              });
              void tapHaptic("success");
              notify("Перевод создан");
              setTransferOpen(false);
              setTransferAccount(null);
            }}
          />
        )}
      </Modal>

      <Modal
        open={operationOpen}
        title={operationMode === "income" ? "Пополнение" : "Списание"}
        description={operationAccount ? operationAccount.name : undefined}
        onClose={() => {
          setOperationOpen(false);
          setOperationAccount(null);
        }}
      >
        {operationAccount && (
          <TransactionForm
            accounts={accounts}
            categories={categories}
            settings={{
              monthlyBudget: 0,
              currency: operationAccount.currency,
              baseCurrency: settings.baseCurrency,
              theme: "light",
              workspaceName: "",
              defaultPaymentMethod: "Операция",
              hasSeenOnboarding: true,
              dashboardWidgetOrder: settings.dashboardWidgetOrder,
            }}
            initial={{
              id: "draft",
              type: operationMode,
              date: new Date().toISOString().slice(0, 10),
              amount: 0,
              categoryId:
                operationMode === "income"
                  ? getDefaultCategoryId(categories, "income")
                  : getDefaultCategoryId(categories, "expense"),
              accountId: operationAccount.id,
              description: "",
              paymentMethod:
                operationMode === "income" ? "Пополнение" : "Снятие",
              currency: operationAccount.currency,
              userId: "u-1",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }}
            submitLabel={operationMode === "income" ? "Пополнить" : "Списать"}
            onSubmit={async (transaction) => {
              await addTransaction(transaction);
              void tapHaptic("success");
              notify(
                operationMode === "income"
                  ? "Счет пополнен"
                  : "Средства списаны"
              );
              setOperationOpen(false);
              setOperationAccount(null);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.type === "archive" ? "Архивировать счет?" : "Удалить счет?"
        }
        description={
          confirm?.type === "archive"
            ? "Счет будет скрыт из новых операций, но история сохранится."
            : "Операции будут перенесены на доступный счет или удалены, если других счетов нет."
        }
        confirmLabel={confirm?.type === "archive" ? "Архивировать" : "Удалить"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          void (
            confirm.type === "archive"
              ? archiveAccount(confirm.id)
              : deleteAccount(confirm.id)
          ).then(() => {
            void tapHaptic(
              confirm.type === "archive" ? "selection" : "warning"
            );
            notify(
              confirm.type === "archive" ? "Счет архивирован" : "Счет удален"
            );
          });
        }}
      />
    </>
  );
}

function CreateAccountModal({
  createOpen,
  onCreateClose,
  draft,
  setDraft,
  addAccount,
  notify,
  accounts,
  baseCurrency,
  onOpenExisting,
}: {
  createOpen: boolean;
  onCreateClose: () => void;
  draft: AccountDraft;
  setDraft: (draft: AccountDraft) => void;
  addAccount: (
    account: Omit<Account, "id" | "createdAt" | "updatedAt">
  ) => Promise<unknown>;
  notify: (message: string) => void;
  accounts: AccountBalance[];
  baseCurrency: Account["currency"];
  onOpenExisting: (account: AccountBalance) => void;
}) {
  return (
    <Modal
      open={createOpen}
      title="Новый счет"
      description="Создайте карту, наличные или накопления."
      onClose={onCreateClose}
    >
      <AccountForm
        draft={draft}
        onChange={setDraft}
        onSubmit={async () => {
          if (!draft.name.trim()) return;
          const existing = accounts.find(
            (account) =>
              account.type === "crypto_portfolio" && !account.archived
          );
          if (draft.type === "crypto_portfolio" && existing) {
            notify("У вас уже есть активный криптопортфель");
            onCreateClose();
            onOpenExisting(existing);
            return;
          }
          const value =
            draft.type === "crypto_portfolio"
              ? {
                  ...draft,
                  name: draft.name.trim() || "Криптопортфель",
                  balance: 0,
                  startingBalance: 0,
                  currency: baseCurrency,
                  icon: "Bitcoin",
                }
              : { ...draft, name: draft.name.trim() };
          await addAccount(value);
          void tapHaptic("success");
          notify("Счет создан");
          onCreateClose();
        }}
      />
    </Modal>
  );
}

function AccountSettingsSheet({
  open,
  account,
  draft,
  transactions,
  saving,
  error,
  onChange,
  onClose,
  onSave,
  onArchive,
  onDelete,
  onIncome,
  onExpense,
  onTransfer,
}: {
  open: boolean;
  account: AccountBalance | null;
  draft: AccountSettingsDraft | null;
  transactions: Transaction[];
  saving: boolean;
  error: string | null;
  onChange: (draft: AccountSettingsDraft) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => void;
  onIncome: () => void;
  onExpense: () => void;
  onTransfer: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!open || !account || !draft) return null;

  const iconOptions = accountIconNames;
  const colorOptions = [
    "#525252",
    "#64748b",
    "#7c7c80",
    "#8b5cf6",
    "#4b5563",
    "#71717a",
    "#9ca3af",
    "#6b7280",
  ];
  const monthlyDelta = account.monthlyIncome - account.monthlyExpense;
  const recentTransactions = [...transactions]
    .filter(
      (transaction) =>
        transaction.accountId === account.id ||
        transaction.toAccountId === account.id
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const latestTransaction = recentTransactions[0] ?? null;

  return (
    <Modal
      open={open}
      hideHeader
      title="Настройки счета"
      description={account.name}
      onClose={onClose}
      className="sm:max-w-[620px] sm:rounded-[2.1rem] sm:p-0"
    >
      <div className="flex max-h-[92dvh] min-h-[85dvh] flex-col overflow-hidden rounded-t-[2.15rem] bg-[#f4f4f6] sm:max-h-[88vh] sm:rounded-[2rem]">
        <div className="sticky top-0 z-20 border-b border-black/5 bg-[#f4f4f6]/96 px-5 pb-4 pt-3 backdrop-blur-xl sm:px-6">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-black/10 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/80 text-[18px] text-zinc-700 shadow-[0_10px_28px_rgba(24,24,27,0.06)] transition-transform duration-200 active:scale-95"
              aria-label="Назад"
              onClick={onClose}
            >
              ←
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[13px] text-zinc-500">Настройки счета</p>
              <h2 className="mt-1 truncate text-[28px] font-medium tracking-tight text-zinc-950 sm:text-[32px]">
                {account.name}
              </h2>
              <p className="mt-1 text-[14px] text-zinc-500">
                {accountTypeLabels[account.type]}
              </p>
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full bg-white/80 text-[18px] text-zinc-700 shadow-[0_10px_28px_rgba(24,24,27,0.06)] transition-transform duration-200 active:scale-95"
                aria-label="Дополнительно"
                onClick={() => setMenuOpen((value) => !value)}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-[3.25rem] z-30 w-48 overflow-hidden rounded-[1.35rem] border border-black/5 bg-white p-2 shadow-[0_24px_60px_rgba(24,24,27,0.14)]">
                  <button
                    type="button"
                    className="flex h-11 w-full items-center justify-between rounded-[1rem] px-3 text-[14px] text-zinc-700 transition-colors hover:bg-zinc-50"
                    onClick={() => {
                      setMenuOpen(false);
                      void onArchive();
                    }}
                  >
                    <span>Архивировать</span>
                    <span className="text-zinc-400">↗</span>
                  </button>
                  <button
                    type="button"
                    className="flex h-11 w-full items-center justify-between rounded-[1rem] px-3 text-[14px] text-rose-600 transition-colors hover:bg-rose-50"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    <span>Удалить счет</span>
                    <span className="text-rose-300">×</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
            <section className="overflow-hidden rounded-[2.35rem] border border-black/5 bg-white p-6 shadow-[0_22px_54px_rgba(24,24,27,0.07)] sm:p-7">
              <div className="flex items-start justify-between gap-5">
                <div className="flex min-w-0 items-center gap-4">
                  <div
                    className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[1.8rem]"
                    style={{
                      backgroundColor: `${draft.color}18`,
                      color: draft.color,
                    }}
                  >
                    <AccountIcon
                      account={{ icon: draft.icon }}
                      className="h-10 w-10"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] text-zinc-500">
                      {accountTypeLabels[draft.type]}
                    </p>
                    <p className="mt-1 truncate text-[24px] font-medium tracking-tight text-zinc-950 sm:text-[26px]">
                      {draft.name || "Название счета"}
                    </p>
                    <p className="mt-2 text-[13px] text-zinc-500">
                      Баланс обновляется после сохранения изменений.
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-zinc-500">Баланс</p>
                  <p className="mt-1 text-[36px] font-medium tracking-tight text-zinc-950 sm:text-[42px]">
                    {formatMoney(draft.balance, draft.currency)}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 rounded-[1.7rem] bg-zinc-50/80 p-4 sm:grid-cols-3">
                <StatPill
                  label="За 30 дней"
                  value={formatMoney(monthlyDelta, draft.currency)}
                  tone={monthlyDelta >= 0 ? "positive" : "negative"}
                />
                <StatPill
                  label="Текущий баланс"
                  value={formatMoney(account.balance, account.currency)}
                />
                <StatPill
                  label="Последняя операция"
                  value={
                    latestTransaction
                      ? formatDate(latestTransaction.date)
                      : "Нет операций"
                  }
                />
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <p className="text-[20px] font-medium tracking-tight text-zinc-950">
                  Быстрые действия
                </p>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Операции по этому счету.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <QuickActionPill
                  icon={ArrowUpRight}
                  label="Доход"
                  onClick={onIncome}
                />
                <QuickActionPill
                  icon={ArrowDownLeft}
                  label="Расход"
                  onClick={onExpense}
                />
                <QuickActionPill
                  icon={ArrowRightLeft}
                  label="Перевод"
                  onClick={onTransfer}
                />
              </div>
            </section>

            <section className="overflow-hidden rounded-[2.35rem] border border-black/5 bg-white shadow-[0_22px_54px_rgba(24,24,27,0.07)]">
              <div className="border-b border-black/5 px-5 py-5 sm:px-6">
                <p className="text-[20px] font-medium tracking-tight text-zinc-950">
                  Настройки
                </p>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Сначала смотрите сводку, затем меняйте параметры счета.
                </p>
              </div>

              <div className="space-y-5 px-5 py-5 sm:px-6">
                <SettingField label="Название счета">
                  <TextInput
                    value={draft.name}
                    placeholder="Основная карта"
                    onChange={(value) => onChange({ ...draft, name: value })}
                  />
                </SettingField>

                <div className="grid gap-4 sm:grid-cols-2">
                  <SettingField label="Тип счета">
                    <SelectInput
                      value={draft.type}
                      onChange={(value) =>
                        onChange({ ...draft, type: value as Account["type"] })
                      }
                    >
                      {Object.entries(accountTypeLabels)
                        .filter(([value]) => value !== "crypto_portfolio")
                        .map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                    </SelectInput>
                  </SettingField>
                  <SettingField label="Валюта">
                    <SelectInput
                      value={draft.currency}
                      onChange={(value) =>
                        onChange({
                          ...draft,
                          currency: value as Account["currency"],
                        })
                      }
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="UAH">UAH</option>
                    </SelectInput>
                  </SettingField>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <SettingField label="Иконка">
                    <div className="flex flex-wrap gap-2">
                      {iconOptions.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          className={cn(
                            "flex h-12 items-center gap-2 rounded-full border px-3 text-[14px] transition-[transform,border-color,background-color,box-shadow] duration-200 active:scale-95",
                            draft.icon === icon
                              ? "border-zinc-950 bg-zinc-950 text-white shadow-[0_14px_30px_rgba(24,24,27,0.16)]"
                              : "border-black/5 bg-[#f5f5f7] text-zinc-700 shadow-[0_8px_18px_rgba(24,24,27,0.04)]"
                          )}
                          onClick={() => onChange({ ...draft, icon })}
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/70 text-[15px]">
                            {iconEmoji(icon)}
                          </span>
                          <span className="whitespace-nowrap">
                            {accountIconLabels[icon]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </SettingField>
                  <SettingField label="Цвет">
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={cn(
                            "h-11 w-11 rounded-full border transition-[transform,border-color,box-shadow] duration-200 active:scale-95",
                            draft.color === color
                              ? "border-zinc-950 ring-4 ring-zinc-950/10"
                              : "border-black/5"
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() => onChange({ ...draft, color })}
                          aria-label={`Выбрать цвет ${color}`}
                        />
                      ))}
                    </div>
                  </SettingField>
                </div>

                <div className="grid gap-4 rounded-[1.8rem] bg-[#f5f5f7] p-4 sm:grid-cols-3">
                  <StatPill
                    label="Доходы"
                    value={formatMoney(account.monthlyIncome, draft.currency)}
                  />
                  <StatPill
                    label="Расходы"
                    value={formatMoney(account.monthlyExpense, draft.currency)}
                  />
                  <StatPill
                    label="Последняя операция"
                    value={
                      latestTransaction
                        ? formatDate(latestTransaction.date)
                        : "Нет операций"
                    }
                  />
                </div>

                <div className="rounded-[1.8rem] bg-[#f5f5f7] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[15px] font-medium text-zinc-950">
                        Скрыть счет из общего баланса
                      </p>
                      <p className="mt-1 text-[13px] text-zinc-500">
                        Счет останется в приложении, но не попадет в общий итог.
                      </p>
                    </div>
                    <Switch.Root
                      checked={draft.includeInTotalBalance}
                      onCheckedChange={(checked) =>
                        onChange({ ...draft, includeInTotalBalance: checked })
                      }
                      className="relative h-7 w-12 shrink-0 rounded-full bg-zinc-200 transition data-[state=checked]:bg-zinc-950"
                    >
                      <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white shadow-[0_6px_16px_rgba(24,24,27,0.14)] transition-transform duration-200 data-[state=checked]:translate-x-[22px]" />
                    </Switch.Root>
                  </div>
                </div>

                <div className="space-y-3 border-t border-black/5 pt-5">
                  <p className="text-[20px] font-medium tracking-tight text-zinc-950">
                    Опасная зона
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      variant="secondary"
                      className="h-12 justify-between rounded-[1.25rem] bg-[#f5f5f7] shadow-none"
                      onClick={() => void onArchive()}
                    >
                      <span>Архивировать</span>
                      <span className="text-zinc-400">↗</span>
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-12 justify-between rounded-[1.25rem] border-rose-200/70 bg-[#fff7f7] text-rose-600 shadow-none hover:bg-rose-500/5 hover:text-rose-600 dark:border-rose-900/40 dark:text-rose-300"
                      onClick={onDelete}
                    >
                      <span>Удалить счет</span>
                      <span className="text-rose-300">×</span>
                    </Button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-[1.35rem] bg-rose-50 px-4 py-3 text-[14px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                    {error}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-black/5 bg-[#f4f4f6]/96 px-5 pt-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <Button
              variant="secondary"
              className="h-[54px] flex-1 rounded-[1.3rem] bg-white/80 shadow-none"
              onClick={onClose}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button
              className="h-[54px] flex-[1.4] rounded-[1.3rem] bg-zinc-950 text-white shadow-[0_16px_34px_rgba(24,24,27,0.16)] hover:bg-zinc-800 dark:bg-white dark:text-zinc-950"
              onClick={() => void onSave()}
              disabled={
                saving || !draft.name.trim() || !Number.isFinite(draft.balance)
              }
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SettingField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[14px] font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  className,
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-[56px] w-full rounded-[1.35rem] border border-black/5 bg-[#f5f5f7] px-4 text-[16px] text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-950/5",
        className
      )}
    />
  );
}

function SelectInput({
  className,
  value,
  onChange,
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-[56px] w-full rounded-[1.35rem] border border-black/5 bg-[#f5f5f7] px-4 text-[16px] text-zinc-950 outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-950/5",
        className
      )}
    >
      {children}
    </select>
  );
}

function QuickActionPill({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ArrowRightLeft;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 items-center justify-center gap-2 rounded-full border border-black/5 bg-white px-4 text-[15px] text-zinc-700 shadow-[0_10px_26px_rgba(24,24,27,0.04)] transition-transform duration-200 active:scale-95"
    >
      <Icon className="h-4.5 w-4.5" />
      <span>{label}</span>
    </button>
  );
}

function StatPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
      ? "text-rose-500"
      : "text-zinc-950";

  return (
    <div className="rounded-[1.45rem] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(24,24,27,0.04)]">
      <p className="text-[12px] text-zinc-500">{label}</p>
      <p
        className={cn("mt-1 text-[14px] font-medium tracking-tight", toneClass)}
      >
        {value}
      </p>
    </div>
  );
}

function iconEmoji(icon: string) {
  switch (icon) {
    case "CreditCard":
      return "💳";
    case "Wallet":
      return "👛";
    case "PiggyBank":
      return "🐖";
    case "Bitcoin":
      return "₿";
    case "Banknote":
      return "💵";
    case "Landmark":
      return "🏦";
    case "WalletCards":
      return "🪪";
    default:
      return "●";
  }
}

function ActionButton({
  children,
  icon: Icon,
  destructive,
  ...props
}: {
  children: string;
  icon: typeof ArrowRightLeft;
  destructive?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      {...props}
      variant="secondary"
      className={[
        "h-12 justify-start rounded-[1.35rem] px-4 text-[14px] font-medium",
        destructive
          ? "text-rose-600 hover:bg-rose-500/10 hover:text-rose-600"
          : "",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Button>
  );
}

function AccountForm({
  draft,
  onChange,
  onSubmit,
}: {
  draft: AccountDraft;
  onChange: (draft: AccountDraft) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit();
      }}
    >
      <Field label="Название">
        <Input
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="Основная карта"
        />
      </Field>
      <Field label="Тип">
        <Select
          value={draft.type}
          onChange={(event) => {
            const type = event.target.value as Account["type"];
            onChange(
              type === "crypto_portfolio"
                ? {
                    ...draft,
                    type,
                    name: draft.name || "Криптопортфель",
                    balance: 0,
                    startingBalance: 0,
                    icon: "Bitcoin",
                  }
                : { ...draft, type }
            );
          }}
        >
          {Object.entries(accountTypeLabels)
            .filter(([value]) => value !== "crypto_portfolio")
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </Select>
      </Field>
      {draft.type !== "crypto_portfolio" && (
        <>
          <Field label="Стартовый баланс">
            <Input
              type="number"
              value={draft.startingBalance}
              onChange={(event) =>
                onChange({
                  ...draft,
                  startingBalance: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Валюта">
            <Select
              value={draft.currency}
              onChange={(event) =>
                onChange({
                  ...draft,
                  currency: event.target.value as Account["currency"],
                })
              }
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="UAH">UAH</option>
            </Select>
          </Field>
          <Field label="Иконка">
            <Select
              value={draft.icon}
              onChange={(event) =>
                onChange({ ...draft, icon: event.target.value })
              }
            >
              {accountIconNames.map((icon) => (
                <option key={icon} value={icon}>
                  {accountIconLabels[icon]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Цвет">
            <Input
              type="color"
              className="p-1"
              value={draft.color}
              onChange={(event) =>
                onChange({ ...draft, color: event.target.value })
              }
            />
          </Field>
        </>
      )}
      {draft.type === "crypto_portfolio" && (
        <p className="sm:col-span-2 text-sm text-zinc-500">
          Баланс рассчитывается автоматически по актуальным котировкам
          CoinGecko. Биржа, кошелёк и ручной баланс не требуются.
        </p>
      )}
      {draft.type === "crypto_portfolio" && (
        <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-zinc-50 p-4">
          <div>
            <p className="text-sm font-medium">Учитывать в общем капитале</p>
            <p className="text-xs text-zinc-500">
              Текущая стоимость holdings попадёт в общий баланс.
            </p>
          </div>
          <Switch.Root
            checked={draft.includeInTotalBalance}
            onCheckedChange={(checked) =>
              onChange({ ...draft, includeInTotalBalance: checked })
            }
            className="relative h-7 w-12 rounded-full bg-zinc-200 data-[state=checked]:bg-zinc-950"
          >
            <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
          </Switch.Root>
        </div>
      )}
      <div className="sm:col-span-2">
        <Button type="submit">
          {draft.name ? "Сохранить" : "Создать счет"}
        </Button>
      </div>
    </form>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] bg-zinc-50 px-3 py-3 text-left dark:bg-zinc-900">
      <p className="ds-caption font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

function AnimatedNumber({
  value,
  currency,
  className,
}: {
  value: number;
  currency: Account["currency"];
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const valueRef = useRef(value);

  useEffect(() => {
    const start = valueRef.current;
    const duration = 420;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const next = start + (value - start) * eased;
      valueRef.current = next;
      setDisplayValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className={className}>{formatMoney(displayValue, currency)}</span>
  );
}

function buildTrend(accounts: AccountBalance[], transactions: Transaction[]) {
  const current = accounts.reduce((sum, account) => sum + account.balance, 0);
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(
    lastMonth.getMonth() + 1
  ).padStart(2, "0")}`;

  const delta = transactions.reduce((sum, transaction) => {
    const date = new Date(transaction.date);
    if (Number.isNaN(date.getTime())) return sum;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    if (key !== thisMonthKey && key !== lastMonthKey) return sum;
    if (transaction.type === "income")
      return key === thisMonthKey
        ? sum + transaction.amount
        : sum - transaction.amount;
    if (transaction.type === "expense")
      return key === thisMonthKey
        ? sum - transaction.amount
        : sum + transaction.amount;
    return sum;
  }, 0);

  return { current, delta };
}

function buildPortfolioHistory(
  accounts: AccountBalance[],
  transactions: Transaction[]
) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}`,
      label: new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(date),
    };
  });

  return months.map((month) => ({
    label: month.label,
    balance: accounts.reduce((portfolio, account) => {
      const accountBalance =
        account.startingBalance +
        transactions.reduce((sum, transaction) => {
          const transactionDate = new Date(transaction.date);
          if (Number.isNaN(transactionDate.getTime())) return sum;
          const key = `${transactionDate.getFullYear()}-${String(
            transactionDate.getMonth() + 1
          ).padStart(2, "0")}`;
          if (key > month.key) return sum;
          if (transaction.accountId === account.id) {
            if (transaction.type === "expense") return sum - transaction.amount;
            if (transaction.type === "income") return sum + transaction.amount;
            if (transaction.type === "transfer")
              return sum - transaction.amount;
          }
          if (
            transaction.toAccountId === account.id &&
            transaction.type === "transfer"
          ) {
            return sum + transaction.amount;
          }
          return sum;
        }, 0);
      return portfolio + accountBalance;
    }, 0),
  }));
}

function buildAccountHistory(
  account: AccountBalance,
  transactions: Transaction[]
) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}`,
      label: new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(date),
    };
  });

  return months.map((month) => ({
    label: month.label,
    balance:
      account.startingBalance +
      transactions.reduce((sum, transaction) => {
        const transactionDate = new Date(transaction.date);
        if (Number.isNaN(transactionDate.getTime())) return sum;
        const key = `${transactionDate.getFullYear()}-${String(
          transactionDate.getMonth() + 1
        ).padStart(2, "0")}`;
        if (key > month.key) return sum;
        if (transaction.accountId === account.id) {
          if (transaction.type === "expense") return sum - transaction.amount;
          if (transaction.type === "income") return sum + transaction.amount;
          if (transaction.type === "transfer") return sum - transaction.amount;
        }
        if (
          transaction.toAccountId === account.id &&
          transaction.type === "transfer"
        ) {
          return sum + transaction.amount;
        }
        return sum;
      }, 0),
  }));
}

function sumTransfers(transactions: Transaction[], accountId: string) {
  return transactions.reduce((sum, transaction) => {
    if (transaction.type !== "transfer") return sum;
    if (
      transaction.accountId === accountId ||
      transaction.toAccountId === accountId
    )
      return sum + transaction.amount;
    return sum;
  }, 0);
}

function signedAmount(transaction: Transaction, accountId: string) {
  if (transaction.type === "transfer") {
    if (transaction.accountId === accountId)
      return `-${formatMoney(transaction.amount, transaction.currency)}`;
    if (transaction.toAccountId === accountId)
      return `+${formatMoney(transaction.amount, transaction.currency)}`;
  }
  return `${transaction.type === "expense" ? "-" : "+"}${formatMoney(
    transaction.amount,
    transaction.currency
  )}`;
}

function accountPriority(account: Pick<AccountBalance, "type">) {
  switch (account.type) {
    case "savings":
      return 0;
    case "bank_card":
      return 1;
    case "crypto_portfolio":
      return 2;
    case "crypto":
      return 3;
    case "cash":
      return 4;
    case "credit_card":
      return 5;
    default:
      return 6;
  }
}

function accountCardTypeLabel(type: AccountBalance["type"]) {
  switch (type) {
    case "bank_card":
      return "Банковская";
    case "credit_card":
      return "Кредитная";
    case "savings":
      return "Накопления";
    case "cash":
      return "Наличные";
    case "crypto":
      return "Крипто";
    default:
      return "Другое";
  }
}

function buildAssetStructure(accounts: AccountBalance[]) {
  const total = accounts.reduce(
    (sum, account) => sum + Math.max(account.balance, 0),
    0
  );
  const fallbackShare = accounts.length > 0 ? 100 / accounts.length : 0;

  return accounts.map((account) => {
    const basis =
      total > 0
        ? Math.max(account.balance, 0) / total
        : 1 / Math.max(accounts.length, 1);
    const percent = Math.max(
      1,
      Math.round(total > 0 ? basis * 100 : fallbackShare)
    );
    return {
      id: account.id,
      name: account.name,
      typeLabel: accountTypeLabels[account.type],
      value: account.balance,
      currency: account.currency,
      baseCurrency: account.currency,
      percent,
      color: account.color,
    };
  });
}
