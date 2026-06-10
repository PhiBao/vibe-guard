import type { MarketSnapshot, PerceptionSignal, ToolTrace } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function closeSeries(market: MarketSnapshot) {
  return market.candles.map((candle) => candle.close);
}

export function buildPerception(market: MarketSnapshot): {
  perception: PerceptionSignal[];
  traces: ToolTrace[];
} {
  const closes = closeSeries(market);
  const last = closes.at(-1) ?? market.last;
  const previous = closes.at(-25) ?? closes[0] ?? market.last;
  const momentum = ((last - previous) / previous) * 100;
  const avgClose = mean(closes.slice(-24));
  const premium = ((last - avgClose) / avgClose) * 100;
  const crowding = Math.abs(market.fundingRate) + Math.abs(market.depthImbalance) * 0.05;
  const liquidityScore = clamp(100 - market.spreadBps * 10 + Math.abs(market.depthImbalance) * 20, 0, 100);

  const perception: PerceptionSignal[] = [
    {
      skill: "technical-analysis",
      verdict: momentum > 1 ? "bullish" : momentum < -1 ? "bearish" : "neutral",
      confidence: clamp(Math.abs(momentum) * 18 + 35, 35, 90),
      evidence: `24h momentum ${pct(momentum)}; price is ${pct(premium)} from the 24h mean.`,
    },
    {
      skill: "sentiment-analyst",
      verdict: crowding > 0.08 ? "risk-off" : market.recentTradeBias > 0.08 ? "risk-on" : "mixed",
      confidence: clamp(crowding * 650 + Math.abs(market.recentTradeBias) * 80 + 35, 35, 88),
      evidence: `Funding ${market.fundingRate.toFixed(4)}%, recent trade bias ${market.recentTradeBias.toFixed(2)}.`,
    },
    {
      skill: "market-intel",
      verdict: market.depthImbalance > 0.12 ? "bullish" : market.depthImbalance < -0.12 ? "bearish" : "neutral",
      confidence: clamp(Math.abs(market.depthImbalance) * 120 + 42, 42, 86),
      evidence: `Top-book depth imbalance ${market.depthImbalance.toFixed(2)} with spread ${market.spreadBps.toFixed(2)} bps.`,
    },
    {
      skill: "macro-analyst",
      verdict: Math.abs(market.change24h) > 4 ? "risk-off" : "mixed",
      confidence: clamp(Math.abs(market.change24h) * 10 + 38, 38, 84),
      evidence: `Macro proxy uses volatility and 24h move; current tape is ${pct(market.change24h)}.`,
    },
    {
      skill: "news-briefing",
      verdict: liquidityScore > 70 ? "risk-on" : liquidityScore < 35 ? "risk-off" : "mixed",
      confidence: clamp(liquidityScore, 35, 86),
      evidence: `News layer placeholder grounded by liquidity stress until external news MCP is configured.`,
    },
  ];

  return {
    perception,
    traces: perception.map((item) => ({
      module: "skill-hub",
      tool: item.skill,
      risk: "READ",
      status: market.source === "bitget" ? "ok" : "fallback",
      summary: item.evidence,
    })),
  };
}
