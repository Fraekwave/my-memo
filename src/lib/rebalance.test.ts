import { describe, it, expect } from 'vitest';
import { planBuys, validateTargetAllocation, RebalanceAsset } from './rebalance';

// Shorthand to build a well-balanced 5-asset portfolio at target
const balanced5 = (): RebalanceAsset[] => [
  { ticker: 'A', targetPct: 30, currentShares: 3, price: 10_000 }, // 30k
  { ticker: 'B', targetPct: 25, currentShares: 5, price: 5_000 },  // 25k
  { ticker: 'C', targetPct: 20, currentShares: 4, price: 5_000 },  // 20k
  { ticker: 'D', targetPct: 15, currentShares: 3, price: 5_000 },  // 15k
  { ticker: 'E', targetPct: 10, currentShares: 2, price: 5_000 },  // 10k
]; // total current value = 100k, weights exactly match targetPct

describe('planBuys — integer shares (ETF mode)', () => {
  it('Case 1 — perfect balance: new cash distributed roughly proportional to targets', () => {
    const result = planBuys(balanced5(), 100_000);
    // Each asset should receive cash close to its target share of the new total (200k).
    // Exact distribution may skew slightly due to integer share constraint.
    const totalBought = result.buys.reduce((s, b) => s + b.estimatedCost, 0);
    expect(totalBought).toBeLessThanOrEqual(100_000);
    expect(result.remainingCash).toBeGreaterThanOrEqual(0);
    // After buys, no asset's weight should be wildly off target (> 5% drift)
    for (const b of result.buys) {
      const weight = result.projectedWeights[b.ticker];
      const target = balanced5().find((a) => a.ticker === b.ticker)!.targetPct;
      expect(Math.abs(weight - target)).toBeLessThan(5);
    }
  });

  it('Case 2 — single asset underweight: most cash flows to it', () => {
    const assets = balanced5();
    // Halve asset A's holdings → it becomes underweight
    assets[0].currentShares = 1;
    const result = planBuys(assets, 50_000);

    const aBuy = result.buys.find((b) => b.ticker === 'A');
    expect(aBuy).toBeDefined();
    // A should receive the bulk of new cash (at least 2 shares = 20k of 50k)
    expect(aBuy!.sharesToBuy).toBeGreaterThanOrEqual(2);
  });

  it('Case 3 — overweight asset: zero shares bought of it', () => {
    const assets = balanced5();
    // Triple asset A's holdings → it's overweight
    assets[0].currentShares = 9;
    const result = planBuys(assets, 50_000);

    const aBuy = result.buys.find((b) => b.ticker === 'A');
    expect(aBuy).toBeUndefined(); // never bought
  });

  it('Case 4 — insufficient cash for any share: buys empty', () => {
    const assets: RebalanceAsset[] = [
      { ticker: 'X', targetPct: 100, currentShares: 0, price: 100_000 },
    ];
    const result = planBuys(assets, 50_000); // cash < price
    expect(result.buys).toEqual([]);
    expect(result.remainingCash).toBe(50_000);
  });

  it('Case 5 — stops buying once target reached mid-plan', () => {
    const assets: RebalanceAsset[] = [
      { ticker: 'A', targetPct: 50, currentShares: 0, price: 10_000 },
      { ticker: 'B', targetPct: 50, currentShares: 0, price: 10_000 },
    ];
    const result = planBuys(assets, 100_000);
    const aBuy = result.buys.find((b) => b.ticker === 'A')!;
    const bBuy = result.buys.find((b) => b.ticker === 'B')!;
    // Both should get ~5 shares each (50k each)
    expect(aBuy.sharesToBuy).toBe(5);
    expect(bBuy.sharesToBuy).toBe(5);
    expect(result.remainingCash).toBe(0);
  });

  it('Case 7 — zero current holdings (first month): distributes toward targets', () => {
    const assets: RebalanceAsset[] = [
      { ticker: 'A', targetPct: 60, currentShares: 0, price: 10_000 },
      { ticker: 'B', targetPct: 40, currentShares: 0, price: 10_000 },
    ];
    const result = planBuys(assets, 100_000);
    const aBuy = result.buys.find((b) => b.ticker === 'A')!;
    const bBuy = result.buys.find((b) => b.ticker === 'B')!;
    expect(aBuy.sharesToBuy).toBe(6); // 60k
    expect(bBuy.sharesToBuy).toBe(4); // 40k
    expect(result.remainingCash).toBe(0);
  });
});

describe('planBuys — fractional (crypto mode)', () => {
  it('Case 6 — BTC single-asset crypto portfolio: all cash buys BTC', () => {
    const assets: RebalanceAsset[] = [
      { ticker: 'KRW-BTC', targetPct: 100, currentShares: 0, price: 100_000_000 },
    ];
    const result = planBuys(assets, 100_000, { allowFractional: true });
    expect(result.buys).toHaveLength(1);
    expect(result.buys[0].sharesToBuy).toBeCloseTo(0.001, 8);
    expect(result.buys[0].estimatedCost).toBeCloseTo(100_000, 0);
  });

  it('fractional — two crypto assets, proportional to underweight', () => {
    const assets: RebalanceAsset[] = [
      { ticker: 'KRW-BTC', targetPct: 70, currentShares: 0, price: 100_000_000 },
      { ticker: 'KRW-ETH', targetPct: 30, currentShares: 0, price: 5_000_000 },
    ];
    const result = planBuys(assets, 100_000, { allowFractional: true });
    const btc = result.buys.find((b) => b.ticker === 'KRW-BTC')!;
    const eth = result.buys.find((b) => b.ticker === 'KRW-ETH')!;
    expect(btc.estimatedCost).toBeCloseTo(70_000, -1); // 70k ± 10
    expect(eth.estimatedCost).toBeCloseTo(30_000, -1); // 30k ± 10
  });
});

describe('validateTargetAllocation', () => {
  it('Case 8a — weights sum to 100%: valid', () => {
    expect(validateTargetAllocation(balanced5())).toBe(true);
  });

  it('Case 8b — weights sum to 99%: invalid', () => {
    const bad = balanced5();
    bad[0].targetPct = 29; // total 99
    expect(validateTargetAllocation(bad)).toBe(false);
  });

  it('Case 8c — empty array: invalid (sum=0)', () => {
    expect(validateTargetAllocation([])).toBe(false);
  });
});
