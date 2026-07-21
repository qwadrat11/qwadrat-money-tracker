export type CryptoMarket = { id: string; current_price: number; market_cap: number | null; price_change_percentage_24h: number | null; last_updated: string | null };
export type CryptoHoldingInput = { id: string; provider_asset_id: string; symbol: string; name: string; image_url: string | null; quantity: number | string; average_buy_price: number | string | null; average_buy_currency: string | null };

export function calculateCryptoPortfolio(holdings: CryptoHoldingInput[], prices: Map<string, CryptoMarket>, quoteCurrency: string, fetchedAt: string, stale: boolean) {
  const positions = holdings.map((holding) => {
    const market = prices.get(holding.provider_asset_id), quantity = Number(holding.quantity), price = market?.current_price ?? null;
    const positionValue = price == null ? null : quantity * price;
    const change24h = market?.price_change_percentage_24h ?? null;
    const previousPrice = price != null && change24h != null && change24h > -100 ? price / (1 + change24h / 100) : null;
    const changeValue24h = price != null && previousPrice != null ? quantity * (price - previousPrice) : null;
    const averageBuyPrice = holding.average_buy_price == null ? null : Number(holding.average_buy_price);
    const invested = averageBuyPrice != null && averageBuyPrice > 0 ? quantity * averageBuyPrice : null;
    const profitLoss = positionValue != null && invested != null ? positionValue - invested : null;
    return { id: holding.id, providerAssetId: holding.provider_asset_id, symbol: holding.symbol, name: holding.name, imageUrl: holding.image_url, quantity, currentPrice: price, positionValue, change24h, changeValue24h, averageBuyPrice, averageBuyCurrency: holding.average_buy_currency, profitLoss, profitLossPercent: profitLoss != null && invested ? profitLoss / invested * 100 : null, quoteCurrency, priceMissing: !market };
  });
  const portfolioValue = positions.reduce((sum, position) => sum + (position.positionValue ?? 0), 0);
  const portfolioChange24h = positions.reduce((sum, position) => sum + (position.changeValue24h ?? 0), 0);
  return { positions: positions.map((position) => ({ ...position, weight: portfolioValue && position.positionValue != null ? position.positionValue / portfolioValue * 100 : 0 })), summary: { portfolioValue, portfolioChange24h, coinCount: positions.length, quoteCurrency, fetchedAt, stale, missingPriceCount: positions.filter((position) => position.priceMissing).length } };
}
