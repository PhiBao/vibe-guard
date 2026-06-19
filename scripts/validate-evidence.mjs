import { readFile } from "node:fs/promises";

const evidenceDir = new URL("../public/evidence/", import.meta.url);
const requiredColumns = [
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

async function exists(path) {
  try {
    return await readFile(new URL(path, evidenceDir), "utf8");
  } catch {
    throw new Error(`Missing evidence artifact: public/evidence/${path}`);
  }
}

async function main() {
  const [summaryRaw, reportRaw, csvRaw] = await Promise.all([
    exists("backtest-summary.json"),
    exists("backtest-report.md"),
    exists("paper-trading-log.csv"),
  ]);
  const summary = JSON.parse(summaryRaw);
  const header = csvRaw.split(/\r?\n/, 1)[0]?.split(",") ?? [];
  const missing = requiredColumns.filter((column) => !header.includes(column));

  if (missing.length > 0) {
    throw new Error(`paper-trading-log.csv missing columns: ${missing.join(", ")}`);
  }
  if (!summary.metrics || typeof summary.metrics.totalReturnPct !== "number") {
    throw new Error("backtest-summary.json missing numeric metrics.totalReturnPct");
  }
  if (!reportRaw.includes("Regime-Adaptive Majors Rotation")) {
    throw new Error("backtest-report.md missing strategy description");
  }
  if (csvRaw.trim().split(/\r?\n/).length < 2) {
    throw new Error("paper-trading-log.csv has no rows");
  }

  console.log("Evidence artifacts validated.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
