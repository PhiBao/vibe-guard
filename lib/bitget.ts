import { createHmac } from "crypto";
import type { AccountContext, SymbolId, ToolTrace } from "./types";

const BITGET_BASE_URL = "https://api.bitget.com";

type TraceResult<T> = {
  data: T | null;
  trace: ToolTrace;
};

function nowMs() {
  return Date.now();
}

function elapsed(start: number) {
  return Date.now() - start;
}

function trace(
  tool: string,
  status: ToolTrace["status"],
  summary: string,
  latencyMs?: number,
): ToolTrace {
  return {
    module: tool.startsWith("account") || tool.startsWith("futures_get_") && tool.includes("private")
      ? "account"
      : "futures",
    tool,
    risk: "READ",
    status,
    summary,
    latencyMs,
  };
}

export async function bitgetPublic<T>(
  tool: string,
  path: string,
): Promise<TraceResult<T>> {
  const start = nowMs();

  try {
    const response = await fetch(`${BITGET_BASE_URL}${path}`, {
      next: { revalidate: 20 },
      headers: { "user-agent": "vibeguard-hackathon-demo" },
    });

    if (!response.ok) {
      return {
        data: null,
        trace: trace(tool, "fallback", `HTTP ${response.status}; deterministic fallback used.`, elapsed(start)),
      };
    }

    return {
      data: (await response.json()) as T,
      trace: trace(tool, "ok", `Read ${path}`, elapsed(start)),
    };
  } catch {
    return {
      data: null,
      trace: trace(tool, "fallback", "Network unavailable; deterministic fallback used.", elapsed(start)),
    };
  }
}

function getCredentials() {
  const apiKey = process.env.BITGET_API_KEY;
  const secretKey = process.env.BITGET_SECRET_KEY;
  const passphrase = process.env.BITGET_PASSPHRASE;

  if (!apiKey || !secretKey || !passphrase) {
    return null;
  }

  return { apiKey, secretKey, passphrase };
}

async function bitgetPrivate<T>(
  tool: string,
  path: string,
): Promise<TraceResult<T>> {
  const start = nowMs();
  const credentials = getCredentials();

  if (!credentials) {
    return {
      data: null,
      trace: {
        module: "account",
        tool,
        risk: "READ",
        status: "unavailable",
        summary: "Read-only account sync skipped; Bitget API env vars are not set.",
      },
    };
  }

  try {
    const timestamp = String(Date.now());
    const method = "GET";
    const prehash = `${timestamp}${method}${path}`;
    const sign = createHmac("sha256", credentials.secretKey).update(prehash).digest("base64");
    const response = await fetch(`${BITGET_BASE_URL}${path}`, {
      headers: {
        "ACCESS-KEY": credentials.apiKey,
        "ACCESS-SIGN": sign,
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": credentials.passphrase,
        "Content-Type": "application/json",
        locale: "en-US",
      },
    });

    if (!response.ok) {
      return {
        data: null,
        trace: {
          module: "account",
          tool,
          risk: "READ",
          status: "unavailable",
          summary: `Read-only account sync failed with HTTP ${response.status}.`,
          latencyMs: elapsed(start),
        },
      };
    }

    return {
      data: (await response.json()) as T,
      trace: {
        module: "account",
        tool,
        risk: "READ",
        status: "ok",
        summary: `Read ${path}; no secrets stored in proof card.`,
        latencyMs: elapsed(start),
      },
    };
  } catch {
    return {
      data: null,
      trace: {
        module: "account",
        tool,
        risk: "READ",
        status: "unavailable",
        summary: "Read-only account sync failed; app continued with public data.",
        latencyMs: elapsed(start),
      },
    };
  }
}

function asArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item) => typeof item === "object" && item !== null);
  return [];
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAccountContext(symbol: SymbolId): Promise<{
  accountContext: AccountContext;
  traces: ToolTrace[];
}> {
  const [assets, positions, orders, fills] = await Promise.all([
    bitgetPrivate<{ data?: unknown }>(
      "account_get_assets",
      "/api/v2/mix/account/accounts?productType=USDT-FUTURES",
    ),
    bitgetPrivate<{ data?: unknown }>(
      "futures_get_positions",
      `/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT`,
    ),
    bitgetPrivate<{ data?: unknown }>(
      "futures_get_orders",
      `/api/v2/mix/order/orders-pending?productType=USDT-FUTURES&symbol=${symbol}`,
    ),
    bitgetPrivate<{ data?: unknown }>(
      "futures_get_fills",
      `/api/v2/mix/order/fill-history?productType=USDT-FUTURES&symbol=${symbol}&limit=20`,
    ),
  ]);

  const assetRows = asArray(assets.data?.data);
  const usdtAccount = assetRows.find((row) => row.marginCoin === "USDT") ?? assetRows[0];
  const positionRows = asArray(positions.data?.data);
  const orderRows = asArray(orders.data?.data);
  const fillRows = asArray(fills.data?.data);
  const anyConnected = [assets, positions, orders, fills].some((item) => item.trace.status === "ok");
  const missingCredentials = [assets, positions, orders, fills].every((item) =>
    item.trace.summary.includes("env vars are not set"),
  );
  const anyUnavailable = [assets, positions, orders, fills].some(
    (item) => item.trace.status === "unavailable",
  );

  return {
    accountContext: {
      status: anyConnected
        ? "connected_readonly"
        : missingCredentials
          ? "missing_credentials"
          : anyUnavailable
          ? "unavailable"
          : "missing_credentials",
      equityUSDT: usdtAccount ? num(usdtAccount.accountEquity ?? usdtAccount.equity) : null,
      availableUSDT: usdtAccount ? num(usdtAccount.available ?? usdtAccount.usdtEquity) : null,
      openPositions: positionRows.filter((row) => num(row.total ?? row.size) !== 0).length,
      openOrders: orderRows.length,
      recentFills: fillRows.length,
      notes: anyConnected
        ? ["Read-only account context included; no write endpoints called."]
        : ["Set BITGET_API_KEY, BITGET_SECRET_KEY, and BITGET_PASSPHRASE for private read-only sync."],
    },
    traces: [assets.trace, positions.trace, orders.trace, fills.trace],
  };
}
