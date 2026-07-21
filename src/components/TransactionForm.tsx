import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  Account,
  AppSettings,
  Category,
  Transaction,
  TransactionType,
} from "../types";
import { Button } from "./ui/Button";
import { Field, Input, Select, Textarea } from "./ui/Field";
import { getDefaultCategoryId, getTransferCategoryId } from "../utils/category";
import {
  type CurrencyConversion,
  previewCurrencyConversion,
} from "../services/currencyConversion";
import { formatMoney } from "../utils/format";

type Draft = Omit<Transaction, "id" | "createdAt" | "updatedAt">;

export function TransactionForm({
  accounts,
  categories,
  settings,
  initial,
  onSubmit,
  submitLabel = "Сохранить",
}: {
  accounts: Account[];
  categories: Category[];
  settings: AppSettings;
  initial?: Draft | Transaction;
  onSubmit: (transaction: Draft | Transaction) => void | Promise<void>;
  submitLabel?: string;
}) {
  const activeAccounts = accounts.filter((account) => !account.archived && account.type !== "crypto_portfolio");
  const firstAccount = activeAccounts[0]?.id ?? "";
  const [draft, setDraft] = useState<Draft | Transaction>(
    initial ?? {
      type: "expense",
      date: new Date().toISOString().slice(0, 10),
      amount: 0,
      categoryId: getDefaultCategoryId(categories, "expense"),
      accountId: firstAccount,
      toAccountId: activeAccounts.find((account) => account.id !== firstAccount)
        ?.id,
      description: "",
      paymentMethod: settings.defaultPaymentMethod,
      currency: settings.currency,
      userId: "u-1",
    },
  );
  const [conversion, setConversion] = useState<CurrencyConversion | null>(null);
  const [conversionError, setConversionError] = useState("");
  const [conversionPending, setConversionPending] = useState(false);

  useEffect(() => {
    if (draft.amount <= 0 || draft.currency === settings.baseCurrency) {
      setConversion(null);
      setConversionError("");
      setConversionPending(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setConversionPending(true);
      setConversionError("");
      void previewCurrencyConversion({
        amount: draft.amount,
        fromCurrency: draft.currency,
        toCurrency: settings.baseCurrency,
        date: draft.date,
      })
        .then((value) => {
          if (!controller.signal.aborted) setConversion(value);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setConversion(null);
            setConversionError(
              "Не удалось получить курс валют. Повторите попытку",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setConversionPending(false);
        });
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [draft.amount, draft.currency, draft.date, settings.baseCurrency]);

  const availableCategories = draft.type === "transfer"
    ? categories.filter((category) => category.type === "expense")
    : categories.filter((category) =>
      category.type === draft.type || category.type === "both"
    );

  return (
    <form
      className="grid touch-pan-y gap-5 sm:grid-cols-2 sm:gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          !draft.description.trim() || draft.amount <= 0 || !draft.accountId ||
          conversionPending || conversionError
        ) return;
        if (
          draft.type === "transfer" &&
          (!draft.toAccountId || draft.toAccountId === draft.accountId)
        ) return;
        void onSubmit(draft);
      }}
    >
      <Field label="Тип операции">
        <Select
          value={draft.type}
          onChange={(event) => {
            const type = event.target.value as TransactionType;
            setDraft((prev) => ({
              ...prev,
              type,
              categoryId: type === "transfer"
                ? getTransferCategoryId(categories)
                : getDefaultCategoryId(categories, type),
            }));
          }}
        >
          <option value="expense">Расход</option>
          <option value="income">Доход</option>
          <option value="transfer">Перевод</option>
        </Select>
      </Field>
      <Field label="Дата">
        <Input
          value={draft.date}
          type="date"
          onChange={(event) => setDraft({ ...draft, date: event.target.value })}
        />
      </Field>
      <Field label={draft.type === "transfer" ? "Со счета" : "Счет операции"}>
        <Select
          value={draft.accountId}
          onChange={(event) =>
            setDraft({ ...draft, accountId: event.target.value })}
        >
          {activeAccounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </Select>
      </Field>
      {draft.type === "transfer" && (
        <Field label="На счет">
          <Select
            value={draft.toAccountId ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, toAccountId: event.target.value })}
          >
            <option value="">Выберите счет</option>
            {activeAccounts.filter((account) => account.id !== draft.accountId)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </Select>
        </Field>
      )}
      <Field label="Сумма">
        <Input
          min="0"
          step="0.01"
          type="number"
          value={draft.amount || ""}
          onChange={(event) =>
            setDraft({ ...draft, amount: Number(event.target.value) })}
        />
      </Field>
      {draft.type !== "transfer" && (
        <Field label="Категория операции">
          <Select
            value={draft.categoryId}
            onChange={(event) =>
              setDraft({ ...draft, categoryId: event.target.value })}
          >
            {availableCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Способ оплаты">
        <Input
          value={draft.paymentMethod}
          onChange={(event) =>
            setDraft({ ...draft, paymentMethod: event.target.value })}
          placeholder="Apple Pay, карта, наличные"
        />
      </Field>
      <Field label="Валюта операции">
        <Select
          value={draft.currency}
          onChange={(event) =>
            setDraft({
              ...draft,
              currency: event.target.value as Draft["currency"],
            })}
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="UAH">UAH</option>
        </Select>
      </Field>
      {draft.currency !== settings.baseCurrency && (
        <div className="sm:col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          {conversionPending && "Получаем официальный курс НБУ…"}
          {conversionError && (
            <span className="text-rose-600">{conversionError}</span>
          )}
          {conversion && (
            <>
              <strong>
                {formatMoney(
                  conversion.originalAmount,
                  conversion.originalCurrency,
                )}
              </strong>{" "}
              ≈{" "}
              <strong>
                {formatMoney(
                  conversion.convertedAmount,
                  conversion.baseCurrency,
                )}
              </strong>
              <div className="mt-1 text-xs text-zinc-500">
                По официальному курсу НБУ на{" "}
                {new Date(`${conversion.exchangeRateDate}T00:00:00`)
                  .toLocaleDateString("ru-RU")}
              </div>
            </>
          )}
        </div>
      )}
      <div className="sm:col-span-2">
        <Field label="Описание">
          <Textarea
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })}
            placeholder="Например: продукты, зарплата, перевод в накопления"
          />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button className="w-full sm:w-auto"
          type="submit"
          disabled={conversionPending || Boolean(conversionError)}
        >
          <Save className="h-5 w-5 sm:h-4 sm:w-4" />
          {submitLabel}
        </Button>
        <p className="px-1 text-sm text-zinc-500 sm:text-xs">
          Все поля сохраняются локально и сразу обновляют балансы.
        </p>
      </div>
    </form>
  );
}
