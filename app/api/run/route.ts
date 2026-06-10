import { NextResponse } from "next/server";
import { getAccountContext } from "../../../lib/bitget";
import { getMarketBundle } from "../../../lib/market";
import { buildPerception } from "../../../lib/perception";
import { parsePlaybookEvidence } from "../../../lib/playbook";
import { buildProofCard } from "../../../lib/strategy";
import type { RiskProfile, SymbolId } from "../../../lib/types";

const DEFAULT_RISK: RiskProfile = {
  maxLeverage: 3,
  maxNotional: 5000,
  dailyLossCap: 3,
  allowEventRisk: false,
};

function isSymbol(value: unknown): value is SymbolId {
  return value === "BTCUSDT" || value === "ETHUSDT" || value === "SOLUSDT";
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const symbol = isSymbol(body.symbol) ? body.symbol : "BTCUSDT";
  const prompt =
    typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim().slice(0, 280)
      : "Run a Bitget futures strategy cycle and prove the decision.";

  const risk: RiskProfile = {
    maxLeverage: numberInRange(body.maxLeverage, DEFAULT_RISK.maxLeverage, 1, 10),
    maxNotional: numberInRange(body.maxNotional, DEFAULT_RISK.maxNotional, 100, 50000),
    dailyLossCap: numberInRange(body.dailyLossCap, DEFAULT_RISK.dailyLossCap, 0.5, 20),
    allowEventRisk: body.allowEventRisk === true,
  };

  const [{ market, traces: marketTraces }, { accountContext, traces: accountTraces }] =
    await Promise.all([getMarketBundle(symbol), getAccountContext(symbol)]);
  const { perception, traces: perceptionTraces } = buildPerception(market);
  const { playbookEvidence, trace: playbookTrace } = parsePlaybookEvidence(body.playbookEvidence);
  const proof = buildProofCard(prompt, market, risk, accountContext, perception, playbookEvidence, [
    ...marketTraces,
    ...accountTraces,
    ...perceptionTraces,
    playbookTrace,
  ]);

  return NextResponse.json(proof);
}
