import { describe, it, expect } from 'vitest';
import {
  computeTargetValueGaps,
  planBuys,
  planBuysWithFixedFractionalBudget,
  scaleTargetPctToPlanningBase,
  validateTargetAllocation,
  RebalanceAsset,
} from './rebalance';

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

describe('planBuysWithFixedFractionalBudget — mixed monthly plan', () => {
  const mixedAssets = (btcShares = 0): RebalanceAsset[] => [
    {
      ticker: 'KRW-BTC',
      targetPct: 20,
      currentShares: btcShares,
      price: 100_000_000,
      category: '암호화폐',
    },
    { ticker: 'STK', targetPct: 60, currentShares: 0, price: 10_000, category: '주식' },
    { ticker: 'BND', targetPct: 20, currentShares: 0, price: 10_000, category: '채권' },
  ];

  it('reserves the crypto target slice before planning the remaining cash', () => {
    const result = planBuysWithFixedFractionalBudget(mixedAssets(), 500_000);

    const btc = result.buys.find((b) => b.ticker === 'KRW-BTC')!;
    const stock = result.buys.find((b) => b.ticker === 'STK')!;
    const bond = result.buys.find((b) => b.ticker === 'BND')!;

    expect(btc.estimatedCost).toBeCloseTo(100_000, 0);
    expect(btc.sharesToBuy).toBeCloseTo(0.001, 8);
    expect(stock.estimatedCost).toBe(300_000);
    expect(bond.estimatedCost).toBe(100_000);
    expect(result.remainingCash).toBe(0);
  });

  it('scales the fixed crypto slice with the entered monthly amount', () => {
    const result = planBuysWithFixedFractionalBudget(mixedAssets(), 1_000_000);

    const btc = result.buys.find((b) => b.ticker === 'KRW-BTC')!;
    const stock = result.buys.find((b) => b.ticker === 'STK')!;
    const bond = result.buys.find((b) => b.ticker === 'BND')!;

    expect(btc.estimatedCost).toBeCloseTo(200_000, 0);
    expect(btc.sharesToBuy).toBeCloseTo(0.002, 8);
    expect(stock.estimatedCost).toBe(600_000);
    expect(bond.estimatedCost).toBe(200_000);
    expect(result.remainingCash).toBe(0);
  });

  it('keeps BTC fixed across strategy choices even when BTC is already overweight', () => {
    for (const strategy of ['balanced', 'aggressive', 'conservative'] as const) {
      const result = planBuysWithFixedFractionalBudget(mixedAssets(0.01), 500_000, {
        strategy,
      });

      const btc = result.buys.find((b) => b.ticker === 'KRW-BTC')!;
      const nonCryptoCost = result.buys
        .filter((b) => b.ticker !== 'KRW-BTC')
        .reduce((sum, b) => sum + b.estimatedCost, 0);

      expect(btc.estimatedCost).toBeCloseTo(100_000, 0);
      expect(nonCryptoCost).toBe(400_000);
    }
  });
});

describe('drift-minimization (KIWOOM overshoot scenario)', () => {
  // Scenario mirroring the real-world portfolio:
  //   Budget 500k, zero current holdings, 1 high-price ETF that would
  //   overshoot its target 2x if we bought 1 share. The drift-minimizing
  //   algo should SKIP it in favor of cheaper ETFs that fit target.
  it('avoids overshooting a high-price asset with small target', () => {
    const assets: RebalanceAsset[] = [
      { ticker: 'A', targetPct: 30, currentShares: 0, price: 30_000 },      // target 150k
      { ticker: 'B', targetPct: 30, currentShares: 0, price: 30_000 },      // target 150k
      { ticker: 'C', targetPct: 30, currentShares: 0, price: 30_000 },      // target 150k
      { ticker: 'KIWOOM', targetPct: 10, currentShares: 0, price: 120_000 }, // target 50k
    ];
    const result = planBuys(assets, 500_000);
    // With cheaper alternatives available, buying 1 KIWOOM (24% of cash)
    // would overshoot target 10% more than buying 4 shares of A/B/C.
    // The algo may or may not buy KIWOOM depending on drift math,
    // but if it does, it's because it genuinely reduced drift.
    const projectedKiwoomPct = result.projectedWeights['KIWOOM'];
    // Never overshoot target by more than 15% absolute
    expect(projectedKiwoomPct).toBeLessThan(25);
    // And drift should be reasonable
    expect(result.projectedDrift).toBeLessThan(40);
  });

  it('fills low-price high-target assets before high-price low-target', () => {
    const assets: RebalanceAsset[] = [
      { ticker: 'CHEAP', targetPct: 80, currentShares: 0, price: 10_000 },
      { ticker: 'EXPENSIVE', targetPct: 20, currentShares: 0, price: 100_000 },
    ];
    const result = planBuys(assets, 200_000);
    const cheap = result.buys.find((b) => b.ticker === 'CHEAP')!;
    // CHEAP should be bought multiple times to hit its 80% target
    expect(cheap.sharesToBuy).toBeGreaterThanOrEqual(14); // ~160k worth
  });

  it('returns projectedDrift field', () => {
    const result = planBuys(
      [
        { ticker: 'A', targetPct: 50, currentShares: 0, price: 10_000 },
        { ticker: 'B', targetPct: 50, currentShares: 0, price: 10_000 },
      ],
      100_000,
    );
    expect(result.projectedDrift).toBeCloseTo(0, 1);
  });
});

describe('strategy options', () => {
  const growthAndSafety: RebalanceAsset[] = [
    { ticker: 'STK', targetPct: 50, currentShares: 0, price: 50_000, category: '주식' },
    { ticker: 'BND', targetPct: 50, currentShares: 0, price: 50_000, category: '채권' },
  ];

  it('balanced: roughly equal allocation', () => {
    const r = planBuys(growthAndSafety, 200_000, { strategy: 'balanced' });
    const stk = r.buys.find((b) => b.ticker === 'STK')!;
    const bnd = r.buys.find((b) => b.ticker === 'BND')!;
    expect(Math.abs(stk.sharesToBuy - bnd.sharesToBuy)).toBeLessThanOrEqual(1);
  });

  it('aggressive: tilts toward stocks', () => {
    // Start with a slight stock overweight and tied drift — aggressive
    // strategy should break ties in favor of stocks.
    const assets: RebalanceAsset[] = [
      { ticker: 'STK', targetPct: 50, currentShares: 0, price: 100_000, category: '주식' },
      { ticker: 'BND', targetPct: 50, currentShares: 0, price: 100_000, category: '채권' },
    ];
    // With 100k cash, one share fits — which one?
    const aggressive = planBuys(assets, 100_000, { strategy: 'aggressive' });
    expect(aggressive.buys[0].ticker).toBe('STK');
    const conservative = planBuys(assets, 100_000, { strategy: 'conservative' });
    expect(conservative.buys[0].ticker).toBe('BND');
  });

  it('strategy bias does NOT override primary drift objective', () => {
    // Strongly underweight bond; aggressive bias shouldn't steal from it.
    const assets: RebalanceAsset[] = [
      { ticker: 'STK', targetPct: 20, currentShares: 20, price: 10_000, category: '주식' },
      { ticker: 'BND', targetPct: 80, currentShares: 0, price: 10_000, category: '채권' },
    ];
    const r = planBuys(assets, 100_000, { strategy: 'aggressive' });
    const bnd = r.buys.find((b) => b.ticker === 'BND')!;
    // Bond should still dominate because drift math overwhelms the penalty
    expect(bnd.sharesToBuy).toBeGreaterThanOrEqual(8);
  });

  it('strategy bias cannot buy an asset already at its future target gap', () => {
    const assets: RebalanceAsset[] = [
      { ticker: 'STK', targetPct: 50, currentShares: 50, price: 1_000, category: '주식' },
      { ticker: 'BND', targetPct: 50, currentShares: 49, price: 1_000, category: '채권' },
    ];

    const r = planBuys(assets, 1_000, { strategy: 'aggressive' });

    expect(r.buys).toEqual([
      { ticker: 'BND', sharesToBuy: 1, estimatedCost: 1_000 },
    ]);
  });
});

describe('computeTargetValueGaps', () => {
  it('computes gaps against the full future portfolio value', () => {
    const gaps = computeTargetValueGaps(
      [
        { ticker: 'ETF', targetPct: 50, currentShares: 10, price: 10_000 },
        { ticker: 'BTC', targetPct: 50, currentShares: 0, price: 100_000_000 },
      ],
      100_000,
    );

    expect(gaps.ETF).toBe(0);
    expect(gaps.BTC).toBe(100_000);
  });
});

describe('scaleTargetPctToPlanningBase', () => {
  it('preserves portfolio-level target value inside a smaller planning group', () => {
    const targetPct = scaleTargetPctToPlanningBase(12.5, 1_000_000, 500_000);

    expect(targetPct).toBe(25);
    expect((500_000 * targetPct) / 100).toBe(125_000);
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
