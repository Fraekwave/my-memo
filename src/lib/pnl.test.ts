import { describe, it, expect } from 'vitest';
import {
  computeAssetPnl,
  computePortfolioPnl,
  computeHoldings,
  computeBenchmarkReturn,
} from './pnl';

describe('computeAssetPnl', () => {
  it('Case 1 — single buy, flat price: 0% return', () => {
    const txs = [{ ticker: 'A', trade_date: '2025-01-01', shares: 1, price: 10_000 }];
    const r = computeAssetPnl('A', txs, 10_000);
    expect(r.totalShares).toBe(1);
    expect(r.costBasis).toBe(10_000);
    expect(r.currentValue).toBe(10_000);
    expect(r.unrealizedGain).toBe(0);
    expect(r.returnPct).toBe(0);
  });

  it('Case 2 — single buy, +20% gain', () => {
    const txs = [{ ticker: 'A', trade_date: '2025-01-01', shares: 1, price: 10_000 }];
    const r = computeAssetPnl('A', txs, 12_000);
    expect(r.unrealizedGain).toBe(2_000);
    expect(r.returnPct).toBe(20);
  });

  it('Case 3 — multiple buys at different prices (avg cost)', () => {
    // 2 @ 10k + 3 @ 15k = 65k cost, 5 shares
    // Current 20k/share = 100k value → gain 35k, return ~53.85%
    const txs = [
      { ticker: 'A', trade_date: '2024-06-01', shares: 2, price: 10_000 },
      { ticker: 'A', trade_date: '2024-12-01', shares: 3, price: 15_000 },
    ];
    const r = computeAssetPnl('A', txs, 20_000);
    expect(r.totalShares).toBe(5);
    expect(r.costBasis).toBe(65_000);
    expect(r.currentValue).toBe(100_000);
    expect(r.unrealizedGain).toBe(35_000);
    expect(r.returnPct).toBeCloseTo(53.85, 1);
  });

  it('filters to only target ticker', () => {
    const txs = [
      { ticker: 'A', trade_date: '2025-01-01', shares: 1, price: 10_000 },
      { ticker: 'B', trade_date: '2025-01-01', shares: 5, price: 5_000 },
    ];
    const r = computeAssetPnl('B', txs, 6_000);
    expect(r.totalShares).toBe(5);
    expect(r.costBasis).toBe(25_000);
  });

  it('zero transactions: zero values, no divide-by-zero', () => {
    const r = computeAssetPnl('A', [], 10_000);
    expect(r.totalShares).toBe(0);
    expect(r.costBasis).toBe(0);
    expect(r.returnPct).toBe(0); // not NaN
  });
});

describe('computePortfolioPnl', () => {
  it('Case 4 — multi-asset portfolio sums correctly', () => {
    const txs = [
      { ticker: 'A', trade_date: '2024-06-01', shares: 2, price: 10_000 },  // cost 20k
      { ticker: 'B', trade_date: '2024-06-01', shares: 5, price: 5_000 },   // cost 25k
      { ticker: 'C', trade_date: '2024-06-01', shares: 10, price: 2_000 },  // cost 20k
    ];
    const prices = { A: 12_000, B: 6_000, C: 2_500 };
    const r = computePortfolioPnl(['A', 'B', 'C'], txs, prices);

    // A: value 24k, cost 20k, gain 4k
    // B: value 30k, cost 25k, gain 5k
    // C: value 25k, cost 20k, gain 5k
    expect(r.totalCostBasis).toBe(65_000);
    expect(r.totalCurrentValue).toBe(79_000);
    expect(r.totalUnrealizedGain).toBe(14_000);
    expect(r.totalReturnPct).toBeCloseTo(21.54, 1);
    expect(r.assets).toHaveLength(3);
  });

  it('asset with no transactions still appears in results with zero values', () => {
    const txs = [
      { ticker: 'A', trade_date: '2025-01-01', shares: 1, price: 10_000 },
    ];
    const r = computePortfolioPnl(['A', 'B'], txs, { A: 10_000, B: 5_000 });
    expect(r.assets).toHaveLength(2);
    const b = r.assets.find((a) => a.ticker === 'B')!;
    expect(b.totalShares).toBe(0);
    expect(b.costBasis).toBe(0);
  });

  it('missing price defaults to 0 (avoids crash)', () => {
    const txs = [
      { ticker: 'A', trade_date: '2025-01-01', shares: 1, price: 10_000 },
    ];
    const r = computePortfolioPnl(['A'], txs, {}); // no price provided
    expect(r.assets[0].currentValue).toBe(0);
    expect(r.assets[0].returnPct).toBe(-100); // full loss
  });
});

describe('computeHoldings', () => {
  it('sums shares per ticker', () => {
    const txs = [
      { ticker: 'A', trade_date: '2024-06-01', shares: 2, price: 10_000 },
      { ticker: 'A', trade_date: '2024-12-01', shares: 3, price: 15_000 },
      { ticker: 'B', trade_date: '2024-12-01', shares: 5, price: 5_000 },
    ];
    const h = computeHoldings(txs);
    expect(h.A).toBe(5);
    expect(h.B).toBe(5);
  });

  it('empty input: empty holdings', () => {
    expect(computeHoldings([])).toEqual({});
  });
});

describe('computeBenchmarkReturn', () => {
  it('Case 5 — benchmark parallel math matches', () => {
    // Actual portfolio: bought 2 shares @ 10k on Jan, 3 shares @ 15k on Jun
    // Cash used: 20k (Jan) + 45k (Jun) = 65k total
    // Benchmark prices: 100 on Jan, 120 on Jun, 150 now
    // Hypothetical: Jan → 20k / 100 = 200 benchmark shares; Jun → 45k / 120 = 375 shares
    // Total bench shares: 575; current value: 575 × 150 = 86,250
    // Return: (86,250 − 65,000) / 65,000 = 32.69%
    const txs = [
      { ticker: 'A', trade_date: '2024-01-15', shares: 2, price: 10_000 },
      { ticker: 'A', trade_date: '2024-06-15', shares: 3, price: 15_000 },
    ];
    const priceLookup = (date: string) => (date === '2024-01-15' ? 100 : 120);
    const r = computeBenchmarkReturn(txs, priceLookup, 150);
    expect(r.costBasis).toBe(65_000);
    expect(r.currentValue).toBeCloseTo(86_250, 0);
    expect(r.returnPct).toBeCloseTo(32.69, 1);
  });

  it('skips transactions when benchmark price is unavailable', () => {
    const txs = [
      { ticker: 'A', trade_date: '2024-01-15', shares: 2, price: 10_000 },
      { ticker: 'A', trade_date: '2024-06-15', shares: 3, price: 15_000 },
    ];
    const priceLookup = (date: string) => (date === '2024-01-15' ? 100 : null);
    const r = computeBenchmarkReturn(txs, priceLookup, 150);
    // Only Jan tx counted: 20k / 100 = 200 shares → 200 × 150 = 30k
    expect(r.costBasis).toBe(20_000);
    expect(r.currentValue).toBe(30_000);
    expect(r.returnPct).toBe(50);
  });
});
