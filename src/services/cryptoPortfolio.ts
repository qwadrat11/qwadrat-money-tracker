import { supabase } from "../lib/supabase";
import type { Currency } from "../types";

export type CryptoAssetSearch = {
  providerAssetId: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  marketCapRank: number | null;
};
export type CryptoHolding = {
  id: string;
  user_id: string;
  account_id: string;
  provider_asset_id: string;
  symbol: string;
  name: string;
  image_url: string | null;
  quantity: number;
  average_buy_price: number | null;
  average_buy_currency: Currency | null;
  note: string | null;
  include_in_portfolio: boolean;
};
export type CryptoPosition = {
  id: string;
  providerAssetId: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  currentPrice: number | null;
  positionValue: number | null;
  change24h: number | null;
  changeValue24h: number | null;
  averageBuyPrice: number | null;
  averageBuyCurrency: Currency | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  quoteCurrency: Currency;
  priceMissing: boolean;
  weight: number;
};
export type CryptoPortfolioSnapshot = {
  positions: CryptoPosition[];
  summary: {
    portfolioValue: number;
    portfolioChange24h: number;
    coinCount: number;
    quoteCurrency: Currency;
    fetchedAt: string;
    stale: boolean;
    missingPriceCount: number;
  };
};
function db() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}
function databaseError(error: {
  message?: string;
  details?: string;
  hint?: string;
}) {
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" · ");
  return new Error(message || "Не удалось сохранить данные криптопортфеля");
}

export async function searchCryptoAssets(query: string) {
  const { data, error } = await db().functions.invoke("crypto-search", {
    body: { query },
  });
  if (error) throw new Error("Поиск CoinGecko временно недоступен");
  const result = data as {
    success?: boolean;
    data?: CryptoAssetSearch[];
    error?: { message?: string };
  };
  if (!result.success)
    throw new Error(result.error?.message ?? "Не удалось выполнить поиск");
  return result.data ?? [];
}
export async function loadCryptoHoldings(accountId: string) {
  const { data, error } = await db()
    .from("crypto_holdings")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at");
  if (error) throw databaseError(error);
  return (data ?? []).map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    average_buy_price:
      row.average_buy_price == null ? null : Number(row.average_buy_price),
  })) as CryptoHolding[];
}
export async function saveCryptoHolding(input: {
  accountId: string;
  asset: CryptoAssetSearch;
  quantity: number;
  averageBuyPrice: number | null;
  averageBuyCurrency: Currency;
  note?: string;
}) {
  const client = db();
  const { data, error } = await client
    .from("crypto_holdings")
    .upsert(
      {
        account_id: input.accountId,
        provider: "coingecko",
        provider_asset_id: input.asset.providerAssetId,
        symbol: input.asset.symbol.toUpperCase(),
        name: input.asset.name,
        image_url: input.asset.imageUrl,
        quantity: input.quantity,
        average_buy_price: input.averageBuyPrice,
        average_buy_currency:
          input.averageBuyPrice == null ? null : input.averageBuyCurrency,
        note: input.note?.trim() || null,
        include_in_portfolio: true,
      },
      { onConflict: "user_id,account_id,provider,provider_asset_id" }
    )
    .select("*")
    .single();
  if (error) throw databaseError(error);
  return data;
}
export async function updateCryptoHolding(
  id: string,
  patch: {
    quantity: number;
    average_buy_price: number | null;
    average_buy_currency: Currency | null;
    note?: string | null;
  }
) {
  const { data, error } = await db()
    .from("crypto_holdings")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw databaseError(error);
  return data;
}
export async function deleteCryptoHolding(id: string) {
  const { error } = await db().from("crypto_holdings").delete().eq("id", id);
  if (error) throw databaseError(error);
}
export async function loadCryptoPortfolio(accountId: string, force = false) {
  const { data, error } = await db().functions.invoke("crypto-prices", {
    body: { accountId, force },
  });
  if (error) throw new Error("Не удалось обновить котировки CoinGecko");
  const result = data as {
    success?: boolean;
    data?: CryptoPortfolioSnapshot;
    error?: { message?: string };
  };
  if (!result.success || !result.data)
    throw new Error(
      result.error?.message ?? "Не удалось загрузить криптопортфель"
    );
  return result.data;
}
