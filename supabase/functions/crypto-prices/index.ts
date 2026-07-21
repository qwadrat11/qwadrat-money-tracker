import { createCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import { createErrorPayload, logServerError } from "../_shared/errors.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { coinGeckoGet } from "../_shared/coingecko.ts";
import { calculateCryptoPortfolio, type CryptoHoldingInput as Holding, type CryptoMarket as Market } from "../_shared/cryptoPortfolio.ts";

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...Object.fromEntries(createCorsHeaders(request)), "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleCorsPreflight(request);
  try {
    const { user } = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { accountId?: string; force?: boolean };
    const admin = getSupabaseAdminClient();
    const { data: account, error: accountError } = await admin.from("accounts").select("id,type").eq("id", body.accountId).eq("user_id", user.id).eq("type", "crypto_portfolio").single();
    if (accountError || !account) throw createErrorPayload("CRYPTO_PORTFOLIO_NOT_FOUND", "Криптопортфель не найден");
    const [{ data: holdings, error }, { data: settings, error: settingsError }] = await Promise.all([
      admin.from("crypto_holdings").select("id,provider_asset_id,symbol,name,image_url,quantity,average_buy_price,average_buy_currency,include_in_portfolio").eq("user_id", user.id).eq("account_id", account.id).eq("include_in_portfolio", true).order("created_at"),
      admin.from("app_settings").select("data").eq("user_id", user.id).maybeSingle(),
    ]);
    if (error || settingsError) throw error ?? settingsError;
    const quoteCurrency = String(settings?.data?.baseCurrency ?? "USD").toUpperCase();
    if (!["USD", "EUR", "UAH"].includes(quoteCurrency)) throw createErrorPayload("UNSUPPORTED_BASE_CURRENCY", "Основная валюта не поддерживается CoinGecko");
    const rows = (holdings ?? []) as Holding[], ids = [...new Set(rows.map((row) => row.provider_asset_id))];
    if (!ids.length) return json(request, { success: true, data: calculateCryptoPortfolio([], new Map(), quoteCurrency, new Date().toISOString(), false) });
    const threshold = new Date(Date.now() - 60_000).toISOString();
    const { data: cached } = await admin.from("crypto_price_cache").select("provider_asset_id,price,change_24h,market_cap,last_updated_at,updated_at").eq("provider", "coingecko").eq("quote_currency", quoteCurrency).in("provider_asset_id", ids);
    const cacheFresh = !body.force && (cached?.length ?? 0) === ids.length && cached!.every((row) => row.updated_at >= threshold);
    if (cacheFresh) {
      const map = new Map(cached!.map((row) => [row.provider_asset_id, { id: row.provider_asset_id, current_price: Number(row.price), market_cap: row.market_cap == null ? null : Number(row.market_cap), price_change_percentage_24h: row.change_24h == null ? null : Number(row.change_24h), last_updated: row.last_updated_at }]));
      return json(request, { success: true, data: calculateCryptoPortfolio(rows, map, quoteCurrency, cached![0].updated_at, false), cached: true });
    }
    const markets: Market[] = [];
    try {
      for (let start = 0; start < ids.length; start += 250) {
        markets.push(...await coinGeckoGet(`/coins/markets?vs_currency=${quoteCurrency.toLowerCase()}&ids=${encodeURIComponent(ids.slice(start, start + 250).join(","))}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h`) as Market[]);
      }
    } catch (marketError) {
      if (cached?.length) {
        const map = new Map(cached.map((row) => [row.provider_asset_id, { id: row.provider_asset_id, current_price: Number(row.price), market_cap: row.market_cap == null ? null : Number(row.market_cap), price_change_percentage_24h: row.change_24h == null ? null : Number(row.change_24h), last_updated: row.last_updated_at }]));
        return json(request, { success: true, data: calculateCryptoPortfolio(rows, map, quoteCurrency, cached[0].updated_at, true), cached: true });
      }
      throw marketError;
    }
    const fetchedAt = new Date().toISOString();
    if (markets.length) await admin.from("crypto_price_cache").upsert(markets.map((coin) => ({ provider: "coingecko", provider_asset_id: coin.id, quote_currency: quoteCurrency, price: coin.current_price, change_24h: coin.price_change_percentage_24h, market_cap: coin.market_cap, last_updated_at: coin.last_updated, updated_at: fetchedAt })), { onConflict: "provider,provider_asset_id,quote_currency" });
    return json(request, { success: true, data: calculateCryptoPortfolio(rows, new Map(markets.map((market) => [market.id, market])), quoteCurrency, fetchedAt, false), cached: false });
  } catch (error) {
    const payload = (error as { error?: { code?: string; message?: string } }).error;
    if (!payload) logServerError("crypto-prices", error);
    return json(request, createErrorPayload(payload?.code ?? "INTERNAL_ERROR", payload?.message ?? "Не удалось обновить котировки"), payload?.code === "COINGECKO_RATE_LIMIT" ? 429 : payload?.code ? 400 : 500);
  }
});
