import type { PlaybookEvidence, ToolTrace } from "./types";

function cleanNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePlaybookEvidence(raw: unknown): {
  playbookEvidence: PlaybookEvidence;
  trace: ToolTrace;
} {
  const hasPlaybookKey = Boolean(process.env.PLAYBOOK_API_KEY);

  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      playbookEvidence: {
        status: hasPlaybookKey ? "key_configured" : "not_provided",
        strategyName: hasPlaybookKey ? "Playbook key configured" : "Not imported",
        totalReturn: null,
        maxDrawdown: null,
        sharpe: null,
        winRate: null,
        source: "not_connected",
        notes: [
          hasPlaybookKey
            ? "PLAYBOOK_API_KEY is present. The hackathon docs expose Playbook through GetAgent/website flow, so paste metrics JSON after publishing/backtesting."
            : "Paste GetAgent/Playbook metrics JSON to attach official backtest evidence.",
        ],
      },
      trace: {
        module: "playbook",
        tool: "getagent_playbook_import",
        risk: "READ",
        status: hasPlaybookKey ? "ok" : "unavailable",
        summary: hasPlaybookKey
          ? "PLAYBOOK_API_KEY detected; waiting for Playbook metrics import because no stable HTTP API contract is configured."
          : "No Playbook evidence imported for this run.",
      },
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const metrics =
      typeof parsed.metrics === "object" && parsed.metrics !== null
        ? (parsed.metrics as Record<string, unknown>)
        : parsed;

    return {
      playbookEvidence: {
        status: "imported",
        strategyName:
          typeof parsed.strategyName === "string"
            ? parsed.strategyName
            : typeof parsed.name === "string"
              ? parsed.name
              : "Imported Playbook Strategy",
        totalReturn: cleanNumber(metrics.totalReturn ?? metrics.pnl ?? metrics.return),
        maxDrawdown: cleanNumber(metrics.maxDrawdown ?? metrics.drawdown),
        sharpe: cleanNumber(metrics.sharpe ?? metrics.sharpeRatio),
        winRate: cleanNumber(metrics.winRate ?? metrics.win_rate),
        source: "manual_import",
        notes: ["Manual import avoids storing Playbook API keys in the web app."],
      },
      trace: {
        module: "playbook",
        tool: "getagent_playbook_import",
        risk: "READ",
        status: "ok",
        summary: "Imported Playbook/GetAgent backtest metrics into proof card.",
      },
    };
  } catch {
    return {
      playbookEvidence: {
        status: "not_provided",
        strategyName: "Invalid Playbook JSON",
        totalReturn: null,
        maxDrawdown: null,
        sharpe: null,
        winRate: null,
        source: "not_connected",
        notes: ["Playbook evidence was not valid JSON; run continued without it."],
      },
      trace: {
        module: "playbook",
        tool: "getagent_playbook_import",
        risk: "READ",
        status: "fallback",
        summary: "Playbook evidence JSON parse failed; local backtest used.",
      },
    };
  }
}
