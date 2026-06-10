import { bitgetPublic } from "./bitget";
import type { MarketCandle, MarketSnapshot, SymbolId, ToolTrace } from "./types";

const BITGET_BASE_URL = "https://api.bitget.com";

const FALLBACK_BASE: Record<SymbolId, number> = {
  BTCUSDT: 104800,
  ETHUSDT: 3820,
  SOLUSDT: 168,
};

function seededNoise(seed: number) {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

function fallbackCandles(symbol: SymbolId): MarketCandle[] {
  const base = FALLBACK_BASE[symbol];
  const now = Date.now();

  return Array.from({ length: 96 }, (_, index) => {
    const wave = Math.sin(index / 7) * 0.015 + Math.cos(index / 13) * 0.01;
    const noise = (seededNoise(index + base) - 0.5) * 0.012;
    const close = base * (1 + wave + noise);
    const open = base * (1 + wave * 0.85 + noise * 0.7);
    const high = Math.max(open, close) * (1 + 0.002 + seededNoise(index) * 0.006);
    const low = Math.min(open, close) * (1 - 0.002 - seededNoise(index + 3) * 0.006);

    return {
      time: now - (95 - index) * 60 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: 1000 + seededNoise(index + 9) * 4000,
    };
  });
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function baseSnapshot(symbol: SymbolId, candles: MarketCandle[]): MarketSnapshot {
  const first = candles.at(-24)?.close ?? FALLBACK_BASE[symbol];
  const last = candles.at(-1)?.close ?? FALLBACK_BASE[symbol];

  return {
    symbol,
    last,
    change24h: ((last - first) / first) * 100,
    fundingRate: symbol === "SOLUSDT" ? 0.022 : 0.011,
    openInterest: symbol === "BTCUSDT" ? 9600000000 : 1800000000,
    bestBid: last * 0.9998,
    bestAsk: last * 1.0002,
    spreadBps: 4,
    depthImbalance: 0.08,
    recentTradeBias: 0.04,
    maxLeverage: 20,
    tickSize: symbol === "BTCUSDT" ? 0.1 : 0.01,
    candles,
    source: "fallback",
    updatedAt: new Date().toISOString(),
  };
}

export async function getMarketBundle(symbol: SymbolId): Promise<{
  market: MarketSnapshot;
  traces: ToolTrace[];
}> {
  const traces: ToolTrace[] = [];

  try {
    const [tickerResult, fundingResult, interestResult, candlesResult, depthResult, tradesResult, contractsResult] =
      await Promise.all([
        bitgetPublic<{ data?: Array<Record<string, unknown>> }>(
          "futures_get_ticker",
          `/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`,
        ),
        bitgetPublic<{ data?: Array<Record<string, unknown>> | Record<string, unknown> }>(
          "futures_get_funding_rate",
          `/api/v2/mix/market/current-fund-rate?symbol=${symbol}&productType=USDT-FUTURES`,
        ),
        bitgetPublic<{ data?: Record<string, unknown> }>(
          "futures_get_open_interest",
          `/api/v2/mix/market/open-interest?symbol=${symbol}&productType=USDT-FUTURES`,
        ),
        bitgetPublic<{ data?: unknown[][] }>(
          "futures_get_candles",
          `/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1H&limit=96`,
        ),
        bitgetPublic<{ data?: { bids?: unknown[][]; asks?: unknown[][] } }>(
          "futures_get_depth",
          `/api/v2/mix/market/merge-depth?symbol=${symbol}&productType=USDT-FUTURES&limit=50`,
        ),
        bitgetPublic<{ data?: Array<Record<string, unknown>> }>(
          "futures_get_trades",
          `/api/v2/mix/market/fills?symbol=${symbol}&productType=USDT-FUTURES&limit=100`,
        ),
        bitgetPublic<{ data?: Array<Record<string, unknown>> }>(
          "futures_get_contracts",
          `/api/v2/mix/market/contracts?productType=USDT-FUTURES&symbol=${symbol}`,
        ),
      ]);

    traces.push(
      tickerResult.trace,
      fundingResult.trace,
      interestResult.trace,
      candlesResult.trace,
      depthResult.trace,
      tradesResult.trace,
      contractsResult.trace,
    );

    const ticker = tickerResult.data?.data?.[0] ?? {};
    const funding = Array.isArray(fundingResult.data?.data)
      ? fundingResult.data.data[0]
      : fundingResult.data?.data ?? {};
    const rawCandles = candlesResult.data?.data ?? [];
    const candles = rawCandles
      .map((row) => ({
        time: toNumber(row[0]),
        open: toNumber(row[1]),
        high: toNumber(row[2]),
        low: toNumber(row[3]),
        close: toNumber(row[4]),
        volume: toNumber(row[5]),
      }))
      .filter((candle) => candle.close > 0)
      .sort((a, b) => a.time - b.time);

    if (candles.length < 24) {
      throw new Error("insufficient Bitget candles");
    }

    const fallback = baseSnapshot(symbol, candles);
    const bids = depthResult.data?.data?.bids ?? [];
    const asks = depthResult.data?.data?.asks ?? [];
    const bidSize = bids.slice(0, 10).reduce((sum, row) => sum + toNumber(row[1]), 0);
    const askSize = asks.slice(0, 10).reduce((sum, row) => sum + toNumber(row[1]), 0);
    const bestBid = toNumber(bids[0]?.[0], fallback.bestBid);
    const bestAsk = toNumber(asks[0]?.[0], fallback.bestAsk);
    const tradeRows = tradesResult.data?.data ?? [];
    const buyTrades = tradeRows.filter((row) => row.side === "buy").length;
    const sellTrades = tradeRows.filter((row) => row.side === "sell").length;
    const contract = contractsResult.data?.data?.[0] ?? {};
    const maxLeverage = toNumber(contract.maxLever ?? contract.maxLeverage, fallback.maxLeverage);
    const tickSize = toNumber(contract.pricePlace, 0)
      ? 1 / 10 ** toNumber(contract.pricePlace)
      : fallback.tickSize;

    return {
      market: {
      symbol,
      last: toNumber(ticker.lastPr, candles.at(-1)?.close ?? FALLBACK_BASE[symbol]),
      change24h: toNumber(ticker.change24h, 0) * 100,
      fundingRate: toNumber(funding.fundingRate, 0) * 100,
        openInterest: toNumber(interestResult.data?.data?.openInterest, 0),
        bestBid,
        bestAsk,
        spreadBps: bestBid > 0 && bestAsk > 0 ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 10000 : 0,
        depthImbalance: (bidSize - askSize) / Math.max(bidSize + askSize, 1),
        recentTradeBias: (buyTrades - sellTrades) / Math.max(buyTrades + sellTrades, 1),
        maxLeverage,
        tickSize,
      candles,
      source: "bitget",
      updatedAt: new Date().toISOString(),
      },
      traces,
    };
  } catch {
    const candles = fallbackCandles(symbol);
    return {
      market: baseSnapshot(symbol, candles),
      traces:
        traces.length > 0
          ? traces
          : [
              {
                module: "futures",
                tool: "futures_market_bundle",
                risk: "READ",
                status: "fallback",
                summary: "Public Bitget market bundle unavailable; deterministic fallback used.",
              },
            ],
    };
  }
}

export async function getMarketSnapshot(symbol: SymbolId): Promise<MarketSnapshot> {
  const { market } = await getMarketBundle(symbol);
  return market;
}
