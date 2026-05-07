/**
 * Buy-only rebalancing algorithm with strategy options.
 *
 * Given a portfolio's target allocation and new cash to invest, compute how
 * many shares of each asset to buy so that the resulting portfolio weights
 * are as close as possible to the targets. Never suggests selling.
 *
 * Integer mode (default): drift-minimizing greedy.
 *   At each step, for every affordable asset, simulate buying 1 more share
 *   and compute the portfolio's total drift (Σ |actual% − target%|). Pick
 *   the buy that minimizes post-buy drift. Repeat until no asset is
 *   affordable.
 *
 *   This avoids the classic failure mode of the simpler "largest gap first"
 *   greedy algorithm, which buys 1 share of a big-ticket asset even when
 *   that single share overshoots the target 2x.
 *
 * Fractional mode (crypto): distributes cash proportionally to positive
 *   gaps, capped at each gap. Unchanged from the original.
 *
 * Strategies bias only near-ties after the target-gap math has decided the
 * primary ordering. "Balanced" is neutral; "Aggressive" prefers growth assets
 * (stocks, crypto, REITs); "Conservative" prefers safety assets (bonds, gold,
 * cash).
 *
 * Pure function. Fully unit-testable.
 */

export type Strategy = 'balanced' | 'aggressive' | 'conservative';

export interface RebalanceAsset {
  ticker: string;
  targetPct: number;      // 0–100 (e.g., 30 means 30%)
  currentShares: number;
  price: number;          // KRW per share
  /** Optional. Used by strategy tie-breaking. */
  category?: string;
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
  /** Total drift after buys: Σ |actual% − target%| (0 = perfect allocation). */
  projectedDrift: number;
}

export interface PlanBuysOptions {
  /** If true, shares can be fractional (used for crypto). Default false. */
  allowFractional?: boolean;
  /** Decimal precision for fractional shares. Default 8 (BTC standard). */
  fractionalPrecision?: number;
  /** Strategy modifier for integer mode. Default 'balanced'. */
  strategy?: Strategy;
}

export interface FixedFractionalBudgetOptions {
  /** Strategy modifier for the non-fractional group. Default 'balanced'. */
  strategy?: Strategy;
  /** Decimal precision for fractional shares. Default 8 (BTC standard). */
  fractionalPrecision?: number;
  /** Category treated as fractional/fixed-slice. Default '암호화폐'. */
  fractionalCategory?: string;
}

// Categories that benefit growth-oriented strategies
const GROWTH_CATEGORIES = new Set(['주식', '암호화폐', '리츠']);
// Categories that benefit safety-oriented strategies
const SAFETY_CATEGORIES = new Set(['채권', '금', '현금']);

// Maximum drift-score difference that counts as a strategy tie. This keeps
// "aggressive" and "conservative" from overpowering target allocation.
const DRIFT_TIE_EPSILON = 0.05;
const STRATEGY_TARGET_TILT = 0.25;

function strategyPreference(category: string | undefined, strategy: Strategy): number {
  if (!category) return 0;
  if (strategy === 'aggressive') {
    if (GROWTH_CATEGORIES.has(category)) return -1;
    if (SAFETY_CATEGORIES.has(category)) return +1;
  }
  if (strategy === 'conservative') {
    if (SAFETY_CATEGORIES.has(category)) return -1;
    if (GROWTH_CATEGORIES.has(category)) return +1;
  }
  return 0;
}

function strategyTargetMultiplier(category: string | undefined, strategy: Strategy): number {
  if (!category || strategy === 'balanced') return 1;

  if (strategy === 'aggressive') {
    if (GROWTH_CATEGORIES.has(category)) return 1 + STRATEGY_TARGET_TILT;
    if (SAFETY_CATEGORIES.has(category)) return 1 - STRATEGY_TARGET_TILT;
  }

  if (strategy === 'conservative') {
    if (SAFETY_CATEGORIES.has(category)) return 1 + STRATEGY_TARGET_TILT;
    if (GROWTH_CATEGORIES.has(category)) return 1 - STRATEGY_TARGET_TILT;
  }

  return 1;
}

/**
 * Compute each asset's absolute KRW gap against the portfolio target after
 * adding the new cash. Positive = underweight, negative = overweight.
 */
export function computeTargetValueGaps(
  assets: RebalanceAsset[],
  cashToInvest: number,
): Record<string, number> {
  const currentTotal = assets.reduce(
    (sum, a) => sum + a.currentShares * a.price,
    0,
  );
  const totalFutureValue = currentTotal + cashToInvest;
  const gaps: Record<string, number> = {};

  for (const asset of assets) {
    const currentValue = asset.currentShares * asset.price;
    const targetValue = (totalFutureValue * asset.targetPct) / 100;
    gaps[asset.ticker] = targetValue - currentValue;
  }

  return gaps;
}

/**
 * Convert a portfolio-level target percent to the equivalent percent inside a
 * separately planned group. This lets mixed integer/fractional planners keep
 * using the full portfolio as the target base.
 */
export function scaleTargetPctToPlanningBase(
  targetPct: number,
  portfolioFutureValue: number,
  planningFutureValue: number,
): number {
  if (planningFutureValue <= 0) return 0;
  return (targetPct * portfolioFutureValue) / planningFutureValue;
}

export function planBuys(
  assets: RebalanceAsset[],
  cashToInvest: number,
  options: PlanBuysOptions = {},
): RebalanceResult {
  const {
    allowFractional = false,
    fractionalPrecision = 8,
    strategy = 'balanced',
  } = options;

  if (allowFractional) {
    return planBuysFractional(assets, cashToInvest, fractionalPrecision);
  }
  return planBuysInteger(assets, cashToInvest, strategy);
}

/**
 * Mixed portfolio planner for integer assets + fractional crypto.
 *
 * Crypto is intentionally treated as a fixed slice of each new contribution:
 * if BTC target is 20% and cash is 500,000 KRW, 100,000 KRW is reserved for
 * BTC. The remaining cash is planned only among non-crypto assets by row-level
 * target amount. Whole-share rows are rounded independently, then a second
 * pass spends leftover cash on affordable rows without exceeding the budget.
 */
export function planBuysWithFixedFractionalBudget(
  assets: RebalanceAsset[],
  cashToInvest: number,
  options: FixedFractionalBudgetOptions = {},
): RebalanceResult {
  const {
    strategy = 'balanced',
    fractionalPrecision = 8,
    fractionalCategory = '암호화폐',
  } = options;

  const fractionalAssets = assets.filter((a) => a.category === fractionalCategory);
  const integerAssets = assets.filter((a) => a.category !== fractionalCategory);

  const fractionalPctSum = fractionalAssets.reduce((s, a) => s + a.targetPct, 0);
  const integerPctSum = integerAssets.reduce((s, a) => s + a.targetPct, 0);
  const totalPctSum = fractionalPctSum + integerPctSum;

  const fractionalCash =
    fractionalAssets.length === 0
      ? 0
      : integerAssets.length === 0
        ? cashToInvest
        : totalPctSum > 0
          ? Math.round((cashToInvest * fractionalPctSum) / totalPctSum)
          : 0;
  const integerCash = cashToInvest - fractionalCash;

  const normalizeTargets = (group: RebalanceAsset[], pctSum: number): RebalanceAsset[] =>
    group.map((a) => ({
      ...a,
      targetPct: pctSum > 0 ? (a.targetPct / pctSum) * 100 : 0,
    }));

  const fractionalResult =
    fractionalAssets.length > 0
      ? planBuys(normalizeTargets(fractionalAssets, fractionalPctSum), fractionalCash, {
          allowFractional: true,
          fractionalPrecision,
        })
      : emptyResult(0);

  const integerResult =
    integerAssets.length > 0
      ? planIntegerBuysByTargetAmount(integerAssets, integerCash, integerPctSum, strategy)
      : emptyResult(0);

  const boughtByTicker = new Map<string, number>();
  for (const buy of [...fractionalResult.buys, ...integerResult.buys]) {
    boughtByTicker.set(buy.ticker, (boughtByTicker.get(buy.ticker) ?? 0) + buy.sharesToBuy);
  }

  const state = assets.map((a) => ({
    ticker: a.ticker,
    targetPct: a.targetPct,
    shares: a.currentShares,
    price: a.price,
  }));
  const bought = state.map((s) => boughtByTicker.get(s.ticker) ?? 0);

  return buildResult(
    state,
    bought,
    fractionalResult.remainingCash + integerResult.remainingCash,
  );
}

function planIntegerBuysByTargetAmount(
  assets: RebalanceAsset[],
  cashToInvest: number,
  pctSum: number,
  strategy: Strategy,
): RebalanceResult {
  const adjustedPctSum = assets.reduce(
    (sum, a) => sum + a.targetPct * strategyTargetMultiplier(a.category, strategy),
    0,
  );
  const planningPctSum = adjustedPctSum > 0 ? adjustedPctSum : pctSum;

  const rows = assets.map((a) => {
    const adjustedPct = a.targetPct * strategyTargetMultiplier(a.category, strategy);
    const targetCash = planningPctSum > 0 ? (cashToInvest * adjustedPct) / planningPctSum : 0;
    const shares = a.price > 0 ? Math.round(targetCash / a.price) : 0;
    return {
      asset: a,
      targetCash,
      shares: Math.max(0, shares),
    };
  });

  let totalCost = rows.reduce((sum, row) => sum + row.shares * row.asset.price, 0);

  // Rounding each row to the nearest share can rarely exceed the available
  // group cash. If that happens, trim the rows that overshot their own target
  // by the most; never redistribute the freed cash.
  while (totalCost > cashToInvest) {
    let trimIdx = -1;
    let biggestOverTarget = -Infinity;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.shares <= 0) continue;
      const cost = row.shares * row.asset.price;
      const overTarget = cost - row.targetCash;
      if (
        overTarget > biggestOverTarget ||
        (overTarget === biggestOverTarget &&
          trimIdx >= 0 &&
          row.asset.price > rows[trimIdx].asset.price)
      ) {
        biggestOverTarget = overTarget;
        trimIdx = i;
      }
    }

    if (trimIdx === -1) break;
    rows[trimIdx].shares -= 1;
    totalCost -= rows[trimIdx].asset.price;
  }

  // Second pass: spend leftover cash without exceeding the group budget.
  // We first favor buys that improve closeness to their strategy-adjusted row
  // target. Once every affordable extra buy is over-target, keep buying the
  // least harmful affordable row so idle cash is minimized.
  for (let iter = 0; iter < 10_000; iter++) {
    const remaining = cashToInvest - totalCost;
    let bestIdx = -1;
    let bestImproves = false;
    let bestPostGap = Infinity;
    let bestPreference = Infinity;
    let bestPrice = -Infinity;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const price = row.asset.price;
      if (price <= 0 || price > remaining) continue;

      const currentCost = row.shares * price;
      const currentGap = Math.abs(currentCost - row.targetCash);
      const postGap = Math.abs(currentCost + price - row.targetCash);
      const improves = postGap < currentGap;
      const preference = strategyPreference(row.asset.category, strategy);

      if (
        (improves && !bestImproves) ||
        (improves === bestImproves &&
          (postGap < bestPostGap - 0.01 ||
            (Math.abs(postGap - bestPostGap) <= 0.01 &&
              (preference < bestPreference ||
                (preference === bestPreference && price > bestPrice)))))
      ) {
        bestIdx = i;
        bestImproves = improves;
        bestPostGap = postGap;
        bestPreference = preference;
        bestPrice = price;
      }
    }

    if (bestIdx === -1) break;
    rows[bestIdx].shares += 1;
    totalCost += rows[bestIdx].asset.price;
  }

  const state = assets.map((a) => ({
    ticker: a.ticker,
    targetPct: a.targetPct,
    shares: a.currentShares,
    price: a.price,
  }));
  const bought = rows.map((row) => row.shares);

  return buildResult(state, bought, cashToInvest - totalCost);
}

// ─────────────────────────────────────────────────────────────────
// Integer mode — drift-minimizing greedy
// ─────────────────────────────────────────────────────────────────

function planBuysInteger(
  assets: RebalanceAsset[],
  cashToInvest: number,
  strategy: Strategy,
): RebalanceResult {
  const state = assets.map((a) => ({
    ticker: a.ticker,
    targetPct: a.targetPct,
    shares: a.currentShares,
    price: a.price,
    category: a.category,
  }));
  const bought: number[] = new Array(state.length).fill(0);
  let cash = cashToInvest;

  const currentTotal = state.reduce((sum, s) => sum + s.shares * s.price, 0);
  const totalFutureValue = currentTotal + cashToInvest;
  const targetValue = state.map((s) => (totalFutureValue * s.targetPct) / 100);

  const valueAt = (idx: number, simulatedAddIdx: number | null): number =>
    (state[idx].shares +
      bought[idx] +
      (simulatedAddIdx === idx ? 1 : 0)) *
    state[idx].price;

  const remainingGap = (idx: number): number =>
    targetValue[idx] - valueAt(idx, null);

  /** Compute absolute target-value drift after an optional +1 at idx. */
  const drift = (simulatedAddIdx: number | null): number => {
    if (totalFutureValue <= 0) return Infinity;
    let d = 0;
    for (let i = 0; i < state.length; i++) {
      d += Math.abs(valueAt(i, simulatedAddIdx) - targetValue[i]);
    }
    return (d / totalFutureValue) * 100;
  };

  // Safety limit — in practice a real portfolio spends ≤ 100 shares total.
  const maxIters = 10_000;

  for (let iter = 0; iter < maxIters; iter++) {
    let bestIdx = -1;
    let bestDrift = Infinity;
    let bestPreference = Infinity;

    for (let i = 0; i < state.length; i++) {
      if (state[i].price > cash) continue;
      if (remainingGap(i) <= 0) continue;

      const postDrift = drift(i);
      const preference = strategyPreference(state[i].category, strategy);

      if (
        postDrift < bestDrift - DRIFT_TIE_EPSILON ||
        (Math.abs(postDrift - bestDrift) <= DRIFT_TIE_EPSILON &&
          preference < bestPreference)
      ) {
        bestDrift = postDrift;
        bestPreference = preference;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break; // nothing affordable

    bought[bestIdx] += 1;
    cash -= state[bestIdx].price;
  }

  return buildResult(state, bought, cash);
}

// ─────────────────────────────────────────────────────────────────
// Fractional mode — proportional cash distribution
// ─────────────────────────────────────────────────────────────────

function planBuysFractional(
  assets: RebalanceAsset[],
  cashToInvest: number,
  precision: number,
): RebalanceResult {
  const state = assets.map((a) => ({
    ticker: a.ticker,
    targetPct: a.targetPct,
    shares: a.currentShares,
    price: a.price,
  }));
  const totalFutureValue =
    state.reduce((sum, s) => sum + s.shares * s.price, 0) + cashToInvest;
  const targetValue = state.map((s) => (totalFutureValue * s.targetPct) / 100);
  const gap = state.map((s, i) => targetValue[i] - s.shares * s.price);

  const totalPositiveGap = gap.reduce((sum, g) => sum + (g > 0 ? g : 0), 0);
  const bought: number[] = new Array(state.length).fill(0);
  let cash = cashToInvest;

  if (totalPositiveGap > 0) {
    for (let i = 0; i < state.length; i++) {
      if (gap[i] <= 0) continue;
      const portion = (gap[i] / totalPositiveGap) * cashToInvest;
      const allocation = Math.min(portion, gap[i]);
      const shares = allocation / state[i].price;
      const rounded = floorTo(shares, precision);
      if (rounded > 0) {
        bought[i] = rounded;
        cash -= rounded * state[i].price;
      }
    }
  }

  return buildResult(state, bought, cash);
}

// ─────────────────────────────────────────────────────────────────
// Shared result builder
// ─────────────────────────────────────────────────────────────────

function buildResult(
  state: {
    ticker: string;
    targetPct: number;
    shares: number;
    price: number;
  }[],
  bought: number[],
  cash: number,
): RebalanceResult {
  const buys: BuyRecommendation[] = [];
  const projectedShares = state.map((s, i) => s.shares + bought[i]);
  const projectedValues = projectedShares.map((sh, i) => sh * state[i].price);
  const projectedTotal = projectedValues.reduce((s, v) => s + v, 0);

  const projectedWeights: Record<string, number> = {};
  let projectedDrift = 0;
  for (let i = 0; i < state.length; i++) {
    if (bought[i] > 0) {
      buys.push({
        ticker: state[i].ticker,
        sharesToBuy: bought[i],
        estimatedCost: bought[i] * state[i].price,
      });
    }
    const pct =
      projectedTotal > 0 ? (projectedValues[i] / projectedTotal) * 100 : 0;
    projectedWeights[state[i].ticker] = pct;
    projectedDrift += Math.abs(pct - state[i].targetPct);
  }

  return {
    buys,
    remainingCash: round2(cash),
    projectedWeights,
    projectedDrift: round2(projectedDrift),
  };
}

function emptyResult(remainingCash: number): RebalanceResult {
  return {
    buys: [],
    remainingCash,
    projectedWeights: {},
    projectedDrift: 0,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function floorTo(value: number, decimals: number): number {
  const m = Math.pow(10, decimals);
  return Math.floor(value * m) / m;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Validate target allocation sums to 100% (±0.01% tolerance).
 */
export function validateTargetAllocation(
  assets: Pick<RebalanceAsset, 'targetPct'>[],
): boolean {
  const sum = assets.reduce((s, a) => s + a.targetPct, 0);
  return Math.abs(sum - 100) < 0.01;
}
