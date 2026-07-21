import {
  buildSheetValues,
  type FinanceData,
  isFreshSync,
  normalizeTransactions,
  safeSyncResponse,
} from "./logic.ts";

const data: FinanceData = {
  profile: { id: "u1", email: "user@example.com", display_name: "User" },
  accounts: [{
    id: "a1",
    user_id: "u1",
    name: "Карта",
    type: "bank_card",
    balance: "100",
    currency: "USD",
    icon: "💳",
    is_archived: false,
    include_in_total: true,
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
  }, {
    id: "a2",
    user_id: "u1",
    name: "Архив",
    type: "cash",
    balance: "50",
    currency: "EUR",
    icon: "💶",
    is_archived: true,
    include_in_total: true,
    created_at: "2024-01-01",
    updated_at: "2025-01-01",
  }],
  categories: [{
    id: "c1",
    user_id: "u1",
    name: "Еда",
    type: "expense",
    icon: "🍽️",
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
  }, {
    id: "c2",
    user_id: "u1",
    name: "Зарплата",
    type: "income",
    icon: "💼",
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
  }],
  transactions: [{
    id: "t1",
    user_id: "u1",
    account_id: "a1",
    to_account_id: null,
    category_id: "c1",
    type: "expense",
    amount: "12.5",
    title: "Обед",
    note: '{"paymentMethod":"card","currency":"USD"}',
    date: "2026-07-20T10:30:00Z",
    created_at: "2026-07-20T10:30:00Z",
    updated_at: "2026-07-20T10:30:00Z",
  }, {
    id: "t2",
    user_id: "u1",
    account_id: "a1",
    to_account_id: "a2",
    category_id: "c1",
    type: "transfer",
    amount: "20",
    title: "Перевод",
    note: "{broken",
    date: "2026-07-19T10:00:00Z",
    created_at: "2026-07-19T10:00:00Z",
    updated_at: "2026-07-19T10:00:00Z",
  }],
  budgets: [],
  settings: { currency: "USD" },
};

Deno.test("normalizes transfer without a category and tolerates broken note", () => {
  const rows = normalizeTransactions(data);
  if (
    rows[1].type !== "Перевод" || rows[1].destinationAccount !== "Архив" ||
    rows[1].category !== ""
  ) throw new Error("transfer normalization failed");
});
Deno.test("keeps multiple currencies separate and includes empty categories", () => {
  const result = buildSheetValues(data, "2026-07-20T12:00:00Z");
  if (
    !JSON.stringify(result.overview).includes("USD") ||
    result.categories.length < 6
  ) throw new Error("sheet values failed");
});
Deno.test("fresh lock blocks while stale lock expires", () => {
  if (
    !isFreshSync("syncing", new Date().toISOString()) ||
    isFreshSync("syncing", "2020-01-01T00:00:00Z")
  ) throw new Error("lock timeout failed");
});
Deno.test("safe response contains no internal identifiers or tokens", () => {
  const json = JSON.stringify(safeSyncResponse(new Date().toISOString(), 2));
  if (/token|spreadsheet_id|user_id/.test(json)) {
    throw new Error("unsafe response");
  }
});

Deno.test("empty finance state uses compact empty states without fake zero rows", () => {
  const empty = buildSheetValues({
    profile: data.profile,
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    settings: { currency: "USD" },
  }, "2026-07-20T12:00:00Z");
  const rendered = JSON.stringify(empty);
  if (
    !rendered.includes("Операций пока нет") ||
    !rendered.includes("Категорий пока нет") ||
    !rendered.includes("ИТОГИ ЗА ПЕРИОД")
  ) throw new Error("empty state failed");
});
