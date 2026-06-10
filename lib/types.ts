export type SymbolId = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";

export type RiskProfile = {
  maxLeverage: number;
  maxNotional: number;
  dailyLossCap: number;
  allowEventRisk: boolean;
};

export type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketSnapshot = {
  symbol: SymbolId;
  last: number;
  change24h: number;
  fundingRate: number;
  openInterest: number;
  bestBid: number;
  bestAsk: number;
  spreadBps: number;
  depthImbalance: number;
  recentTradeBias: number;
  maxLeverage: number;
  tickSize: number;
  candles: MarketCandle[];
  source: "bitget" | "fallback";
  updatedAt: string;
};

export type ToolTrace = {
  module: "futures" | "account" | "skill-hub" | "playbook" | "risk-engine";
  tool: string;
  risk: "READ" | "SIMULATION" | "WRITE_BLOCKED";
  status: "ok" | "fallback" | "unavailable" | "blocked";
  summary: string;
  latencyMs?: number;
};

export type PerceptionSignal = {
  skill: "technical-analysis" | "sentiment-analyst" | "macro-analyst" | "market-intel" | "news-briefing";
  verdict: "bullish" | "bearish" | "neutral" | "risk-off" | "risk-on" | "mixed";
  confidence: number;
  evidence: string;
};

export type AccountContext = {
  status: "connected_readonly" | "missing_credentials" | "unavailable";
  equityUSDT: number | null;
  availableUSDT: number | null;
  openPositions: number;
  openOrders: number;
  recentFills: number;
  notes: string[];
};

export type PlaybookEvidence = {
  status: "imported" | "key_configured" | "not_provided";
  strategyName: string;
  totalReturn: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
  winRate: number | null;
  source: "manual_import" | "not_connected";
  notes: string[];
};

export type StrategySignal = {
  name: string;
  score: number;
  confidence: number;
  evidence: string;
};

export type RiskCheck = {
  name: string;
  status: "pass" | "warn" | "block";
  detail: string;
};

export type TradeDecision = {
  action: "LONG" | "SHORT" | "FLAT";
  confidence: number;
  leverage: number;
  notional: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  rationale: string;
};

export type BacktestMetrics = {
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
  trades: number;
};

export type ProofCard = {
  id: string;
  createdAt: string;
  prompt: string;
  symbol: SymbolId;
  market: MarketSnapshot;
  toolTrace: ToolTrace[];
  perception: PerceptionSignal[];
  accountContext: AccountContext;
  playbookEvidence: PlaybookEvidence;
  bitgetModulesUsed: string[];
  signals: StrategySignal[];
  riskChecks: RiskCheck[];
  riskVerdict: "APPROVED_SIM" | "BLOCKED" | "FLAT_ONLY";
  decision: TradeDecision;
  backtest: BacktestMetrics;
  simulatedOrder: {
    clientOid: string;
    venue: "Bitget USDT-FUTURES";
    mode: "simulation";
    side: "buy" | "sell" | "none";
    size: number;
    status: "recorded" | "not_sent";
  };
  auditTrail: string[];
};
