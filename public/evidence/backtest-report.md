# VibeGuard Backtest Report

Generated: 2026-06-19T11:59:15.084Z

## Strategy

Regime-Adaptive Majors Rotation trades BTCUSDT, ETHUSDT, and SOLUSDT perpetuals. Each cycle scores trend, mean reversion, funding pressure, volume confirmation, open-interest proxy, spread, and realized volatility. It stays flat when confidence or risk gates fail.

## Risk Rules

- Starting balance: 10000 USDT
- Max equity per trade: 20%
- Max leverage: 3x
- Estimated fee: 0.06%
- Minimum confidence: 48

## Results

| Metric | Value |
| --- | ---: |
| Total return | 2.20% |
| Ending balance | 10220.43 USDT |
| Max drawdown | -5.48% |
| Sharpe proxy | 1.81 |
| Win rate | 52.78% |
| Trades | 36 |
| Flat cycles | 1 |

## Reproduce

```bash
pnpm backtest
pnpm validate:evidence
```

The generated CSV files are intentionally plain text so judges can inspect or rerun them without a notebook environment.
