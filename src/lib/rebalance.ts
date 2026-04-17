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
 * Strategies bias tie-breaking via a small per-category penalty added to
 * the drift score. "Balanced" is neutral; "Aggressive" subtracts score from
 * growth assets (stocks, crypto, REITs); "Conservative" subtracts from
 * safety assets (bonds, gold, cash).
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

// Categories that benefit growth-oriented strategies
const GROWTH_CATEGORIES = new Set(['주식', '암호화폐', '리츠']);
// Categories that benefit safety-oriented strategies
const SAFETY_CATEGORIES = new Set(['채권', '금', '현금']);

// Small penalty/bonus that only tips the scales in tie-breaking —
// never overrides the primary objective (drift minimization).
const STRATEGY_PENALTY = 2.0; // percentage points added/subtracted from drift score

function strategyPenalty(category: string | undefined, strategy: Strategy): number {
  if (!category) return 0;
  if (strategy === 'aggressive') {
    if (GROWTH_CATEGORIES.has(category)) return -STRATEGY_PENALTY;
    if (SAFETY_CATEGORIES.has(category)) return +STRATEGY_PENALTY;
  }
  if (strategy === 'conservative') {
    if (SAFETY_CATEGORIES.has(category)) return -STRATEGY_PENALTY;
    if (GROWTH_CATEGORIES.has(category)) return +STRATEGY_PENALTY;
  }
  return 0;
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

  /** Compute the current total drift from target based on an optional +1 at idx. */
  const drift = (simulatedAddIdx: number | null): number => {
    const values = state.map(
      (s, i) =>
        (s.shares + bought[i] + (simulatedAddIdx === i ? 1 : 0)) * s.price,
    );
    const total = values.reduce((sum, v) => sum + v, 0);
    if (total === 0) return Infinity; // undefined — pick by price/target
    let d = 0;
    for (let i = 0; i < state.length; i++) {
      const pct = (values[i] / total) * 100;
      d += Math.abs(pct - state[i].targetPct);
    }
    return d;
  };

  // Safety limit — in practice a real portfolio spends ≤ 100 shares total.
  const maxIters = 10_000;

  for (let iter = 0; iter < maxIters; iter++) {
    let bestIdx = -1;
    let bestScore = Infinity;

    // Edge case: if we haven't bought anything yet and all current shares
    // are zero, `drift(null)` = Infinity. Use an asset-centric fallback:
    // pick the asset whose +1 share gets us CLOSEST to its own target
    // value (as a fraction of what the total would become).
    for (let i = 0; i < state.length; i++) {
      if (state[i].price > cash) continue;
      const postDrift = drift(i);
      const penalty = strategyPenalty(state[i].category, strategy);
      const score = postDrift + penalty;
      if (score < bestScore) {
        bestScore = score;
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
