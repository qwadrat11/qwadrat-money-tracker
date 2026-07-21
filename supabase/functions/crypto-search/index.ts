import { createCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import { createErrorPayload, logServerError } from "../_shared/errors.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { coinGeckoGet, safeSearchQuery } from "../_shared/coingecko.ts";

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...Object.fromEntries(createCorsHeaders(request)),
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=30",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleCorsPreflight(request);
  try {
    await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { query?: string };
    const query = safeSearchQuery(body.query);
    if (query.length < 2) return json(request, { success: true, data: [] });
    const admin = getSupabaseAdminClient(), pattern = `%${query}%`;
    const { data: cached } = await admin.from("crypto_assets").select(
      "coingecko_id,symbol,name,image_url,market_cap_rank,last_searched_at",
    ).or(
      `coingecko_id.ilike.${pattern},symbol.ilike.${pattern},name.ilike.${pattern}`,
    ).order("market_cap_rank", { ascending: true, nullsFirst: false }).limit(
      12,
    );
    const cacheFresh = cached?.some((coin) =>
      Date.parse(coin.last_searched_at) > Date.now() - 7 * 24 * 60 * 60 * 1000
    );
    if ((cached?.length ?? 0) >= 5 || cacheFresh) {
      return json(request, { success: true, data: cached!.map((coin) => ({ providerAssetId: coin.coingecko_id, symbol: coin.symbol, name: coin.name, imageUrl: coin.image_url, marketCapRank: coin.market_cap_rank })), cached: true });
    }
    const result = await coinGeckoGet(
      `/search?query=${encodeURIComponent(query)}`,
    ) as {
      coins?: Array<
        {
          id: string;
          name: string;
          symbol: string;
          market_cap_rank?: number | null;
          large?: string;
          thumb?: string;
        }
      >;
    };
    const coins = (result.coins ?? []).slice(0, 20).map((coin) => ({
      coingecko_id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      image_url: coin.large ?? coin.thumb ?? null,
      market_cap_rank: coin.market_cap_rank ?? null,
      last_searched_at: new Date().toISOString(),
    }));
    if (coins.length) {
      await admin.from("crypto_assets").upsert(coins, {
        onConflict: "coingecko_id",
      });
    }
    return json(request, { success: true, data: coins.map((coin) => ({ providerAssetId: coin.coingecko_id, symbol: coin.symbol, name: coin.name, imageUrl: coin.image_url, marketCapRank: coin.market_cap_rank })), cached: false });
  } catch (error) {
    const payload =
      (error as { error?: { code?: string; message?: string } }).error;
    if (!payload) logServerError("crypto-search", error);
    return json(
      request,
      createErrorPayload(
        payload?.code ?? "INTERNAL_ERROR",
        payload?.message ?? "Поиск криптовалют временно недоступен",
      ),
      payload?.code === "COINGECKO_RATE_LIMIT" ? 429 : 500,
    );
  }
});
