# VibeGuard

Evidence-first paper trading agent for the Bitget AI Base Camp Hackathon, Track 1 Trading Agent.

VibeGuard trades a paper account across BTCUSDT, ETHUSDT, and SOLUSDT perpetuals, then publishes the evidence judges asked for: timestamp, pair, side, price, size, balance change, risk rationale, and a reproducible backtest report.

## Idea

Autonomous trading agents have a trust problem. A judge, trader, or future user should not need to believe a black-box prompt. They should be able to inspect the market inputs, strategy logic, risk gates, paper fills, balance changes, and replayable proof card.

VibeGuard's strategy is **Regime-Adaptive Majors Rotation**:

- trade only liquid Bitget USDT futures majors: BTCUSDT, ETHUSDT, SOLUSDT
- score trend with EMA momentum
- score mean reversion with RSI and 24h distance from mean
- penalize crowded funding
- confirm with volume and open-interest proxy
- stay flat when confidence, volatility, spread, or risk gates fail
- cap exposure at 20% account equity and 3x max leverage

The core logic is not "AI predicts price." The agent compresses multiple market regimes into a decision, then refuses to trade unless the risk firewall accepts the setup.

## Evidence

Generated artifacts are public files in [`public/evidence`](./public/evidence):

- [paper-trading-log.csv](./public/evidence/paper-trading-log.csv) - required paper trading log with timestamp, pair, side, price, size, and balance changes
- [backtest-report.md](./public/evidence/backtest-report.md) - reproducible backtest report
- [backtest-summary.json](./public/evidence/backtest-summary.json) - machine-readable metrics
- [equity-curve.csv](./public/evidence/equity-curve.csv) - equity curve for review
- [paper-runs.json](./public/evidence/paper-runs.json) - detailed generated paper cycles

Regenerate the evidence:

```bash
pnpm backtest
pnpm paper:run -- --cycles 24
pnpm validate:evidence
```

The evidence generator prefers live Bitget public futures candles. If public data is unavailable, it uses a deterministic fallback and marks the data source in `backtest-summary.json`.

## Progress

Completed:

- Runnable Next.js app with a public Evidence Center
- Required paper trading log with timestamp, pair, side, price, size, balance before/after, PnL, fees, reason, and proof id
- Reproducible backtest generator with code-backed Markdown, JSON, and CSV artifacts
- Bitget public futures market reads in the live proof cycle
- Optional read-only Bitget account context through server-side environment variables
- Agent Hub-style tool traces for market/account reads, risk checks, and proof-card replay
- Skill Hub-style perception labels for technical analysis, sentiment, market intel, macro, and news layers
- Playbook/GetAgent metric import without claiming Playbook is a stable web-app HTTP API

Development challenges solved:

- **Evidence gap:** the first version only had a simulated proof card. VibeGuard now generates the required paper trading CSV and a reproducible backtest report in `public/evidence`.
- **Trust gap:** the agent does not only display a final trade. It records signals, risk checks, paper order intent, balance impact, and downloadable artifacts.
- **API honesty:** Playbook evidence is treated as an external GetAgent/website workflow unless a stable Bitget API contract is available.
- **Safety:** real order writes stay disabled while read-only Bitget context and paper trading remain usable for review.

Still missing:

- Real trade execution is intentionally disabled.
- Paper trading persistence is file-based for public review, not a hosted database.
- Playbook publishing can be linked/imported manually, but backend automation is not promised.
- Longer walk-forward tests and live paper scheduling are next steps.

Frameworks, models, and APIs:

- Next.js, React, TypeScript, pnpm
- Bitget public futures market APIs
- Optional Bitget read-only account APIs
- Agent Hub-style tool traces
- Skill Hub-style perception categories
- Optional Playbook/GetAgent metrics import

## Bitget Tools Used

- Bitget public futures market APIs: ticker/candles/depth/trades/contracts/funding/open interest paths in the app runtime
- Read-only Bitget account API support when `BITGET_API_KEY`, `BITGET_SECRET_KEY`, and `BITGET_PASSPHRASE` are configured
- Agent Hub-style tool traces in each proof card
- Skill Hub-style perception labels for technical, sentiment, market-intel, macro, and news layers
- Playbook/GetAgent evidence import as manual JSON or public strategy link when available

## AI Trading Thoughts

The strongest agentic trading products will not just place orders. They will make trading decisions auditable. An agent can be wrong, but it should not hide why it acted.

Bitget Agent Hub and Skill Hub point in the right direction because they give agents market perception and trading tool access. The next useful layer is evidence discipline: every autonomous decision should produce a portable record that includes inputs, risk checks, output, and balance impact.

## Run Locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
pnpm typecheck
pnpm build
pnpm validate:evidence
```

## Deploy To Vercel

Vercel can build this as a standard Next.js app.

- Framework preset: Next.js
- Install command: `pnpm install`
- Build command: `pnpm build`
- Output directory: leave default
- Required environment variables: none
- Optional environment variables: `BITGET_API_KEY`, `BITGET_SECRET_KEY`, `BITGET_PASSPHRASE`, `PLAYBOOK_API_KEY`

The evidence files are static assets under `public/evidence`, so they are publicly accessible after deployment:

- `/evidence/paper-trading-log.csv`
- `/evidence/backtest-report.md`
- `/evidence/backtest-summary.json`
- `/evidence/equity-curve.csv`

## Optional Environment

Copy `.env.example` to `.env.local` for optional read-only Bitget account context.

```bash
BITGET_API_KEY=
BITGET_SECRET_KEY=
BITGET_PASSPHRASE=
PLAYBOOK_API_KEY=
```

Secrets are used server-side only and are not returned in proof JSON.

## Safety

VibeGuard does not send real orders. It records paper trades and simulated order intents only. It never calls transfer, withdrawal, leverage update, margin, copy-trade write, or real order endpoints. Real execution should remain disabled until trade permissions, operator mandates, kill switches, and audit logging are complete.
