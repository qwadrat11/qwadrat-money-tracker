import { createErrorPayload } from "./errors.ts";

const BASE_URL = "https://api.coingecko.com/api/v3";

export async function coinGeckoGet(
  path: string,
  fetcher: typeof fetch = fetch,
) {
  const apiKey = Deno.env.get("COINGECKO_API_KEY")?.trim();
  if (!apiKey) {
    throw createErrorPayload(
      "COINGECKO_NOT_CONFIGURED",
      "CoinGecko API не настроен",
    );
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetcher(`${BASE_URL}${path}`, {
      headers: { accept: "application/json", "x-cg-demo-api-key": apiKey },
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
      continue;
    }
    if (!response.ok) {
      throw createErrorPayload(
        response.status === 429
          ? "COINGECKO_RATE_LIMIT"
          : "COINGECKO_API_ERROR",
        response.status === 429
          ? "Лимит CoinGecko временно исчерпан"
          : "CoinGecko временно недоступен",
      );
    }
    return response.json();
  }
  throw createErrorPayload(
    "COINGECKO_API_ERROR",
    "CoinGecko временно недоступен",
  );
}

export function safeSearchQuery(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(
    /[^\p{L}\p{N} ._-]/gu,
    "",
  ).trim().slice(0, 80);
}
