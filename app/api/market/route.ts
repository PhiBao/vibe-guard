import { NextResponse } from "next/server";
import { getMarketSnapshot } from "../../../lib/market";
import type { SymbolId } from "../../../lib/types";

function parseSymbol(value: string | null): SymbolId {
  if (value === "ETHUSDT" || value === "SOLUSDT") return value;
  return "BTCUSDT";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = parseSymbol(searchParams.get("symbol"));
  const market = await getMarketSnapshot(symbol);

  return NextResponse.json(market);
}
