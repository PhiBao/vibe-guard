# VibeGuard

Proof-of-strategy trading agent for the Bitget AI Base Camp Hackathon.

VibeGuard is a runnable Trading Agent MVP that turns each strategy cycle into a replayable proof card: Bitget Agent Hub reads, Skill Hub-style perception, account context, risk-firewall verdict, simulated order intent, Playbook evidence, and backtest metrics.

## Why This Exists

Autonomous trading agents have a trust problem. Traders do not only need a signal; they need to know why the agent acted, what risk gates fired, and whether the result can be replayed later.

VibeGuard is built around that wedge:

- complete loop: perception -> decision -> risk management -> simulated execution
- no real funds required
- Bitget futures market-data path with deterministic fallback for demos
- Agent Hub-style traces for futures market, account read-only, Skill Hub perception, and Playbook evidence
- proof cards that can be copied into a submission, post, or audit log
- honest evidence: if the simulated strategy loses money, the proof card shows that instead of hiding it

## Hackathon Fit

Track: **Trading Agent**

Judging evidence:

- runnable public demo
- complete strategy loop
- backtest/sim trading records
- clear answer to the problem it solves
- Bitget-native market context

## MVP Features

- BTC/ETH/SOL USDT futures agent cycle
- strategy signal stack:
  - trend engine
  - mean reversion
  - funding pressure
  - volume confirmation
  - narrative tape
  - volatility regime
- Bitget integration stack:
  - futures market reads: ticker, candles, depth, trades, contracts, funding, open interest
  - optional account read-only sync: assets, positions, open orders, fills
  - Skill Hub-style perception: technical, sentiment, market-intel, macro, news
  - GetAgent/Playbook key detection plus evidence import via JSON paste
- risk firewall:
  - notional cap
  - leverage cap
  - funding spike check
  - volatility breaker
  - macro/event setting
  - daily loss cap
- simulation-only order recorder
- proof JSON copy button
- responsive terminal UI

## Run Locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Copy `.env.example` to `.env.local` if you want optional read-only Bitget account context.

## Verification

```bash
pnpm typecheck
pnpm build
```

## Demo Video

Use [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) to record a submission video under 3 minutes.

## Safety Notes

VibeGuard does not send real orders. The current MVP records simulated Bitget USDT-FUTURES order intents only. It never calls transfer, withdrawal, leverage update, margin, copy-trade write, or real order endpoints. Real execution should remain disabled until API keys, account permissions, operator mandates, kill switches, and audit logging are complete.

Optional read-only account sync uses server-side environment variables:

```bash
BITGET_API_KEY=
BITGET_SECRET_KEY=
BITGET_PASSPHRASE=
```

These credentials are never returned in proof JSON.

Optional Playbook key:

```bash
PLAYBOOK_API_KEY=
```

The hackathon docs describe Playbook usage through the Bitget website/GetAgent skill flow, not a stable app HTTP API. VibeGuard detects `PLAYBOOK_API_KEY`, but proof metrics still need to be pasted into the Playbook Evidence JSON box after you create/publish/backtest the strategy.
