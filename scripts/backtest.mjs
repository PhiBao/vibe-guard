import { mkdir, writeFile } from "node:fs/promises";
import {
  DEFAULT_RISK,
  SYMBOLS,
  applyPaperTrade,
  chooseDecision,
  fetchCandles,
  metricSummary,
  rowsToCsv,
} from "./evidence-engine.mjs";

const outDir = new URL("../public/evidence/", import.meta.url);

async function main() {
  await mkdir(outDir, { recursive: true });

  const bundles = Object.fromEntries(
    await Promise.all(
      SYMBOLS.map(async (symbol) => {
        const bundle = await fetchCandles(symbol, 420);
        return [symbol, bundle];
      }),
    ),
  );
  const minLength = Math.min(...SYMBOLS.map((symbol) => bundles[symbol].candles.length));
  let balance = DEFAULT_RISK.startingBalance;
  let peak = DEFAULT_RISK.startingBalance;
  const rows = [];
  const curve = [];

  for (let cursor = 120; cursor < minLength - 8; cursor += 8) {
    const candleMap = Object.fromEntries(
      SYMBOLS.map((symbol) => [symbol, bundles[symbol].candles.slice(0, cursor)]),
    );
    const decision = chooseDecision(candleMap);
    const timestamp = new Date(bundles[decision.symbol].candles[cursor].time).toISOString();
    const exitPrice = bundles[decision.symbol].candles[Math.min(cursor + 8, minLength - 1)]?.close ?? null;
    const row = applyPaperTrade({
      decision,
      balance,
      timestamp,
      index: rows.length + 1,
      exitPrice,
    });
    balance = row.balance_after;
    peak = Math.max(peak, balance);
    rows.push(row);
    curve.push({
      timestamp,
      equity: balance,
      drawdown: Math.min(0, (balance - peak) / peak),
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    engine: "Regime-Adaptive Majors Rotation",
    mode: "reproducible_backtest",
    dataSources: Object.fromEntries(SYMBOLS.map((symbol) => [symbol, bundles[symbol].source])),
    universe: SYMBOLS,
    risk: DEFAULT_RISK,
    metrics: metricSummary(rows),
    files: {
      report: "/evidence/backtest-report.md",
      summary: "/evidence/backtest-summary.json",
      equityCurve: "/evidence/equity-curve.csv",
      paperLog: "/evidence/paper-trading-log.csv",
    },
  };

  const report = `# VibeGuard Backtest Report

Generated: ${summary.generatedAt}

## Strategy

Regime-Adaptive Majors Rotation trades BTCUSDT, ETHUSDT, and SOLUSDT perpetuals. Each cycle scores trend, mean reversion, funding pressure, volume confirmation, open-interest proxy, spread, and realized volatility. It stays flat when confidence or risk gates fail.

## Risk Rules

- Starting balance: ${DEFAULT_RISK.startingBalance} USDT
- Max equity per trade: ${(DEFAULT_RISK.maxEquityPct * 100).toFixed(0)}%
- Max leverage: ${DEFAULT_RISK.maxLeverage}x
- Estimated fee: ${(DEFAULT_RISK.feeRate * 100).toFixed(2)}%
- Minimum confidence: ${DEFAULT_RISK.minConfidence}

## Results

| Metric | Value |
| --- | ---: |
| Total return | ${summary.metrics.totalReturnPct.toFixed(2)}% |
| Ending balance | ${summary.metrics.endingBalance.toFixed(2)} USDT |
| Max drawdown | ${summary.metrics.maxDrawdownPct.toFixed(2)}% |
| Sharpe proxy | ${summary.metrics.sharpe.toFixed(2)} |
| Win rate | ${summary.metrics.winRatePct.toFixed(2)}% |
| Trades | ${summary.metrics.trades} |
| Flat cycles | ${summary.metrics.flatCycles} |

## Reproduce

\`\`\`bash
pnpm backtest
pnpm validate:evidence
\`\`\`

The generated CSV files are intentionally plain text so judges can inspect or rerun them without a notebook environment.
`;

  const paperColumns = [
    "timestamp",
    "pair",
    "side",
    "price",
    "size",
    "balance_before",
    "balance_after",
    "pnl",
    "fees",
    "reason",
    "proof_id",
  ];

  await writeFile(new URL("backtest-summary.json", outDir), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(new URL("backtest-report.md", outDir), report);
  await writeFile(new URL("equity-curve.csv", outDir), rowsToCsv(curve, ["timestamp", "equity", "drawdown"]));
  await writeFile(new URL("paper-trading-log.csv", outDir), rowsToCsv(rows, paperColumns));

  console.log(`Backtest generated ${rows.length} cycles, ${summary.metrics.trades} trades.`);
  console.log(`Total return: ${summary.metrics.totalReturnPct.toFixed(2)}%`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
