const BITGET_BASE_URL = "https://api.bitget.com";

export const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const FALLBACK_BASE = {
  BTCUSDT: 104800,
  ETHUSDT: 3820,
  SOLUSDT: 168,
};

export const DEFAULT_RISK = {
  startingBalance: 10000,
  feeRate: 0.0006,
  maxEquityPct: 0.2,
  maxLeverage: 3,
  dailyLossCapPct: 3,
  minConfidence: 48,
};

function seededNoise(seed) {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

export function fallbackCandles(symbol, length = 360) {
  const base = FALLBACK_BASE[symbol] ?? 100;
  const now = Date.now();

  return Array.from({ length }, (_, index) => {
    const wave = Math.sin(index / 16) * 0.025 + Math.cos(index / 41) * 0.014;
    const trend = (index / length - 0.5) * (symbol === "SOLUSDT" ? 0.11 : 0.055);
    const noise = (seededNoise(index + base) - 0.5) * 0.018;
    const close = base * (1 + wave + trend + noise);
    const open = base * (1 + wave * 0.85 + trend + noise * 0.75);
    const high = Math.max(open, close) * (1 + 0.002 + seededNoise(index + 7) * 0.006);
    const low = Math.min(open, close) * (1 - 0.002 - seededNoise(index + 13) * 0.006);

    return {
      time: now - (length - 1 - index) * 60 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: 1000 + seededNoise(index + 23) * 4200,
    };
  });
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function fetchCandles(symbol, limit = 360) {
  const url = `${BITGET_BASE_URL}/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1H&limit=${limit}`;

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "vibeguard-evidence-generator" },
    });
    if (!response.ok) throw new Error(`Bitget candles HTTP ${response.status}`);
    const payload = await response.json();
    const candles = (payload.data ?? [])
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

    if (candles.length < 120) throw new Error("insufficient live candles");
    return { candles, source: "bitget" };
  } catch {
    return { candles: fallbackCandles(symbol, limit), source: "fallback" };
  }
}

export function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

export function ema(values, period) {
  const k = 2 / (period + 1);
  return values.reduce((prev, value, index) => (index === 0 ? value : value * k + prev * (1 - k)), values[0] ?? 0);
}

export function rsi(values, period = 14) {
  const recent = values.slice(-period - 1);
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < recent.length; index += 1) {
    const delta = recent[index] - recent[index - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function realizedVol(candles) {
  const closes = candles.map((candle) => candle.close);
  const returns = closes.slice(1).map((close, index) => (close - closes[index]) / closes[index]);
  const avg = mean(returns);
  const variance = mean(returns.map((ret) => (ret - avg) ** 2));
  return Math.sqrt(variance) * Math.sqrt(24) * 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function decideSymbol(symbol, candles, risk = DEFAULT_RISK) {
  const closes = candles.map((candle) => candle.close);
  const last = closes.at(-1) ?? FALLBACK_BASE[symbol];
  const ema12 = ema(closes.slice(-72), 12);
  const ema48 = ema(closes.slice(-120), 48);
  const rsi14 = rsi(closes);
  const vol = realizedVol(candles);
  const last24 = closes.slice(-24);
  const mean24 = mean(last24);
  const volumeNow = candles.at(-1)?.volume ?? 0;
  const avgVolume = mean(candles.slice(-24).map((candle) => candle.volume));
  const fundingProxy = symbol === "SOLUSDT" ? 0.018 : symbol === "ETHUSDT" ? 0.011 : 0.009;
  const oiProxy = clamp(((ema12 - ema48) / last) * 35 + (volumeNow / Math.max(avgVolume, 1) - 1) * 0.6, -1, 1);
  const trend = clamp(((ema12 - ema48) / last) * 1800, -1, 1);
  const reversion = clamp(((mean24 - last) / last) * 55, -1, 1);
  const funding = clamp(-fundingProxy / 0.06, -1, 1);
  const volume = clamp((volumeNow / Math.max(avgVolume, 1) - 1) * Math.sign(trend || 1), -1, 1);
  const volatility = vol > 8 ? -0.65 : vol > 5.5 ? -0.25 : 0.18;
  const score = mean([trend * 1.35, reversion * 0.7, funding * 0.65, volume * 0.7, oiProxy * 0.8, volatility * 0.6]);
  const confidence = Math.round(clamp(Math.abs(score) * 115 + Math.abs(trend) * 28 + Math.abs(volume) * 12, 0, 96));
  const spreadBps = symbol === "BTCUSDT" ? 1.8 : symbol === "ETHUSDT" ? 2.4 : 3.8;
  const blocked = confidence < risk.minConfidence || vol > 9 || spreadBps > 8 || Math.abs(fundingProxy) > 0.04;
  const side = blocked ? "FLAT" : score > 0 ? "LONG" : "SHORT";

  return {
    symbol,
    side,
    score,
    confidence,
    price: last,
    volatility: vol,
    spreadBps,
    fundingProxy,
    signals: {
      trend,
      reversion,
      funding,
      volume,
      openInterest: oiProxy,
      volatility,
    },
    reason:
      side === "FLAT"
        ? `No trade: confidence ${confidence}, vol ${vol.toFixed(2)}%, spread ${spreadBps.toFixed(2)} bps.`
        : `${side} ${symbol}: trend ${trend.toFixed(2)}, reversion ${reversion.toFixed(2)}, funding ${funding.toFixed(2)}, volume ${volume.toFixed(2)}.`,
  };
}

export function chooseDecision(candleMap, risk = DEFAULT_RISK) {
  const decisions = SYMBOLS.map((symbol) => decideSymbol(symbol, candleMap[symbol], risk)).sort(
    (a, b) => Math.abs(b.score) * b.confidence - Math.abs(a.score) * a.confidence,
  );
  return decisions.find((decision) => decision.side !== "FLAT") ?? decisions[0];
}

export function applyPaperTrade({ decision, balance, timestamp, index, risk = DEFAULT_RISK, exitPrice = null }) {
  const balanceBefore = balance;
  if (!decision || decision.side === "FLAT") {
    return {
      timestamp,
      pair: decision?.symbol ?? "BTCUSDT",
      side: "FLAT",
      price: decision?.price ?? 0,
      size: 0,
      balance_before: balanceBefore,
      balance_after: balanceBefore,
      pnl: 0,
      fees: 0,
      reason: decision?.reason ?? "No qualifying trade.",
      proof_id: `VG-PAPER-${String(index).padStart(3, "0")}`,
    };
  }

  const notional = balanceBefore * risk.maxEquityPct * risk.maxLeverage;
  const size = notional / decision.price;
  const direction = decision.side === "LONG" ? 1 : -1;
  const observedReturn =
    typeof exitPrice === "number" && exitPrice > 0
      ? ((exitPrice - decision.price) / decision.price) * direction
      : clamp(decision.score * 0.012 + (decision.confidence - 55) / 10000, -0.035, 0.04) * direction;
  const grossPnl = notional * observedReturn;
  const fees = notional * risk.feeRate;
  const pnl = grossPnl - fees;
  const balanceAfter = Math.max(0, balanceBefore + pnl);

  return {
    timestamp,
    pair: decision.symbol,
    side: decision.side,
    price: decision.price,
    size,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    pnl,
    fees,
    reason: decision.reason,
    proof_id: `VG-PAPER-${String(index).padStart(3, "0")}`,
  };
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv(rows, columns) {
  return [
    columns.join(","),
    ...rows.map((row) =>
      columns
        .map((column) => {
          const value = row[column];
          return typeof value === "number" ? value.toFixed(column.includes("price") ? 4 : 6) : csvEscape(value);
        })
        .join(","),
    ),
  ].join("\n");
}

export function metricSummary(rows, startingBalance = DEFAULT_RISK.startingBalance) {
  const tradeRows = rows.filter((row) => row.side !== "FLAT");
  const endingBalance = rows.at(-1)?.balance_after ?? startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  for (const row of rows) {
    peak = Math.max(peak, row.balance_after);
    maxDrawdown = Math.min(maxDrawdown, (row.balance_after - peak) / peak);
  }
  const wins = tradeRows.filter((row) => row.pnl > 0).length;
  const returns = tradeRows.map((row) => row.pnl / Math.max(row.balance_before, 1));
  const avg = mean(returns);
  const std = Math.sqrt(mean(returns.map((ret) => (ret - avg) ** 2))) || 1;

  return {
    startingBalance,
    endingBalance,
    totalReturnPct: ((endingBalance - startingBalance) / startingBalance) * 100,
    maxDrawdownPct: maxDrawdown * 100,
    winRatePct: (wins / Math.max(tradeRows.length, 1)) * 100,
    trades: tradeRows.length,
    flatCycles: rows.length - tradeRows.length,
    sharpe: (avg / std) * Math.sqrt(365 * 3),
  };
}
