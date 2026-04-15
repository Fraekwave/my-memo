/**
 * Buy-only rebalancing algorithm.
 *
 * Given a portfolio's target allocation and new cash to invest, compute how
 * many shares of each asset to buy so that the resulting portfolio weights
 * move toward target. Never suggests selling — drift corrects over time as
 * new cash flows to the most underweight assets.
 *
 * Pure function. No side effects. Fully unit-testable.
 */

export interface RebalanceAsset {
  ticker: string;
  targetPct: number;      // 0–100 (e.g., 30 means 30%)
  currentShares: number;
  price: number;          // KRW per share
}

export interface BuyRecommendation {
  ticker: string;
  sharesToBuy: number;
  estimatedCost: number;
}

export interface RebalanceResult {
  buys: BuyRecommendation[];
  remainingCash: number;
  projectedWeights: Record<string, number>; // weight after buys (0–100)
}

export interface PlanBuysOptions {
  /** If true, shares can be fractional (used for crypto). Default false. */
  allowFractional?: boolean;
  /** Decimal precision for fractional shares. Default 8 (BTC standard). */
  fractionalPrecision?: number;
}

/**
 * Compute the buy plan.
 *
 * Integer-share mode (default): greedy — repeatedly pick the asset with the
 * largest gap whose price fits remaining cash, buy 1 share, repeat until no
 * affordable asset has a remaining gap.
 *
 * Fractional mode: distribute cash proportionally to each asset's gap,
 * capped at each asset's gap (so no asset goes over target).
 */
export function planBuys(
  assets: RebalanceAsset[],
  cashToInvest: number,
  options: PlanBuysOptions = {},
): RebalanceResult {
  const { allowFractional = false, fractionalPrecision = 8 } = options;

  // Defensive copies (algorithm mutates local state only)
  const state = assets.map((a) => ({
    ticker: a.ticker,
    targetPct: a.targetPct,
    shares: a.currentShares,
    price: a.price,
  }));

  // Total portfolio value AFTER adding new cash
  const currentValue = (idx: number) => state[idx].shares * state[idx].price;
  const totalFutureValue =
    state.reduce((sum, _, i) => sum + currentValue(i), 0) + cashToInvest;

  // Target value for each asset
  const targetValue = state.map(
    (s) => (totalFutureValue * s.targetPct) / 100,
  );

  // Gap (positive = underweight, negative = overweight)
  const gap = state.map((_, i) => targetValue[i] - currentValue(i));

  let cash = cashToInvest;
  const bought: number[] = new Array(state.length).fill(0);

  if (allowFractional) {
    // Distribute cash proportionally to positive gaps, capped at each gap.
    // Overweight assets (gap <= 0) receive nothing.
    const totalPositiveGap = gap.reduce(
      (sum, g) => sum + (g > 0 ? g : 0),
      0,
    );

    if (totalPositiveGap > 0) {
      for (let i = 0; i < state.length; i++) {
        if (gap[i] <= 0) continue;
        const portion = (gap[i] / totalPositiveGap) * cashToInvest;
        const allocation = Math.min(portion, gap[i]);
        const shares = allocation / state[i].price;
        const rounded = roundTo(shares, fractionalPrecision);
        if (rounded > 0) {
          bought[i] = rounded;
          cash -= rounded * state[i].price;
        }
      }
    }
  } else {
    // Integer-share greedy algorithm.
    // Avoid infinite loops by capping iterations at a sane upper bound.
    const maxIters = 100_000;
    for (let iter = 0; iter < maxIters; iter++) {
      let bestIdx = -1;
      let bestGap = 0;

      for (let i = 0; i < state.length; i++) {
        const remainingGap = gap[i] - bought[i] * state[i].price;
        if (remainingGap <= 0) continue;       // already at or over target
        if (state[i].price > cash) continue;   // can't afford
        if (remainingGap > bestGap) {
          bestGap = remainingGap;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) break; // nothing affordable with a gap
      bought[bestIdx] += 1;
      cash -= state[bestIdx].price;
    }
  }

  // Build result
  const buys: BuyRecommendation[] = [];
  const projectedShares = state.map((s, i) => s.shares + bought[i]);
  const projectedValues = projectedShares.map((sh, i) => sh * state[i].price);
  const projectedTotal = projectedValues.reduce((s, v) => s + v, 0);

  const projectedWeights: Record<string, number> = {};
  for (let i = 0; i < state.length; i++) {
    if (bought[i] > 0) {
      buys.push({
        ticker: state[i].ticker,
        sharesToBuy: bought[i],
        estimatedCost: bought[i] * state[i].price,
      });
    }
    projectedWeights[state[i].ticker] =
      projectedTotal > 0 ? (projectedValues[i] / projectedTotal) * 100 : 0;
  }

  return {
    buys,
    remainingCash: round2(cash),
    projectedWeights,
  };
}

// ───────────────── helpers ─────────────────

function roundTo(value: number, decimals: number): number {
  const m = Math.pow(10, decimals);
  return Math.floor(value * m) / m; // floor so we never overshoot allocation
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Validate target allocation sums to 100% (±0.01% tolerance).
 * Returns true if valid, false otherwise.
 */
export function validateTargetAllocation(
  assets: Pick<RebalanceAsset, 'targetPct'>[],
): boolean {
  const sum = assets.reduce((s, a) => s + a.targetPct, 0);
  return Math.abs(sum - 100) < 0.01;
}
