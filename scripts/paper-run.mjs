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

function readCycles() {
  const raw = process.argv.find((arg) => arg.startsWith("--cycles="));
  const parsed = Number(raw?.split("=")[1] ?? process.argv[process.argv.indexOf("--cycles") + 1]);
  return Number.isFinite(parsed) ? Math.min(80, Math.max(5, Math.floor(parsed))) : 20;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const cycles = readCycles();
  const bundles = Object.fromEntries(
    await Promise.all(
      SYMBOLS.map(async (symbol) => {
        const bundle = await fetchCandles(symbol, Math.max(180, cycles + 140));
        return [symbol, bundle];
      }),
    ),
  );
  const minLength = Math.min(...SYMBOLS.map((symbol) => bundles[symbol].candles.length));
  const start = Math.max(120, minLength - cycles);
  let balance = DEFAULT_RISK.startingBalance;
  const rows = [];

  for (let cursor = start; cursor < minLength; cursor += 1) {
    const candleMap = Object.fromEntries(
      SYMBOLS.map((symbol) => [symbol, bundles[symbol].candles.slice(0, cursor)]),
    );
    const decision = chooseDecision(candleMap);
    const timestamp = new Date(bundles[decision.symbol].candles[cursor].time).toISOString();
    const exitPrice = bundles[decision.symbol].candles[cursor]?.close ?? null;
    const row = applyPaperTrade({
      decision,
      balance,
      timestamp,
      index: rows.length + 1,
      exitPrice,
    });
    balance = row.balance_after;
    rows.push(row);
  }

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
  const payload = {
    generatedAt: new Date().toISOString(),
    mode: "paper_trading_log",
    cycles: rows.length,
    dataSources: Object.fromEntries(SYMBOLS.map((symbol) => [symbol, bundles[symbol].source])),
    metrics: metricSummary(rows),
    rows,
  };

  await writeFile(new URL("paper-runs.json", outDir), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(new URL("paper-trading-log.csv", outDir), rowsToCsv(rows, paperColumns));

  console.log(`Paper run generated ${rows.length} cycles.`);
  console.log(`Ending balance: ${payload.metrics.endingBalance.toFixed(2)} USDT`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
