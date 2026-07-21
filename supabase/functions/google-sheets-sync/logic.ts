import {
  decodeTransactionNote,
  type SupportedCurrency,
} from "../_shared/transactionCodec.ts";

export const MANAGED_SHEETS = [
  "Обзор",
  "Операции",
  "Счета",
  "Категории",
] as const;
export const SYNC_TIMEOUT_MS = 10 * 60 * 1000;

export type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  balance: number | string | null;
  currency: string | null;
  icon: string | null;
  is_archived: boolean | null;
  include_in_total: boolean | null;
  created_at: string;
  updated_at: string;
};
export type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
};
export type TransactionRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  type: string;
  amount: number | string;
  title: string;
  note: string | null;
  date: string;
  created_at: string;
  updated_at: string;
  currency?: string | null;
  base_currency?: string | null;
  exchange_rate?: number | string | null;
  converted_amount?: number | string | null;
  exchange_rate_date?: string | null;
  exchange_rate_source?: string | null;
};
export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};
export type BudgetRow = { month: string; limit_amount: number | string };
export type FinanceData = {
  profile: ProfileRow | null;
  accounts: AccountRow[];
  categories: CategoryRow[];
  transactions: TransactionRow[];
  budgets: BudgetRow[];
  settings: Record<string, unknown>;
};

export type NormalizedTransaction = {
  id: string;
  date: string;
  time: string;
  type: "Доход" | "Расход" | "Перевод" | "Повреждено";
  account: string;
  destinationAccount: string;
  category: string;
  amount: number;
  currency: string;
  baseAmount: number | null;
  baseCurrency: string;
  exchangeRate: number | null;
  exchangeRateDate: string;
  exchangeRateSource: string;
  description: string;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
};

const safeNumber = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const currency = (value: unknown): SupportedCurrency =>
  ["USD", "EUR", "UAH"].includes(String(value).toUpperCase())
    ? (String(value).toUpperCase() as SupportedCurrency)
    : "USD";
const typeLabel = (value: string): NormalizedTransaction["type"] =>
  value === "income"
    ? "Доход"
    : value === "expense"
    ? "Расход"
    : value === "transfer"
    ? "Перевод"
    : "Повреждено";

export function isFreshSync(
  syncStatus: string | null,
  syncStartedAt: string | null,
  now = Date.now()
) {
  if (syncStatus !== "syncing" || !syncStartedAt) return false;
  const started = Date.parse(syncStartedAt);
  return Number.isFinite(started) && now - started < SYNC_TIMEOUT_MS;
}

export function normalizeTransactions(
  data: FinanceData
): NormalizedTransaction[] {
  const accounts = new Map(data.accounts.map((row) => [row.id, row]));
  const categories = new Map(data.categories.map((row) => [row.id, row]));
  return [...data.transactions]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)
    )
    .map((row) => {
      try {
        const account = row.account_id
          ? accounts.get(row.account_id)
          : undefined;
        const note = decodeTransactionNote(
          row.note,
          currency(account?.currency)
        );
        const originalCurrency = currency(row.currency ?? note.currency);
        const baseCurrency = currency(
          row.base_currency ??
            data.settings.baseCurrency ??
            data.settings.currency
        );
        const converted =
          row.converted_amount == null
            ? originalCurrency === baseCurrency
              ? safeNumber(row.amount)
              : null
            : safeNumber(row.converted_amount);
        const date = new Date(row.date);
        return {
          id: row.id || "—",
          date: Number.isNaN(date.valueOf())
            ? ""
            : date.toISOString().slice(0, 10),
          time: Number.isNaN(date.valueOf())
            ? ""
            : date.toISOString().slice(11, 16),
          type: typeLabel(row.type),
          account: account?.name ?? "Удалённый счёт",
          destinationAccount:
            row.type === "transfer"
              ? row.to_account_id
                ? accounts.get(row.to_account_id)?.name ?? "Удалённый счёт"
                : "Не указан"
              : "",
          category:
            row.type === "transfer"
              ? ""
              : row.category_id
              ? categories.get(row.category_id)?.name ?? "Удалённая категория"
              : "Без категории",
          amount: safeNumber(row.amount),
          currency: originalCurrency,
          baseAmount: converted,
          baseCurrency,
          exchangeRate:
            row.exchange_rate == null
              ? originalCurrency === baseCurrency
                ? 1
                : null
              : safeNumber(row.exchange_rate),
          exchangeRateDate: row.exchange_rate_date ?? "",
          exchangeRateSource:
            row.exchange_rate_source ??
            (originalCurrency === baseCurrency ? "identity" : ""),
          description: String(row.title ?? ""),
          paymentMethod: note.paymentMethod,
          createdAt: row.created_at || "",
          updatedAt: row.updated_at || "",
        };
      } catch {
        return {
          id: row.id || "—",
          date: "",
          time: "",
          type: "Повреждено",
          account: "Неизвестно",
          destinationAccount: "",
          category: "",
          amount: safeNumber(row.amount),
          currency: "USD",
          baseAmount: null,
          baseCurrency: currency(
            data.settings.baseCurrency ?? data.settings.currency
          ),
          exchangeRate: null,
          exchangeRateDate: "",
          exchangeRateSource: "",
          description: String(row.title ?? "Повреждённая операция"),
          paymentMethod: "",
          createdAt: row.created_at || "",
          updatedAt: row.updated_at || "",
        };
      }
    });
}

export function groupMoney(items: Array<{ currency: string; amount: number }>) {
  const result: Record<string, number> = {};
  for (const item of items) {
    result[item.currency] = (result[item.currency] ?? 0) + item.amount;
  }
  return result;
}

export function moneySummary(values: Record<string, number>) {
  const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
  const formatter = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return entries.length
    ? entries
        .map(([code, amount]) => `${formatter.format(amount)}  ${code}`)
        .join("\n")
    : "—";
}

export function buildSheetValues(data: FinanceData, syncedAt: string) {
  const transactions = normalizeTransactions(data);
  const accounts = [...data.accounts].sort(
    (a, b) =>
      Number(Boolean(a.is_archived)) - Number(Boolean(b.is_archived)) ||
      a.created_at.localeCompare(b.created_at) ||
      a.name.localeCompare(b.name, "ru")
  );
  const categories = [...data.categories].sort(
    (a, b) =>
      (({ expense: 0, income: 1 }[a.type] ?? 2) -
        ({ expense: 0, income: 1 }[b.type] ?? 2) ||
      a.name.localeCompare(b.name, "ru"))
  );
  const currentMonth = syncedAt.slice(0, 7);
  const income = transactions.filter((t) => t.type === "Доход");
  const expense = transactions.filter((t) => t.type === "Расход");
  const monthIncome = income.filter((t) => t.date.startsWith(currentMonth));
  const monthExpense = expense.filter((t) => t.date.startsWith(currentMonth));
  const primaryCurrency = currency(
    data.settings.baseCurrency ?? data.settings.currency
  );
  const incomeMonth = groupMoney(
    monthIncome
      .filter((t) => t.baseAmount != null)
      .map((t) => ({
        currency: primaryCurrency,
        amount: t.baseAmount!,
      }))
  );
  const expenseMonth = groupMoney(
    monthExpense
      .filter((t) => t.baseAmount != null)
      .map((t) => ({
        currency: primaryCurrency,
        amount: t.baseAmount!,
      }))
  );
  const primaryExpenses = expense.filter((t) => t.baseAmount != null);
  const categoryStats = new Map<
    string,
    { count: number; sums: Record<string, number> }
  >();
  for (const transaction of transactions.filter((t) => t.type !== "Перевод")) {
    const key = transaction.category;
    const stat = categoryStats.get(key) ?? { count: 0, sums: {} };
    stat.count++;
    if (transaction.baseAmount != null) {
      stat.sums[primaryCurrency] =
        (stat.sums[primaryCurrency] ?? 0) + transaction.baseAmount;
    }
    categoryStats.set(key, stat);
  }
  const monthly = new Map<
    string,
    { month: string; currency: string; income: number; expense: number }
  >();
  for (const transaction of transactions.filter(
    (item) => item.type !== "Перевод"
  )) {
    if (transaction.baseAmount == null) continue;
    const key = `${transaction.date.slice(0, 7)}::${primaryCurrency}`;
    const value = monthly.get(key) ?? {
      month: transaction.date.slice(0, 7),
      currency: primaryCurrency,
      income: 0,
      expense: 0,
    };
    if (transaction.type === "Доход") value.income += transaction.baseAmount;
    else value.expense += transaction.baseAmount;
    monthly.set(key, value);
  }
  const monthlyRows = [...monthly.values()].sort(
    (a, b) =>
      a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency)
  );
  const periodRows: unknown[][] = [];
  for (const code of [primaryCurrency]) {
    // Current account valuation uses today's NBU rate; historical P&L below uses
    // the immutable transaction snapshot. These two modes must not be reused interchangeably.
    const ending = safeNumber(data.settings.currentBalanceBase),
      incomeValue = incomeMonth[code] ?? 0,
      expenseValue = expenseMonth[code] ?? 0;
    const starting = ending - incomeValue + expenseValue;
    periodRows.push(
      ["Остаток на начало периода", starting, code],
      ["Доходы", incomeValue, code],
      ["Расходы", expenseValue, code],
      ["Чистый результат", incomeValue - expenseValue, code],
      ["Остаток на конец периода", ending, code]
    );
  }
  periodRows.push(
    ["Количество операций", monthIncome.length + monthExpense.length, "—"],
    [
      "Средний расход",
      primaryExpenses.length
        ? primaryExpenses.reduce((sum, item) => sum + item.baseAmount!, 0) /
          primaryExpenses.length
        : 0,
      primaryCurrency,
    ],
    [
      "Крупнейшая трата",
      primaryExpenses.length
        ? Math.max(...primaryExpenses.map((item) => item.baseAmount!))
        : 0,
      primaryCurrency,
    ]
  );

  const currentExpenseGroups = new Map<
    string,
    { category: string; currency: string; count: number; amount: number }
  >();
  for (const item of monthExpense) {
    if (item.baseAmount == null) continue;
    const key = `${item.category}::${primaryCurrency}`;
    const value = currentExpenseGroups.get(key) ?? {
      category: item.category,
      currency: primaryCurrency,
      count: 0,
      amount: 0,
    };
    value.count++;
    value.amount += item.baseAmount;
    currentExpenseGroups.set(key, value);
  }
  const expenseGroups = [...currentExpenseGroups.values()].sort(
    (a, b) => b.amount - a.amount
  );
  type MergeSpec = [number, number, number, number];
  const overview: unknown[][] = [
    ["qwadrat Finance Tracker — Финансовый отчёт"],
    [
      `Период: текущий месяц (${currentMonth})`,
      "",
      "",
      "",
      `Синхронизировано: ${syncedAt}`,
    ],
    [
      `Пользователь: ${data.profile?.email ?? "—"}`,
      "",
      "",
      "",
      `Источник: qwadrat Finance Tracker • Основная валюта: ${primaryCurrency}`,
    ],
    [],
    ["ИТОГИ ЗА ПЕРИОД", "", "", "", "ОСТАТКИ ПО СЧЕТАМ"],
    ["Показатель", "Значение", "Валюта", "", "Счёт", "Баланс", "Валюта"],
  ];
  const overviewMerges: MergeSpec[] = [
    [0, 1, 0, 7],
    [1, 2, 0, 3],
    [1, 2, 4, 7],
    [2, 3, 0, 3],
    [2, 3, 4, 7],
    [4, 5, 0, 3],
    [4, 5, 4, 7],
  ];
  const accountReportRows: unknown[][] = accounts.map((item) => [
    item.name,
    safeNumber(item.balance),
    currency(item.currency),
  ]);
  const allAccountTotals = groupMoney(
    accounts.map((item) => ({
      currency: currency(item.currency),
      amount: safeNumber(item.balance),
    }))
  );
  accountReportRows.push(
    ...Object.entries(allAccountTotals).map(([code, amount]) => [
      "Итого",
      amount,
      code,
    ])
  );
  const firstSectionRows = Math.max(
    periodRows.length,
    accountReportRows.length,
    1
  );
  for (let index = 0; index < firstSectionRows; index++) {
    const left = periodRows[index] ?? ["", "", ""];
    const right = accountReportRows[index] ?? ["", "", ""];
    overview.push([...left, "", ...right]);
  }
  overview.push([]);

  const dynamicsSectionRow = overview.length;
  overview.push([
    "ДОХОДЫ И РАСХОДЫ ПО МЕСЯЦАМ",
    "",
    "",
    "",
    "РАСХОДЫ ПО КАТЕГОРИЯМ",
  ]);
  overviewMerges.push(
    [dynamicsSectionRow, dynamicsSectionRow + 1, 0, 3],
    [dynamicsSectionRow, dynamicsSectionRow + 1, 4, 7]
  );
  const dynamicCurrencies = [
    ...new Set([
      ...monthlyRows.map((item) => item.currency),
      ...expenseGroups.map((item) => item.currency),
    ]),
  ].sort();
  if (!dynamicCurrencies.length) {
    overview.push([
      "Месяц",
      "Доходы",
      "Расходы",
      "",
      "Категория",
      "Исходная сумма",
      "Доля",
    ]);
    const emptyRow = overview.length;
    overview.push([
      "Нет данных за выбранный период",
      "",
      "",
      "",
      "Нет данных за выбранный период",
    ]);
    overviewMerges.push(
      [emptyRow, emptyRow + 1, 0, 3],
      [emptyRow, emptyRow + 1, 4, 7]
    );
  } else {
    dynamicCurrencies.forEach((code, currencyIndex) => {
      if (currencyIndex > 0) overview.push([]);
      const currencyRow = overview.length;
      overview.push([code, "", "", "", code]);
      overviewMerges.push(
        [currencyRow, currencyRow + 1, 0, 3],
        [currencyRow, currencyRow + 1, 4, 7]
      );
      overview.push([
        "Месяц",
        "Доходы",
        "Расходы",
        "",
        "Категория",
        "Сумма",
        "Доля",
      ]);
      const left = monthlyRows.filter((item) => item.currency === code);
      const right = expenseGroups.filter((item) => item.currency === code);
      const count = Math.max(left.length, right.length, 1);
      for (let index = 0; index < count; index++) {
        const month = left[index];
        const category = right[index];
        overview.push([
          month?.month ?? "",
          month?.income ?? "",
          month?.expense ?? "",
          "",
          category?.category ?? "",
          category?.amount ?? "",
          category && expenseMonth[code]
            ? category.amount / expenseMonth[code]
            : "",
        ]);
      }
    });
  }
  overview.push([]);
  const latestSectionRow = overview.length;
  overview.push(["ПОСЛЕДНИЕ ОПЕРАЦИИ"]);
  overviewMerges.push([latestSectionRow, latestSectionRow + 1, 0, 7]);
  overview.push([
    "Дата",
    "Тип",
    "Счёт",
    "Категория",
    "Описание",
    "Сумма",
    "Валюта",
  ]);
  if (transactions.length) {
    overview.push(
      ...transactions
        .slice(0, 10)
        .map((item) => [
          item.date,
          item.type,
          item.account,
          item.category || "—",
          item.description,
          item.amount,
          item.currency,
        ])
    );
  } else {
    const emptyRow = overview.length;
    overview.push(["Операций пока нет"]);
    overviewMerges.push([emptyRow, emptyRow + 1, 0, 7]);
  }

  const support: unknown[][] = [
    ["Служебные агрегаты", "Значение", "Валюта"],
    ...periodRows,
  ];
  const operationRows = transactions.length
    ? transactions.map((item) => [
        item.date,
        item.time,
        item.type,
        item.account,
        item.destinationAccount,
        item.category,
        item.description,
        item.amount,
        item.currency,
        item.exchangeRate ?? "—",
        item.baseAmount ?? "—",
        item.baseCurrency,
        item.exchangeRateSource || "—",
        item.exchangeRateDate || "—",
        item.paymentMethod,
        item.id,
        item.createdAt,
        item.updatedAt,
      ])
    : [["Операций пока нет"]];
  const operations: unknown[][] = [
    ["ОПЕРАЦИИ"],
    [
      `Период: текущий месяц (${currentMonth})`,
      "",
      "",
      "",
      "",
      "",
      "",
      `Синхронизировано: ${syncedAt} • Операций: ${transactions.length}`,
    ],
    [],
    [
      "Дата",
      "Время",
      "Тип",
      "Счёт",
      "Счёт назначения",
      "Категория",
      "Описание",
      "Сумма",
      "Исходная валюта",
      "Курс",
      "Базовая сумма",
      "Базовая валюта",
      "Источник курса",
      "Дата курса",
      "Способ оплаты",
      "ID операции",
      "Создано",
      "Обновлено",
    ],
    ...operationRows,
  ];

  const activeAccounts = accounts.filter((item) => !item.is_archived);
  const archivedAccounts = accounts.filter((item) => item.is_archived);
  const accountRows: unknown[][] = [
    ["СЧЕТА"],
    [
      `Синхронизировано: ${syncedAt}`,
      "",
      "",
      "",
      "",
      `Активных: ${activeAccounts.length} • Архивных: ${archivedAccounts.length}`,
    ],
    [],
    [
      "Название",
      "Тип",
      "Баланс",
      "Валюта",
      "Статус",
      "Учитывать в общем балансе",
      "Создан",
      "Обновлён",
      "ID",
    ],
    ...(accounts.length
      ? accounts.map((item) => [
          item.name,
          item.type,
          safeNumber(item.balance),
          currency(item.currency),
          item.is_archived ? "Архивный" : "Активный",
          item.include_in_total === false ? "Нет" : "Да",
          item.created_at,
          item.updated_at,
          item.id,
        ])
      : [["Счета пока не добавлены"]]),
  ];
  accountRows.push([], ["Валюта", "Общий баланс", "Активных счетов"]);
  const accountCurrencies = [
    ...new Set(accounts.map((item) => currency(item.currency))),
  ].sort();
  if (accountCurrencies.length) {
    accountRows.push(
      ...accountCurrencies.map((code) => [
        code,
        accounts
          .filter((item) => currency(item.currency) === code)
          .reduce((sum, item) => sum + safeNumber(item.balance), 0),
        activeAccounts.filter((item) => currency(item.currency) === code)
          .length,
      ])
    );
  } else accountRows.push(["—", 0, 0]);
  const accountHeaderRow = 3;

  const categoryHeader = [
    "Иконка",
    "Название",
    "Тип",
    "Количество операций",
    "Общая сумма",
    "Валюта",
    "Создана",
    "Обновлена",
    "ID",
  ];
  const categoryRows: unknown[][] = [
    ["КАТЕГОРИИ"],
    [`Последняя синхронизация: ${syncedAt}`],
    [],
    categoryHeader,
  ];
  const categoryDividerRows: number[] = [];
  if (!categories.length) {
    categoryRows.push(["Категорий пока нет"]);
  } else {
    for (const [type, label] of [
      ["expense", "РАСХОДЫ"],
      ["income", "ДОХОДЫ"],
    ] as const) {
      const typed = categories.filter((item) => item.type === type);
      if (!typed.length) continue;
      categoryDividerRows.push(categoryRows.length);
      categoryRows.push([label]);
      categoryRows.push(
        ...typed.map((item) => {
          const stat = categoryStats.get(item.name) ?? { count: 0, sums: {} };
          const sums = Object.entries(stat.sums);
          return [
            item.icon ?? "",
            item.name,
            type === "expense" ? "Расход" : "Доход",
            stat.count || "—",
            sums.length === 1 ? sums[0][1] : "—",
            sums.length === 1
              ? sums[0][0]
              : sums.length
              ? "разные валюты"
              : "—",
            item.created_at,
            item.updated_at,
            item.id,
          ];
        })
      );
    }
  }
  return {
    overview,
    support,
    operations,
    accounts: accountRows,
    categories: categoryRows,
    rowsWritten: transactions.length + accounts.length + categories.length,
    primaryCurrency,
    layout: {
      overviewMerges,
      dynamicsSectionRow,
      latestSectionRow,
      accountHeaderRow,
      categoryDividerRows,
      emptyOperations: !transactions.length,
      emptyAccounts: !accounts.length,
      emptyCategories: !categories.length,
    },
  };
}

export function safeSyncResponse(lastSyncedAt: string, rowsWritten: number) {
  return {
    success: true as const,
    data: {
      syncStatus: "success" as const,
      lastSyncedAt,
      rowsWritten,
      sheetsUpdated: [...MANAGED_SHEETS],
    },
  };
}
