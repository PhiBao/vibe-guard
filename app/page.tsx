"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProofCard, SymbolId } from "../lib/types";

type EvidenceSummary = {
  generatedAt: string;
  engine: string;
  mode: string;
  universe: SymbolId[];
  metrics: {
    startingBalance: number;
    endingBalance: number;
    totalReturnPct: number;
    maxDrawdownPct: number;
    winRatePct: number;
    trades: number;
    flatCycles: number;
    sharpe: number;
  };
  files: {
    report: string;
    summary: string;
    equityCurve: string;
    paperLog: string;
  };
};

type PaperLogRow = {
  timestamp: string;
  pair: string;
  side: string;
  price: string;
  size: string;
  balance_before: string;
  balance_after: string;
  pnl: string;
  fees: string;
  reason: string;
  proof_id: string;
};

const DEFAULT_PROMPT =
  "Evaluate BTC momentum, funding pressure, and volatility. Only record a paper futures order if the risk firewall passes.";

const starterProof: ProofCard = {
  id: "VG-DEMO-READY",
  createdAt: new Date().toISOString(),
  prompt: DEFAULT_PROMPT,
  symbol: "BTCUSDT",
  market: {
    symbol: "BTCUSDT",
    last: 104800,
    change24h: 1.82,
    fundingRate: 0.011,
    openInterest: 9600000000,
    bestBid: 104790,
    bestAsk: 104810,
    spreadBps: 1.91,
    depthImbalance: 0.18,
    recentTradeBias: 0.12,
    maxLeverage: 20,
    tickSize: 0.1,
    candles: [],
    source: "fallback",
    updatedAt: new Date().toISOString(),
  },
  toolTrace: [
    {
      module: "futures",
      tool: "futures_get_ticker",
      risk: "READ",
      status: "ok",
      summary: "Read Bitget USDT-FUTURES ticker.",
    },
    {
      module: "skill-hub",
      tool: "technical-analysis",
      risk: "READ",
      status: "ok",
      summary: "Computed technical perception from Bitget candles.",
    },
    {
      module: "risk-engine",
      tool: "simulated_order_guard",
      risk: "WRITE_BLOCKED",
      status: "blocked",
      summary: "Real order endpoint disabled; sim intent only.",
    },
  ],
  perception: [
    {
      skill: "technical-analysis",
      verdict: "bullish",
      confidence: 76,
      evidence: "Momentum is positive and price holds above the 24h mean.",
    },
    {
      skill: "sentiment-analyst",
      verdict: "mixed",
      confidence: 54,
      evidence: "Funding is elevated but not extreme.",
    },
    {
      skill: "market-intel",
      verdict: "bullish",
      confidence: 66,
      evidence: "Top-book depth leans bid-side in the demo snapshot.",
    },
  ],
  accountContext: {
    status: "missing_credentials",
    equityUSDT: null,
    availableUSDT: null,
    openPositions: 0,
    openOrders: 0,
    recentFills: 0,
    notes: ["Set read-only Bitget API env vars to sync account context."],
  },
  playbookEvidence: {
    status: "not_provided",
    strategyName: "Not imported",
    totalReturn: null,
    maxDrawdown: null,
    sharpe: null,
    winRate: null,
    source: "not_connected",
    notes: ["Paste GetAgent/Playbook metrics JSON to attach official backtest evidence."],
  },
  bitgetModulesUsed: [
    "Agent Hub futures market reads",
    "Agent Hub account read-only sync",
    "Skill Hub-style perception",
    "GetAgent/Playbook evidence import",
  ],
  signals: [
    {
      name: "Trend Engine",
      score: 0.64,
      confidence: 82,
      evidence: "EMA12 is above EMA48; trend pressure is positive.",
    },
    {
      name: "Funding Pressure",
      score: -0.18,
      confidence: 40,
      evidence: "Funding is elevated but not high enough to block long exposure.",
    },
    {
      name: "Volatility Regime",
      score: 0.22,
      confidence: 58,
      evidence: "Volatility is inside the operator risk envelope.",
    },
  ],
  riskChecks: [
    { name: "Notional Cap", status: "pass", detail: "Simulated size is below cap." },
    { name: "Leverage Cap", status: "pass", detail: "Leverage is inside mandate." },
    { name: "Volatility Breaker", status: "pass", detail: "No circuit breaker fired." },
  ],
  riskVerdict: "APPROVED_SIM",
  decision: {
    action: "LONG",
    confidence: 71,
    leverage: 3,
    notional: 3982,
    entry: 104800,
    stopLoss: 102914,
    takeProfit: 108194,
    rationale: "Signals agree enough to approve a paper order intent.",
  },
  backtest: {
    totalReturn: 4.82,
    maxDrawdown: -1.94,
    sharpe: 1.61,
    winRate: 66.7,
    trades: 12,
  },
  simulatedOrder: {
    clientOid: "VG-DEMO-READY-SIM",
    venue: "Bitget USDT-FUTURES",
    mode: "simulation",
    side: "buy",
    size: 0.038,
    status: "recorded",
  },
  auditTrail: [
    "Loaded Bitget futures market data or deterministic fallback.",
    "Scored independent strategy signals.",
    "Applied risk firewall before any order intent.",
    "Recorded paper order intent and backtest metrics.",
  ],
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value > 1000 ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function signalLabel(score: number) {
  if (score > 0.2) return "bull";
  if (score < -0.2) return "bear";
  return "neutral";
}

function parseCsv(text: string): PaperLogRow[] {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",") as Array<keyof PaperLogRow>;

  return lines
    .map((line) => {
      const values: string[] = [];
      let current = "";
      let quoted = false;

      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === '"' && quoted && next === '"') {
          current += '"';
          index += 1;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (char === "," && !quoted) {
          values.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current);

      return Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""]),
      ) as PaperLogRow;
    })
    .filter((row) => row.timestamp);
}

export default function Home() {
  const didAutoRun = useRef(false);
  const [symbol, setSymbol] = useState<SymbolId>("BTCUSDT");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [maxLeverage, setMaxLeverage] = useState(3);
  const [maxNotional, setMaxNotional] = useState(5000);
  const [dailyLossCap, setDailyLossCap] = useState(3);
  const [allowEventRisk, setAllowEventRisk] = useState(false);
  const [playbookEvidence, setPlaybookEvidence] = useState("");
  const [proof, setProof] = useState<ProofCard>(starterProof);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceSummary | null>(null);
  const [paperRows, setPaperRows] = useState<PaperLogRow[]>([]);

  const passCount = useMemo(
    () => proof.riskChecks.filter((check) => check.status === "pass").length,
    [proof],
  );
  const latestPaperRows = useMemo(() => paperRows.slice(-5).reverse(), [paperRows]);

  async function runAgent() {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol,
          prompt,
          maxLeverage,
          maxNotional,
          dailyLossCap,
          allowEventRisk,
          playbookEvidence,
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent run failed with ${response.status}`);
      }

      setProof((await response.json()) as ProofCard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown agent failure");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (didAutoRun.current) return;
    didAutoRun.current = true;
    void runAgent();
  }, []);

  useEffect(() => {
    async function loadEvidence() {
      try {
        const [summaryResponse, paperResponse] = await Promise.all([
          fetch("/evidence/backtest-summary.json", { cache: "no-store" }),
          fetch("/evidence/paper-trading-log.csv", { cache: "no-store" }),
        ]);
        if (summaryResponse.ok) {
          setEvidence((await summaryResponse.json()) as EvidenceSummary);
        }
        if (paperResponse.ok) {
          setPaperRows(parseCsv(await paperResponse.text()));
        }
      } catch {
        setEvidence(null);
        setPaperRows([]);
      }
    }

    void loadEvidence();
  }, []);

  async function copyProof() {
    const payload = {
      id: proof.id,
      symbol: proof.symbol,
      verdict: proof.riskVerdict,
      decision: proof.decision,
      metrics: proof.backtest,
      order: proof.simulatedOrder,
      modules: proof.bitgetModulesUsed,
      account: proof.accountContext,
      playbook: proof.playbookEvidence,
      trace: proof.toolTrace,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Bitget AI Base Camp S1 / Trading Agent</p>
          <h1>VibeGuard</h1>
          <p className="tagline">
            A regime-aware trading agent for Bitget futures. The MVP runs in paper mode so every
            signal, risk gate, trade intent, balance change, and backtest result is inspectable
            before guarded execution.
          </p>
        </div>
        <div className="heroStats">
          <div>
            <span>loop</span>
            <strong>perceive - decide - paper trade - prove</strong>
          </div>
          <div>
            <span>mode</span>
            <strong>paper-mode validation</strong>
          </div>
          <div>
            <span>evidence</span>
            <strong>CSV log + backtest report</strong>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel controls">
          <div className="panelHeader">
            <span className="dot" />
            <h2>Agent Mandate</h2>
          </div>

          <label>
            Symbol
            <select value={symbol} onChange={(event) => setSymbol(event.target.value as SymbolId)}>
              <option value="BTCUSDT">BTCUSDT perp</option>
              <option value="ETHUSDT">ETHUSDT perp</option>
              <option value="SOLUSDT">SOLUSDT perp</option>
            </select>
          </label>

          <label>
            Strategy Prompt
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>

          <div className="controlGrid">
            <label>
              Max Leverage
              <input
                type="number"
                min="1"
                max="10"
                value={maxLeverage}
                onChange={(event) => setMaxLeverage(Number(event.target.value))}
              />
            </label>
            <label>
              Max Notional
              <input
                type="number"
                min="100"
                max="50000"
                value={maxNotional}
                onChange={(event) => setMaxNotional(Number(event.target.value))}
              />
            </label>
            <label>
              Daily Loss Cap %
              <input
                type="number"
                min="0.5"
                max="20"
                step="0.5"
                value={dailyLossCap}
                onChange={(event) => setDailyLossCap(Number(event.target.value))}
              />
            </label>
          </div>

          <label className="toggle">
            <input
              type="checkbox"
              checked={allowEventRisk}
              onChange={(event) => setAllowEventRisk(event.target.checked)}
            />
            Allow event-risk windows
          </label>

          <label>
            Playbook Evidence JSON
            <textarea
              className="miniTextarea"
              placeholder='{"strategyName":"BTC adaptive regime","metrics":{"totalReturn":8.4,"maxDrawdown":-4.2,"sharpe":1.7,"winRate":62}}'
              value={playbookEvidence}
              onChange={(event) => setPlaybookEvidence(event.target.value)}
            />
          </label>

          <button className="runButton" onClick={runAgent} disabled={loading}>
            {loading ? "running agent cycle..." : "run proof cycle"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </aside>

        <section className="mainColumn">
          <section className="panel evidencePanel">
            <div className="panelHeader">
              <span className="dot" />
            <h2>Validation Center</h2>
            </div>
            <div className="evidenceGrid">
              <div>
                <span>Backtest Return</span>
                <strong>{evidence ? formatPct(evidence.metrics.totalReturnPct) : "loading"}</strong>
                <p>{evidence ? `${evidence.metrics.trades} trades / Sharpe ${formatNumber(evidence.metrics.sharpe)}` : "Run pnpm backtest to regenerate."}</p>
              </div>
              <div>
                <span>Paper Balance</span>
                <strong>{evidence ? formatUsd(evidence.metrics.endingBalance) : "loading"}</strong>
                <p>{paperRows.length} paper cycles in public CSV.</p>
              </div>
              <div>
                <span>Max Drawdown</span>
                <strong>{evidence ? formatPct(evidence.metrics.maxDrawdownPct) : "loading"}</strong>
                <p>Risk-gated strategy, 20% equity cap, 3x max leverage.</p>
              </div>
            </div>
            <div className="evidenceLinks">
              <a href="/evidence/paper-trading-log.csv">paper trading log</a>
              <a href="/evidence/backtest-report.md">backtest report</a>
              <a href="/evidence/backtest-summary.json">summary json</a>
              <a href="/evidence/equity-curve.csv">equity curve</a>
            </div>
            <div className="paperTableWrap">
              <table className="paperTable">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Pair</th>
                    <th>Side</th>
                    <th>Price</th>
                    <th>Size</th>
                    <th>Balance Change</th>
                  </tr>
                </thead>
                <tbody>
                  {latestPaperRows.map((row) => (
                    <tr key={row.proof_id}>
                      <td>{row.timestamp}</td>
                      <td>{row.pair}</td>
                      <td>{row.side}</td>
                      <td>{formatUsd(Number(row.price))}</td>
                      <td>{Number(row.size).toFixed(5)}</td>
                      <td>
                        {formatUsd(Number(row.balance_before))} {"->"} {formatUsd(Number(row.balance_after))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="panel proofHeader">
            <div>
              <p className="eyebrow">latest proof card</p>
              <h2>{proof.id}</h2>
            </div>
            <div className={`verdict ${proof.riskVerdict.toLowerCase()}`}>
              {proof.riskVerdict.replace("_", " ")}
            </div>
          </div>

          <div className="metricGrid">
            <div className="metric">
              <span>Market</span>
              <strong>{formatUsd(proof.market.last)}</strong>
              <em>{formatPct(proof.market.change24h)} 24h</em>
            </div>
            <div className="metric">
              <span>Decision</span>
              <strong>{proof.decision.action}</strong>
              <em>{proof.decision.confidence}% confidence</em>
            </div>
            <div className="metric">
              <span>Risk Gate</span>
              <strong>
                {passCount}/{proof.riskChecks.length}
              </strong>
              <em>checks passed</em>
            </div>
            <div className="metric">
              <span>Backtest</span>
              <strong>{formatPct(proof.backtest.totalReturn)}</strong>
              <em>{proof.backtest.trades} trades</em>
            </div>
            <div className="metric">
              <span>Tool Trace</span>
              <strong>{proof.toolTrace.length}</strong>
              <em>recorded reads</em>
            </div>
            <div className="metric">
              <span>Account</span>
              <strong>{proof.accountContext.status.replace("_", " ")}</strong>
              <em>{proof.accountContext.openPositions} positions</em>
            </div>
          </div>

          <section className="panel">
            <div className="panelHeader">
              <span className="dot" />
              <h2>Bitget Modules Used</h2>
            </div>
            <div className="moduleGrid">
              {proof.bitgetModulesUsed.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </section>

          <div className="split">
            <section className="panel">
              <div className="panelHeader">
                <span className="dot" />
                <h2>Signal Stack</h2>
              </div>
              <div className="signalList">
                {proof.signals.map((signal) => (
                  <article className="signal" key={signal.name}>
                    <div>
                      <strong>{signal.name}</strong>
                      <p>{signal.evidence}</p>
                    </div>
                    <div className={`signalBadge ${signalLabel(signal.score)}`}>
                      {signal.score.toFixed(2)}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panelHeader">
                <span className="dot" />
                <h2>Risk Firewall</h2>
              </div>
              <div className="riskList">
                {proof.riskChecks.map((check) => (
                  <article className="risk" key={check.name}>
                    <span className={check.status}>{check.status}</span>
                    <div>
                      <strong>{check.name}</strong>
                      <p>{check.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="split">
            <section className="panel">
              <div className="panelHeader">
                <span className="dot" />
                <h2>Skill Hub Perception</h2>
              </div>
              <div className="signalList">
                {proof.perception.map((item) => (
                  <article className="signal" key={item.skill}>
                    <div>
                      <strong>{item.skill}</strong>
                      <p>{item.evidence}</p>
                    </div>
                    <div className={`signalBadge ${item.verdict.includes("bull") || item.verdict === "risk-on" ? "bull" : item.verdict.includes("bear") || item.verdict === "risk-off" ? "bear" : "neutral"}`}>
                      {item.verdict}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panelHeader">
                <span className="dot" />
                <h2>Account + Playbook</h2>
              </div>
              <div className="orderGrid compact">
                <div>
                  <span>Read-only Account</span>
                  <strong>{proof.accountContext.status.replace("_", " ")}</strong>
                  <p>
                    Equity{" "}
                    {proof.accountContext.equityUSDT === null
                      ? "n/a"
                      : formatUsd(proof.accountContext.equityUSDT)}
                    , fills {proof.accountContext.recentFills}
                  </p>
                </div>
                <div>
                  <span>Playbook Evidence</span>
                  <strong>{proof.playbookEvidence.strategyName}</strong>
                  <p>
                    {proof.playbookEvidence.status === "imported"
                      ? `Return ${proof.playbookEvidence.totalReturn ?? "n/a"}%, Sharpe ${proof.playbookEvidence.sharpe ?? "n/a"}`
                      : proof.playbookEvidence.notes[0]}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <section className="panel orderPanel">
            <div className="panelHeader">
              <span className="dot" />
              <h2>Replayable Evidence</h2>
            </div>
            <div className="orderGrid">
              <div>
                <span>Paper Order Intent</span>
                <strong>{proof.simulatedOrder.clientOid}</strong>
                <p>
                  {proof.simulatedOrder.side.toUpperCase()} {proof.simulatedOrder.size}{" "}
                  {proof.symbol} / {proof.simulatedOrder.status}
                </p>
              </div>
              <div>
                <span>Risk-Adjusted Plan</span>
                <strong>
                  {proof.decision.leverage}x / {formatUsd(proof.decision.notional)}
                </strong>
                <p>
                  SL {formatUsd(proof.decision.stopLoss)} / TP{" "}
                  {formatUsd(proof.decision.takeProfit)}
                </p>
              </div>
              <div>
                <span>Backtest Quality</span>
                <strong>Sharpe {formatNumber(proof.backtest.sharpe)}</strong>
                <p>
                  Win {formatNumber(proof.backtest.winRate)}% / DD{" "}
                  {formatPct(proof.backtest.maxDrawdown)}
                </p>
              </div>
            </div>
            <p className="rationale">{proof.decision.rationale}</p>
            <ol className="audit">
              {proof.auditTrail.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <div className="traceList">
              {proof.toolTrace.slice(0, 10).map((item) => (
                <div className="trace" key={`${item.module}-${item.tool}-${item.summary}`}>
                  <span className={item.status}>{item.status}</span>
                  <strong>
                    {item.module}/{item.tool}
                  </strong>
                  <p>{item.summary}</p>
                </div>
              ))}
            </div>
            <button className="copyButton" onClick={copyProof}>
              {copied ? "proof json copied" : "copy proof json"}
            </button>
          </section>
        </section>
      </section>
    </main>
  );
}
