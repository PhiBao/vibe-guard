import type {
  AccountContext,
  BacktestMetrics,
  MarketCandle,
  MarketSnapshot,
  PerceptionSignal,
  PlaybookEvidence,
  ProofCard,
  RiskCheck,
  RiskProfile,
  StrategySignal,
  SymbolId,
  ToolTrace,
  TradeDecision,
} from "./types";

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  return values.reduce((prev, value, index) => {
    if (index === 0) return value;
    return value * k + prev * (1 - k);
  }, values[0] ?? 0);
}

function rsi(values: number[], period = 14) {
  const recent = values.slice(-period - 1);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < recent.length; i += 1) {
    const delta = recent[i] - recent[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function volatility(candles: MarketCandle[]) {
  const closes = candles.map((candle) => candle.close);
  const returns = closes.slice(1).map((close, index) => (close - closes[index]) / closes[index]);
  const avg = mean(returns);
  const variance = mean(returns.map((ret) => (ret - avg) ** 2));
  return Math.sqrt(variance) * Math.sqrt(24) * 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function buildSignals(market: MarketSnapshot, perception: PerceptionSignal[]): StrategySignal[] {
  const closes = market.candles.map((candle) => candle.close);
  const last = closes.at(-1) ?? market.last;
  const ema12 = ema(closes.slice(-36), 12);
  const ema48 = ema(closes.slice(-72), 48);
  const currentRsi = rsi(closes);
  const last24 = closes.slice(-24);
  const mid = mean(last24);
  const vol = volatility(market.candles);
  const volumeNow = market.candles.at(-1)?.volume ?? 0;
  const avgVolume = mean(market.candles.slice(-24).map((candle) => candle.volume));

  const trendScore = clamp(((ema12 - ema48) / last) * 1400, -1, 1);
  const reversionScore = clamp(((mid - last) / last) * 50, -1, 1);
  const fundingScore = clamp(-market.fundingRate / 0.06, -1, 1);
  const volumeScore = clamp((volumeNow / Math.max(avgVolume, 1) - 1) * Math.sign(trendScore), -1, 1);
  const sentimentScore = clamp(market.change24h / 7, -1, 1);
  const depthScore = clamp(market.depthImbalance * 2 + market.recentTradeBias, -1, 1);
  const perceptionScore = clamp(
    mean(
      perception.map((item) => {
        if (item.verdict === "bullish" || item.verdict === "risk-on") return item.confidence / 100;
        if (item.verdict === "bearish" || item.verdict === "risk-off") return -item.confidence / 100;
        return 0;
      }),
    ),
    -1,
    1,
  );

  return [
    {
      name: "Trend Engine",
      score: trendScore,
      confidence: clamp(Math.abs(trendScore) * 92, 30, 92),
      evidence: `EMA12 ${ema12.toFixed(2)} vs EMA48 ${ema48.toFixed(2)} on ${market.symbol}.`,
    },
    {
      name: "Mean Reversion",
      score: reversionScore,
      confidence: clamp(Math.abs(50 - currentRsi) * 2, 24, 88),
      evidence: `RSI ${currentRsi.toFixed(1)} with price ${pct(((last - mid) / mid) * 100)} from 24h mean.`,
    },
    {
      name: "Funding Pressure",
      score: fundingScore,
      confidence: clamp(Math.abs(fundingScore) * 90, 20, 90),
      evidence: `Funding ${market.fundingRate.toFixed(4)}%; high positive funding penalizes longs.`,
    },
    {
      name: "Volume Confirmation",
      score: volumeScore,
      confidence: clamp(Math.abs(volumeScore) * 80, 22, 84),
      evidence: `Latest volume is ${(volumeNow / Math.max(avgVolume, 1)).toFixed(2)}x the 24h candle average.`,
    },
    {
      name: "Order Book Pressure",
      score: depthScore,
      confidence: clamp(Math.abs(depthScore) * 78, 24, 86),
      evidence: `Depth imbalance ${market.depthImbalance.toFixed(2)}, trade bias ${market.recentTradeBias.toFixed(2)}, spread ${market.spreadBps.toFixed(2)} bps.`,
    },
    {
      name: "Narrative Tape",
      score: clamp((sentimentScore + perceptionScore) / 2, -1, 1),
      confidence: clamp(Math.abs(sentimentScore + perceptionScore) * 48, 28, 88),
      evidence: `24h tape ${pct(market.change24h)} plus Skill Hub perception score ${perceptionScore.toFixed(2)}.`,
    },
    {
      name: "Volatility Regime",
      score: vol > 6 ? -0.35 : 0.22,
      confidence: clamp(vol * 10, 35, 90),
      evidence: `Realized 24h volatility proxy is ${vol.toFixed(2)}%; high volatility reduces leverage.`,
    },
  ];
}

function decide(market: MarketSnapshot, signals: StrategySignal[], risk: RiskProfile): TradeDecision {
  const weightedScore = mean(signals.map((signal) => signal.score * (signal.confidence / 100)));
  const agreement = signals.filter((signal) => Math.sign(signal.score) === Math.sign(weightedScore)).length;
  const conviction = mean(signals.map((signal) => Math.abs(signal.score) * (signal.confidence / 100)));
  const confidence = clamp(conviction * 90 + agreement * 6, 0, 96);
  const action = confidence < 42 ? "FLAT" : weightedScore > 0 ? "LONG" : "SHORT";
  const vol = volatility(market.candles);
  const leverage =
    action === "FLAT" ? 0 : clamp(Math.floor(5 - vol / 2), 1, Math.min(risk.maxLeverage, market.maxLeverage));
  const notional = action === "FLAT" ? 0 : Math.min(risk.maxNotional, 1000 + confidence * 42);
  const stopDistance = clamp(vol / 100, 0.012, 0.045);
  const takeDistance = stopDistance * 1.8;

  return {
    action,
    confidence: Math.round(confidence),
    leverage,
    notional: Math.round(notional),
    entry: market.last,
    stopLoss:
      action === "SHORT" ? market.last * (1 + stopDistance) : market.last * (1 - stopDistance),
    takeProfit:
      action === "SHORT" ? market.last * (1 - takeDistance) : market.last * (1 + takeDistance),
    rationale:
      action === "FLAT"
        ? "Signal quality is below the execution threshold, so the agent records a no-trade decision."
        : `${agreement}/6 signals agree; the agent sizes down through the risk firewall before sim execution.`,
  };
}

function riskFirewall(
  market: MarketSnapshot,
  decision: TradeDecision,
  risk: RiskProfile,
  account: AccountContext,
  playbook: PlaybookEvidence,
): RiskCheck[] {
  const vol = volatility(market.candles);
  const notionalVsEquity =
    account.equityUSDT && decision.notional > 0 ? (decision.notional / account.equityUSDT) * 100 : null;
  const checks: RiskCheck[] = [
    {
      name: "Notional Cap",
      status: decision.notional <= risk.maxNotional ? "pass" : "block",
      detail: `${decision.notional} USDT requested vs ${risk.maxNotional} USDT cap.`,
    },
    {
      name: "Leverage Cap",
      status: decision.leverage <= risk.maxLeverage && decision.leverage <= market.maxLeverage ? "pass" : "block",
      detail: `${decision.leverage}x requested vs mandate ${risk.maxLeverage}x and Bitget contract max ${market.maxLeverage}x.`,
    },
    {
      name: "Account Exposure",
      status: notionalVsEquity === null || notionalVsEquity < 35 ? "pass" : notionalVsEquity < 60 ? "warn" : "block",
      detail:
        notionalVsEquity === null
          ? "Read-only account equity unavailable; using mandate cap only."
          : `Sim notional is ${notionalVsEquity.toFixed(1)}% of read-only account equity.`,
    },
    {
      name: "Funding Spike",
      status: Math.abs(market.fundingRate) > 0.08 ? "warn" : "pass",
      detail: `Current funding is ${market.fundingRate.toFixed(4)}%.`,
    },
    {
      name: "Volatility Breaker",
      status: vol > 9 ? "block" : vol > 6 ? "warn" : "pass",
      detail: `Volatility proxy is ${vol.toFixed(2)}%.`,
    },
    {
      name: "Macro/Event Blackout",
      status: risk.allowEventRisk ? "warn" : "pass",
      detail: risk.allowEventRisk
        ? "Event risk is allowed by operator setting."
        : "Event blackout enabled; no high-impact event simulated in this run.",
    },
    {
      name: "Daily Loss Cap",
      status: risk.dailyLossCap < 2 ? "warn" : "pass",
      detail: `Daily loss cap is ${risk.dailyLossCap.toFixed(1)}%.`,
    },
    {
      name: "Playbook Evidence",
      status:
        playbook.status === "imported" && playbook.maxDrawdown !== null && playbook.maxDrawdown < -25
          ? "warn"
          : "pass",
      detail:
        playbook.status === "imported"
          ? `${playbook.strategyName}: return ${playbook.totalReturn ?? "n/a"}%, Sharpe ${playbook.sharpe ?? "n/a"}, max DD ${playbook.maxDrawdown ?? "n/a"}%.`
          : "No Playbook evidence imported; local backtest remains the proof source.",
    },
  ];

  if (decision.action === "FLAT") {
    checks.push({
      name: "Execution Threshold",
      status: "warn",
      detail: "Confidence below threshold; sim order is intentionally not sent.",
    });
  }

  return checks;
}

function runBacktest(candles: MarketCandle[], decision: TradeDecision): BacktestMetrics {
  if (decision.action === "FLAT") {
    return {
      totalReturn: 0,
      maxDrawdown: 0,
      sharpe: 0,
      winRate: 0,
      trades: 0,
    };
  }

  const direction = decision.action === "LONG" ? 1 : -1;
  const closes = candles.map((candle) => candle.close);
  const returns = closes.slice(1).map((close, index) => ((close - closes[index]) / closes[index]) * direction);
  const chunkSize = 8;
  const tradeReturns: number[] = [];

  for (let index = 0; index < returns.length; index += chunkSize) {
    tradeReturns.push(returns.slice(index, index + chunkSize).reduce((sum, ret) => sum + ret, 0));
  }

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  const curve = tradeReturns.map((ret) => {
    equity *= 1 + ret * Math.max(decision.leverage, 1);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, (equity - peak) / peak);
    return equity;
  });
  const tradeMean = mean(tradeReturns);
  const tradeStd = Math.sqrt(mean(tradeReturns.map((ret) => (ret - tradeMean) ** 2))) || 1;

  return {
    totalReturn: ((curve.at(-1) ?? 1) - 1) * 100,
    maxDrawdown: maxDrawdown * 100,
    sharpe: (tradeMean / tradeStd) * Math.sqrt(365 * 3),
    winRate: (tradeReturns.filter((ret) => ret > 0).length / Math.max(tradeReturns.length, 1)) * 100,
    trades: tradeReturns.length,
  };
}

function makeId(symbol: SymbolId, createdAt: string) {
  return `VG-${symbol}-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

export function buildProofCard(
  prompt: string,
  market: MarketSnapshot,
  risk: RiskProfile,
  accountContext: AccountContext,
  perception: PerceptionSignal[],
  playbookEvidence: PlaybookEvidence,
  toolTrace: ToolTrace[],
): ProofCard {
  const createdAt = new Date().toISOString();
  const signals = buildSignals(market, perception);
  const decision = decide(market, signals, risk);
  const riskChecks = riskFirewall(market, decision, risk, accountContext, playbookEvidence);
  const blocked = riskChecks.some((check) => check.status === "block");
  const backtest = runBacktest(market.candles, blocked ? { ...decision, action: "FLAT" } : decision);
  const id = makeId(market.symbol, createdAt);
  const size = decision.notional > 0 ? decision.notional / decision.entry : 0;
  const side = decision.action === "LONG" ? "buy" : decision.action === "SHORT" ? "sell" : "none";

  return {
    id,
    createdAt,
    prompt,
    symbol: market.symbol,
    market,
    toolTrace: [
      ...toolTrace,
      {
        module: "risk-engine",
        tool: "simulated_order_guard",
        risk: "WRITE_BLOCKED",
        status: "blocked",
        summary: "Real Bitget write endpoints are intentionally disabled; only sim order intent is recorded.",
      },
    ],
    perception,
    accountContext,
    playbookEvidence,
    bitgetModulesUsed: [
      "Agent Hub futures: ticker, depth, candles, trades, contracts, funding, open interest",
      "Agent Hub account: assets, positions, open orders, fills (read-only when credentials exist)",
      "Skill Hub-style perception: technical, sentiment, macro, market-intel, news",
      "GetAgent/Playbook: manual backtest evidence import",
    ],
    signals,
    riskChecks,
    riskVerdict: blocked ? "BLOCKED" : decision.action === "FLAT" ? "FLAT_ONLY" : "APPROVED_SIM",
    decision,
    backtest,
    simulatedOrder: {
      clientOid: `${id}-SIM`,
      venue: "Bitget USDT-FUTURES",
      mode: "simulation",
      side,
      size: Number(size.toFixed(5)),
      status: blocked || decision.action === "FLAT" ? "not_sent" : "recorded",
    },
    auditTrail: [
      "Loaded Bitget Agent Hub futures reads with traceable tool evidence.",
      "Merged Skill Hub-style perception with local strategy signals.",
      "Optionally synced read-only account context without storing secrets.",
      "Generated trade decision from weighted signal agreement.",
      "Applied risk firewall before any order intent and blocked real write endpoints.",
      "Recorded simulation-only order and backtest metrics for replay.",
    ],
  };
}
