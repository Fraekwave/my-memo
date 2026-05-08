# Price Refresh Guardrails

Current portfolio prices must be treated as live operational data, not as
historical chart data.

## Rules

- Crypto tickers (`KRW-*`) always use a 2-minute TTL.
- Korean security tickers (`000000`) use a 2-minute TTL from KRX market open
  until the close-price publication window ends.
- After 16:30 KST on a Korean trading day, a Korean security cache row is valid
  only if its `fetched_at` is also after 16:30 KST on that same KST date.
- Manual refresh must send `force: true` to `fetch-asset-prices`, and the Edge
  Function must try upstream before falling back to cache.
- The main page, P&L screen, and buy plan must use the same current-price hook
  for final/current valuation.

## Regression Case

The incident that caused this guardrail:

- Ticker: `360200` ACE S&P500
- Bad cached value: `26,835`
- Bad cache timestamp: `2026-05-08 06:28 KST`
- Correct Naver/KIS value after close: `27,130`

A pre-market same-day row must not be reused after the close-price publication
window. The test `src/lib/priceFreshness.test.ts` pins this case.

## Change Checklist

Before changing price refresh behavior:

- Run `npm test`.
- Run `npm run build`.
- Confirm `fetch-asset-prices` returns the same value as Naver for `360200`.
- Confirm `force: true` bypasses cache unless upstream fails.
