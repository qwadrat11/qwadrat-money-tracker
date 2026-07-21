import { convertThroughUah, createRateSnapshot } from "./currencyConversion.ts";

function store(seed: Record<string, number> = {}) {
  const rows = new Map(Object.entries(seed));
  let filters: Record<string, string> = {};
  const query = {
    eq(key: string, value: string) {
      filters[key] = value;
      return this;
    },
    async maybeSingle() {
      const rate = rows.get(`${filters.rate_date}:${filters.base_currency}`);
      filters = {};
      return { data: rate ? { rate } : null, error: null };
    },
  };
  return {
    from() {
      return {
        select() {
          filters = {};
          return query;
        },
        async upsert(value: Record<string, unknown>) {
          rows.set(
            `${value.rate_date}:${value.base_currency}`,
            Number(value.rate),
          );
          return { error: null };
        },
      };
    },
    rows,
  };
}

Deno.test("560 UAH converts to USD through the historical NBU rate", async () => {
  const db = store({ "2026-07-21:USD": 44.703 });
  const value = await createRateSnapshot(db, 560, "UAH", "USD", "2026-07-21");
  if (
    Math.abs(value.convertedAmount - 560 / 44.703) > 1e-9 ||
    value.exchangeRateSource !== "NBU"
  ) throw new Error("UAH conversion failed");
});

Deno.test("identity conversion preserves the original amount", async () => {
  const value = await createRateSnapshot(
    store(),
    100,
    "USD",
    "USD",
    "2026-07-21",
  );
  if (
    value.convertedAmount !== 100 || value.exchangeRate !== 1 ||
    value.exchangeRateSource !== "identity"
  ) throw new Error("identity failed");
});

Deno.test("EUR converts to USD through UAH", () => {
  const value = convertThroughUah(100, 51.0955, 44.703);
  if (Math.abs(value.convertedAmount - (100 * 51.0955 / 44.703)) > 1e-9) {
    throw new Error("cross-rate failed");
  }
});

Deno.test("historical cached snapshot does not use today's rate", async () => {
  const db = store({ "2026-01-10:USD": 42, "2026-07-21:USD": 44.703 });
  const old = await createRateSnapshot(db, 420, "UAH", "USD", "2026-01-10");
  if (old.convertedAmount !== 10) {
    throw new Error("historical date was ignored");
  }
});

Deno.test("unsupported currency is rejected without inventing a rate", async () => {
  let code = "";
  try {
    await createRateSnapshot(store(), 1, "BTC", "USD", "2026-07-21");
  } catch (error) {
    code = String((error as { error?: { code?: string } }).error?.code);
  }
  if (code !== "UNSUPPORTED_CURRENCY") {
    throw new Error("unsupported currency was accepted");
  }
});

Deno.test("NBU outage returns a controlled error", async () => {
  let code = "";
  try {
    await createRateSnapshot(
      store(),
      560,
      "UAH",
      "USD",
      "2026-07-21",
      (async () =>
        new Response("unavailable", { status: 503 })) as typeof fetch,
    );
  } catch (error) {
    code = String((error as { error?: { code?: string } }).error?.code);
  }
  if (code !== "EXCHANGE_RATE_UNAVAILABLE") {
    throw new Error("outage was not controlled");
  }
});
