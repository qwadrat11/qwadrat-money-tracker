import { createErrorPayload } from "./errors.ts";

export type CurrencyCode = "USD" | "EUR" | "UAH";
export type RateSnapshot = {
  originalAmount: number;
  originalCurrency: CurrencyCode;
  baseCurrency: CurrencyCode;
  exchangeRate: number;
  convertedAmount: number;
  exchangeRateDate: string;
  exchangeRateSource: "identity" | "NBU";
};

type NbuRate = { cc?: string; rate?: number; exchangedate?: string };
type RateStore = {
  from(table: string): {
    select(columns: string): any;
    upsert(values: unknown, options: unknown): any;
  };
};

export function normalizeCurrency(value: unknown): CurrencyCode {
  const code = String(value ?? "").trim().toUpperCase();
  if (code === "USD" || code === "EUR" || code === "UAH") return code;
  throw createErrorPayload(
    "UNSUPPORTED_CURRENCY",
    "Валюта не поддерживается официальным источником НБУ",
  );
}

export function normalizeRateDate(value: unknown) {
  const date = String(value ?? "").slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  ) {
    throw createErrorPayload("INVALID_REQUEST", "Некорректная дата курса");
  }
  return date;
}

export function convertThroughUah(
  amount: number,
  fromUah: number,
  toUah: number,
) {
  if (
    ![amount, fromUah, toUah].every(Number.isFinite) || amount < 0 ||
    fromUah <= 0 || toUah <= 0
  ) {
    throw createErrorPayload(
      "INVALID_REQUEST",
      "Некорректные параметры конвертации",
    );
  }
  const exchangeRate = fromUah / toUah;
  return { exchangeRate, convertedAmount: amount * exchangeRate };
}

async function cachedRate(store: RateStore, code: CurrencyCode, date: string) {
  if (code === "UAH") return 1;
  const { data, error } = await store.from("exchange_rates").select("rate")
    .eq("rate_date", date).eq("base_currency", code).eq("quote_currency", "UAH")
    .eq("source", "NBU").maybeSingle();
  if (error) throw error;
  const value = Number(data?.rate);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function getNbuRates(
  store: RateStore,
  currencies: CurrencyCode[],
  date: string,
  fetcher: typeof fetch = fetch,
) {
  const unique = [...new Set(currencies.filter((code) => code !== "UAH"))];
  const result = new Map<CurrencyCode, number>([["UAH", 1]]);
  const missing: CurrencyCode[] = [];
  for (const code of unique) {
    const value = await cachedRate(store, code, date);
    if (value) result.set(code, value);
    else missing.push(code);
  }
  if (!missing.length) return result;
  const compactDate = date.replaceAll("-", "");
  const response = await fetcher(
    `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?date=${compactDate}&json`,
  );
  if (!response.ok) {
    throw createErrorPayload(
      "EXCHANGE_RATE_UNAVAILABLE",
      "Не удалось получить курс валют. Повторите попытку",
    );
  }
  const rows = await response.json() as NbuRate[];
  for (const code of missing) {
    const rate = Number(
      rows.find((row) => row.cc?.toUpperCase() === code)?.rate,
    );
    if (!Number.isFinite(rate) || rate <= 0) {
      throw createErrorPayload(
        "UNSUPPORTED_CURRENCY",
        `НБУ не вернул курс ${code} на выбранную дату`,
      );
    }
    result.set(code, rate);
    const { error } = await store.from("exchange_rates").upsert({
      rate_date: date,
      base_currency: code,
      quote_currency: "UAH",
      rate,
      source: "NBU",
      updated_at: new Date().toISOString(),
    }, { onConflict: "rate_date,base_currency,quote_currency,source" });
    if (error) throw error;
  }
  return result;
}

export async function createRateSnapshot(
  store: RateStore,
  amountValue: unknown,
  fromValue: unknown,
  toValue: unknown,
  dateValue: unknown,
  fetcher: typeof fetch = fetch,
): Promise<RateSnapshot> {
  const amount = Number(amountValue),
    from = normalizeCurrency(fromValue),
    to = normalizeCurrency(toValue),
    date = normalizeRateDate(dateValue);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createErrorPayload(
      "INVALID_REQUEST",
      "Сумма должна быть больше нуля",
    );
  }
  if (from === to) {
    return {
      originalAmount: amount,
      originalCurrency: from,
      baseCurrency: to,
      exchangeRate: 1,
      convertedAmount: amount,
      exchangeRateDate: date,
      exchangeRateSource: "identity",
    };
  }
  const rates = await getNbuRates(store, [from, to], date, fetcher);
  const converted = convertThroughUah(amount, rates.get(from)!, rates.get(to)!);
  return {
    originalAmount: amount,
    originalCurrency: from,
    baseCurrency: to,
    exchangeRate: converted.exchangeRate,
    convertedAmount: converted.convertedAmount,
    exchangeRateDate: date,
    exchangeRateSource: "NBU",
  };
}
