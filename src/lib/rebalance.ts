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
  /** Optional daily close history, keyed by YYYY-MM-DD, used for simulation. */
  priceHistory?: Record<string, number>;
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

export interface BuyOnlyRebalanceCashOptions {
  /** Minimum cash to suggest even when the portfolio is already balanced. */
  minimumCash?: number;
  /** Round the suggestion up to this KRW increment. Default: no rounding. */
  roundUpTo?: number;
}

export interface AnnualRebalanceOptions {
  /** Strategy modifier used only as a tie-breaker for integer-share rows. */
  strategy?: Strategy;
  /** Decimal precision for fractional shares. Default 8 (BTC standard). */
  fractionalPrecision?: number;
  /** Category treated as fractional. Default '암호화폐'. */
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
const SIMULATION_EPSILON = 0.000001;

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
 * BTC. In balanced mode, the remaining cash is planned among non-crypto
 * assets by row-level target amount and then leftover cash is spent on
 * affordable rows. Aggressive and conservative modes use historical-price
 * simulation instead: aggressive seeks highest simulated profit, conservative
 * seeks lowest simulated maximum drawdown, and both stay within the budget.
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
      ? strategy === 'balanced'
        ? planIntegerBuysByTargetAmount(integerAssets, integerCash, integerPctSum, strategy)
        : planIntegerBuysBySimulationObjective(integerAssets, integerCash, integerPctSum, strategy)
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

/**
 * Estimate the one-time buy-only cash needed to bring overweight rows back to
 * target weight without selling. If the portfolio is already at target, the
 * caller can still provide a minimum contribution amount.
 */
export function estimateBuyOnlyRebalanceCash(
  assets: RebalanceAsset[],
  options: BuyOnlyRebalanceCashOptions = {},
): number {
  const { minimumCash = 0, roundUpTo = 0 } = options;
  const currentTotal = assets.reduce(
    (sum, a) => sum + a.currentShares * a.price,
    0,
  );

  if (currentTotal <= 0) {
    return roundCashUp(Math.max(0, minimumCash), roundUpTo);
  }

  let requiredFutureTotal = currentTotal;
  for (const asset of assets) {
    const currentValue = asset.currentShares * asset.price;
    const targetFraction = asset.targetPct / 100;
    if (currentValue <= 0 || targetFraction <= 0) continue;
    requiredFutureTotal = Math.max(
      requiredFutureTotal,
      currentValue / targetFraction,
    );
  }

  const rebalanceCash = Math.max(0, requiredFutureTotal - currentTotal);
  return roundCashUp(Math.max(rebalanceCash, minimumCash), roundUpTo);
}

/**
 * Annual buy-only rebalance planner.
 *
 * Monthly buying intentionally follows contribution targets. Annual
 * rebalancing instead starts from current drift against the original target
 * allocation and directs the larger one-time budget toward underweight rows.
 * Fractional rows (crypto by default) can absorb exact KRW gaps; ETF-like rows
 * stay integer-only.
 */
export function planAnnualRebalanceBuys(
  assets: RebalanceAsset[],
  cashToInvest: number,
  options: AnnualRebalanceOptions = {},
): RebalanceResult {
  const {
    strategy = 'balanced',
    fractionalPrecision = 8,
    fractionalCategory = '암호화폐',
  } = options;

  const state = assets.map((a) => ({
    ticker: a.ticker,
    targetPct: a.targetPct,
    shares: a.currentShares,
    price: a.price,
  }));
  const bought: number[] = new Array(state.length).fill(0);
  if (cashToInvest <= 0 || assets.length === 0) {
    return buildResult(state, bought, cashToInvest);
  }

  const gaps = computeTargetValueGaps(assets, cashToInvest);
  const positiveGapSum = assets.reduce(
    (sum, a) => sum + Math.max(0, gaps[a.ticker] ?? 0),
    0,
  );
  if (positiveGapSum <= 0) {
    return buildResult(state, bought, cashToInvest);
  }

  const rows: AnnualRebalanceRow[] = assets.map((asset, idx) => ({
    idx,
    asset,
    targetCash:
      (Math.max(0, gaps[asset.ticker] ?? 0) / positiveGapSum) * cashToInvest,
  }));
  const integerRows = rows.filter((row) => row.asset.category !== fractionalCategory);
  const fractionalRows = rows.filter((row) => row.asset.category === fractionalCategory);

  let cash = cashToInvest;

  if (integerRows.length > 0) {
    const integerBudget = Math.min(
      cash,
      integerRows.reduce((sum, row) => sum + row.targetCash, 0),
    );
    const integerShares = planIntegerSharesTowardCashTargets(
      integerRows,
      integerBudget,
      strategy,
    );

    for (let i = 0; i < integerRows.length; i++) {
      const row = integerRows[i];
      bought[row.idx] = integerShares[i];
      cash -= integerShares[i] * row.asset.price;
    }
  }

  if (fractionalRows.length > 0) {
    cash = allocateFractionalRebalanceCash(
      fractionalRows,
      bought,
      gaps,
      cash,
      fractionalPrecision,
    );
  }

  cash = spendIntegerRebalanceLeftover(integerRows, bought, gaps, cash, strategy);

  if (fractionalRows.length > 0) {
    cash = allocateFractionalRebalanceCash(
      fractionalRows,
      bought,
      gaps,
      cash,
      fractionalPrecision,
    );
  }

  return buildResult(state, bought, cash);
}

interface IntegerPlanRow {
  asset: RebalanceAsset;
  targetCash: number;
  shares: number;
}

interface AnnualRebalanceRow {
  idx: number;
  asset: RebalanceAsset;
  targetCash: number;
}

function planIntegerSharesTowardCashTargets(
  rows: AnnualRebalanceRow[],
  cashBudget: number,
  strategy: Strategy,
): number[] {
  const planned = rows.map((row) => ({
    ...row,
    shares:
      row.asset.price > 0
        ? Math.max(0, Math.round(row.targetCash / row.asset.price))
        : 0,
  }));

  let totalCost = planned.reduce(
    (sum, row) => sum + row.shares * row.asset.price,
    0,
  );

  while (totalCost > cashBudget) {
    let trimIdx = -1;
    let biggestOverTarget = -Infinity;

    for (let i = 0; i < planned.length; i++) {
      const row = planned[i];
      if (row.shares <= 0) continue;
      const cost = row.shares * row.asset.price;
      const overTarget = cost - row.targetCash;
      if (
        overTarget > biggestOverTarget ||
        (overTarget === biggestOverTarget &&
          trimIdx >= 0 &&
          row.asset.price > planned[trimIdx].asset.price)
      ) {
        trimIdx = i;
        biggestOverTarget = overTarget;
      }
    }

    if (trimIdx === -1) break;
    planned[trimIdx].shares -= 1;
    totalCost -= planned[trimIdx].asset.price;
  }

  for (let iter = 0; iter < 10_000; iter++) {
    const remaining = cashBudget - totalCost;
    let bestIdx = -1;
    let bestPostGap = Infinity;
    let bestPreference = Infinity;
    let bestPrice = -Infinity;

    for (let i = 0; i < planned.length; i++) {
      const row = planned[i];
      const price = row.asset.price;
      if (price <= 0 || price > remaining) continue;

      const currentCost = row.shares * price;
      const currentGap = Math.abs(currentCost - row.targetCash);
      const postGap = Math.abs(currentCost + price - row.targetCash);
      if (postGap >= currentGap) continue;

      const preference = strategyPreference(row.asset.category, strategy);
      if (
        postGap < bestPostGap - 0.01 ||
        (Math.abs(postGap - bestPostGap) <= 0.01 &&
          (preference < bestPreference ||
            (preference === bestPreference && price > bestPrice)))
      ) {
        bestIdx = i;
        bestPostGap = postGap;
        bestPreference = preference;
        bestPrice = price;
      }
    }

    if (bestIdx === -1) break;
    planned[bestIdx].shares += 1;
    totalCost += planned[bestIdx].asset.price;
  }

  return planned.map((row) => row.shares);
}

function allocateFractionalRebalanceCash(
  rows: AnnualRebalanceRow[],
  bought: number[],
  gaps: Record<string, number>,
  availableCash: number,
  precision: number,
): number {
  let cash = availableCash;

  for (let iter = 0; iter < 4; iter++) {
    const gapRows = rows
      .map((row) => {
        const boughtValue = bought[row.idx] * row.asset.price;
        return {
          row,
          remainingGap: Math.max(0, (gaps[row.asset.ticker] ?? 0) - boughtValue),
        };
      })
      .filter((entry) => entry.remainingGap > 0 && entry.row.asset.price > 0);

    const gapSum = gapRows.reduce((sum, entry) => sum + entry.remainingGap, 0);
    if (cash <= 0 || gapSum <= 0) break;

    const cashAtStart = cash;
    let spentThisPass = 0;
    for (const { row, remainingGap } of gapRows) {
      const allocation = Math.min(
        (remainingGap / gapSum) * cashAtStart,
        remainingGap,
        cash,
      );
      const shares = floorTo(allocation / row.asset.price, precision);
      const cost = shares * row.asset.price;
      if (shares <= 0 || cost <= 0) continue;

      bought[row.idx] += shares;
      cash -= cost;
      spentThisPass += cost;
    }

    if (spentThisPass <= 0) break;
  }

  return cash;
}

function spendIntegerRebalanceLeftover(
  rows: AnnualRebalanceRow[],
  bought: number[],
  gaps: Record<string, number>,
  availableCash: number,
  strategy: Strategy,
): number {
  let cash = availableCash;

  for (let iter = 0; iter < 10_000; iter++) {
    let best: AnnualRebalanceRow | null = null;
    let bestPostGap = Infinity;
    let bestPreference = Infinity;
    let bestPrice = -Infinity;

    for (const row of rows) {
      const price = row.asset.price;
      if (price <= 0 || price > cash) continue;

      const targetCash = Math.max(0, gaps[row.asset.ticker] ?? 0);
      const currentCost = bought[row.idx] * price;
      const currentGap = Math.abs(currentCost - targetCash);
      const postGap = Math.abs(currentCost + price - targetCash);
      if (postGap >= currentGap) continue;

      const preference = strategyPreference(row.asset.category, strategy);
      if (
        postGap < bestPostGap - 0.01 ||
        (Math.abs(postGap - bestPostGap) <= 0.01 &&
          (preference < bestPreference ||
            (preference === bestPreference && price > bestPrice)))
      ) {
        best = row;
        bestPostGap = postGap;
        bestPreference = preference;
        bestPrice = price;
      }
    }

    if (!best) break;
    bought[best.idx] += 1;
    cash -= best.asset.price;
  }

  return cash;
}

interface SimulationData {
  dates: string[];
  pricesByAsset: number[][];
  expectedReturns: number[];
  fallbackMdds: number[];
}

interface SimulationScore {
  simulatedProfit: number;
  simulatedMdd: number;
  remainingCash: number;
  projectedDrift: number;
  preference: number;
  candidatePrice: number;
}

function planIntegerBuysBySimulationObjective(
  assets: RebalanceAsset[],
  cashToInvest: number,
  pctSum: number,
  strategy: Exclude<Strategy, 'balanced'>,
): RebalanceResult {
  const planningPctSum = pctSum > 0 ? pctSum : assets.reduce((sum, a) => sum + a.targetPct, 0);
  const rows: IntegerPlanRow[] = assets.map((a) => ({
    asset: a,
    targetCash: planningPctSum > 0 ? (cashToInvest * a.targetPct) / planningPctSum : 0,
    shares: 0,
  }));
  const simulation = buildSimulationData(rows);

  if (strategy === 'aggressive') {
    const maxProfitBought = optimizeMaxProfitShares(rows, cashToInvest, simulation);
    if (maxProfitBought) {
      return buildIntegerResultFromBought(assets, maxProfitBought, cashToInvest);
    }
  }

  const bought = rows.map(() => 0);
  let totalCost = 0;
  for (let iter = 0; iter < 10_000; iter++) {
    const remaining = cashToInvest - totalCost;
    let bestIdx = -1;
    let bestScore: SimulationScore | null = null;

    for (let i = 0; i < rows.length; i++) {
      const price = rows[i].asset.price;
      if (price <= 0 || price > remaining) continue;

      const candidateBought = bought.slice();
      candidateBought[i] += 1;
      const score = evaluateSimulationScore(
        rows,
        candidateBought,
        cashToInvest,
        simulation,
        strategy,
        i,
      );

      if (!bestScore || isBetterSimulationScore(score, bestScore, strategy)) {
        bestIdx = i;
        bestScore = score;
      }
    }

    if (bestIdx === -1) break;
    bought[bestIdx] += 1;
    totalCost += rows[bestIdx].asset.price;
  }

  return buildIntegerResultFromBought(assets, bought, cashToInvest);
}

function buildIntegerResultFromBought(
  assets: RebalanceAsset[],
  bought: number[],
  cashToInvest: number,
): RebalanceResult {
  const totalCost = assets.reduce((sum, asset, idx) => sum + bought[idx] * asset.price, 0);
  const state = assets.map((a) => ({
    ticker: a.ticker,
    targetPct: a.targetPct,
    shares: a.currentShares,
    price: a.price,
  }));

  return buildResult(state, bought, cashToInvest - totalCost);
}

function optimizeMaxProfitShares(
  rows: IntegerPlanRow[],
  cashToInvest: number,
  simulation: SimulationData,
): number[] | null {
  const affordable = rows
    .map((row, idx) => ({ idx, price: Math.round(row.asset.price) }))
    .filter((row) => row.price > 0 && row.price <= cashToInvest);
  if (affordable.length === 0) return rows.map(() => 0);

  const cash = Math.round(cashToInvest);
  const divisor = affordable.reduce((g, row) => gcd(g, row.price), cash);
  const scaledCash = Math.floor(cash / divisor);
  const scaled = affordable.map((row) => ({
    ...row,
    scaledPrice: Math.max(1, Math.round(row.price / divisor)),
    profitPerShare: rows[row.idx].asset.price * simulation.expectedReturns[row.idx],
  }));
  if (scaledCash > 500_000) return null;

  const profit = new Float64Array(scaledCash + 1);
  profit.fill(Number.NEGATIVE_INFINITY);
  const prevCost = new Int32Array(scaledCash + 1);
  prevCost.fill(-1);
  const prevAsset = new Int16Array(scaledCash + 1);
  prevAsset.fill(-1);
  profit[0] = 0;

  for (let cost = 0; cost <= scaledCash; cost++) {
    if (!Number.isFinite(profit[cost])) continue;
    for (const row of scaled) {
      const nextCost = cost + row.scaledPrice;
      if (nextCost > scaledCash) continue;
      const nextProfit = profit[cost] + row.profitPerShare;
      if (nextProfit > profit[nextCost] + 0.01) {
        profit[nextCost] = nextProfit;
        prevCost[nextCost] = cost;
        prevAsset[nextCost] = row.idx;
      }
    }
  }

  const minPrice = Math.min(...scaled.map((row) => row.scaledPrice));
  let bestCost = -1;
  for (let cost = 0; cost <= scaledCash; cost++) {
    if (!Number.isFinite(profit[cost])) continue;
    if (scaledCash - cost >= minPrice) continue;
    if (
      bestCost === -1 ||
      profit[cost] > profit[bestCost] + 0.01 ||
      (Math.abs(profit[cost] - profit[bestCost]) <= 0.01 && cost > bestCost)
    ) {
      bestCost = cost;
    }
  }

  if (bestCost === -1) {
    for (let cost = 0; cost <= scaledCash; cost++) {
      if (!Number.isFinite(profit[cost])) continue;
      if (
        bestCost === -1 ||
        profit[cost] > profit[bestCost] + 0.01 ||
        (Math.abs(profit[cost] - profit[bestCost]) <= 0.01 && cost > bestCost)
      ) {
        bestCost = cost;
      }
    }
  }

  if (bestCost <= 0) return rows.map(() => 0);

  const bought = rows.map(() => 0);
  for (let cost = bestCost; cost > 0 && prevAsset[cost] >= 0; cost = prevCost[cost]) {
    bought[prevAsset[cost]] += 1;
  }
  return bought;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function evaluateSimulationScore(
  rows: IntegerPlanRow[],
  bought: number[],
  cashToInvest: number,
  simulation: SimulationData,
  strategy: Exclude<Strategy, 'balanced'>,
  candidateIdx: number,
): SimulationScore {
  const totalCost = bought.reduce(
    (sum, shares, idx) => sum + shares * rows[idx].asset.price,
    0,
  );
  const simulatedProfit = bought.reduce(
    (sum, shares, idx) =>
      sum + shares * rows[idx].asset.price * simulation.expectedReturns[idx],
    0,
  );

  return {
    simulatedProfit,
    simulatedMdd: evaluateSimulatedMdd(rows, bought, simulation, totalCost),
    remainingCash: cashToInvest - totalCost,
    projectedDrift: projectedDriftForBoughtRows(rows, bought),
    preference: strategyPreference(rows[candidateIdx].asset.category, strategy),
    candidatePrice: rows[candidateIdx].asset.price,
  };
}

function isBetterSimulationScore(
  next: SimulationScore,
  current: SimulationScore,
  strategy: Exclude<Strategy, 'balanced'>,
): boolean {
  if (strategy === 'aggressive') {
    if (next.simulatedProfit > current.simulatedProfit + 0.01) return true;
    if (next.simulatedProfit < current.simulatedProfit - 0.01) return false;
    if (next.simulatedMdd < current.simulatedMdd - SIMULATION_EPSILON) return true;
    if (next.simulatedMdd > current.simulatedMdd + SIMULATION_EPSILON) return false;
  } else {
    if (next.simulatedMdd < current.simulatedMdd - SIMULATION_EPSILON) return true;
    if (next.simulatedMdd > current.simulatedMdd + SIMULATION_EPSILON) return false;
    if (next.remainingCash < current.remainingCash - 0.01) return true;
    if (next.remainingCash > current.remainingCash + 0.01) return false;
    if (next.simulatedProfit > current.simulatedProfit + 0.01) return true;
    if (next.simulatedProfit < current.simulatedProfit - 0.01) return false;
  }

  if (next.remainingCash < current.remainingCash - 0.01) return true;
  if (next.remainingCash > current.remainingCash + 0.01) return false;
  if (next.projectedDrift < current.projectedDrift - DRIFT_TIE_EPSILON) return true;
  if (next.projectedDrift > current.projectedDrift + DRIFT_TIE_EPSILON) return false;
  if (next.preference < current.preference) return true;
  if (next.preference > current.preference) return false;
  return next.candidatePrice > current.candidatePrice;
}

function buildSimulationData(rows: IntegerPlanRow[]): SimulationData {
  const histories = rows.map((row) => sortedHistoryEntries(row.asset.priceHistory));
  const dates = Array.from(
    new Set(histories.flatMap((entries) => (entries.length >= 2 ? entries.map((e) => e.date) : []))),
  ).sort();

  return {
    dates,
    pricesByAsset: histories.map((entries, idx) =>
      fillHistoryPrices(entries, dates, rows[idx].asset.price),
    ),
    expectedReturns: histories.map((entries, idx) =>
      entries.length >= 2
        ? entries[entries.length - 1].price / entries[0].price - 1
        : fallbackExpectedReturn(rows[idx].asset.category),
    ),
    fallbackMdds: histories.map((entries, idx) =>
      entries.length >= 2
        ? maxDrawdownFromPrices(entries.map((entry) => entry.price))
        : fallbackMdd(rows[idx].asset.category),
    ),
  };
}

function sortedHistoryEntries(
  history: Record<string, number> | undefined,
): Array<{ date: string; price: number }> {
  if (!history) return [];
  return Object.entries(history)
    .filter(([, price]) => Number.isFinite(price) && price > 0)
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function fillHistoryPrices(
  entries: Array<{ date: string; price: number }>,
  dates: string[],
  fallbackPrice: number,
): number[] {
  if (dates.length === 0) return [];
  if (entries.length === 0) return dates.map(() => fallbackPrice);

  const out: number[] = [];
  let entryIdx = 0;
  let lastPrice = entries[0].price;

  for (const date of dates) {
    while (entryIdx < entries.length && entries[entryIdx].date <= date) {
      lastPrice = entries[entryIdx].price;
      entryIdx += 1;
    }
    out.push(lastPrice);
  }

  return out;
}

function evaluateSimulatedMdd(
  rows: IntegerPlanRow[],
  bought: number[],
  simulation: SimulationData,
  totalCost: number,
): number {
  if (simulation.dates.length >= 2) {
    let peak = 0;
    let maxDrawdown = 0;

    for (let dateIdx = 0; dateIdx < simulation.dates.length; dateIdx++) {
      const value = bought.reduce(
        (sum, shares, assetIdx) =>
          sum + shares * (simulation.pricesByAsset[assetIdx][dateIdx] ?? rows[assetIdx].asset.price),
        0,
      );
      if (value <= 0) continue;
      peak = Math.max(peak, value);
      if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
    }

    return maxDrawdown;
  }

  if (totalCost <= 0) return 0;
  return bought.reduce((sum, shares, idx) => {
    const cost = shares * rows[idx].asset.price;
    return sum + (cost / totalCost) * simulation.fallbackMdds[idx];
  }, 0);
}

function projectedDriftForBoughtRows(rows: IntegerPlanRow[], bought: number[]): number {
  const projectedValues = rows.map((row, idx) => {
    const shares = row.asset.currentShares + bought[idx];
    return shares * row.asset.price;
  });
  const total = projectedValues.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Infinity;

  return rows.reduce((sum, row, idx) => {
    const actualPct = (projectedValues[idx] / total) * 100;
    return sum + Math.abs(actualPct - row.asset.targetPct);
  }, 0);
}

function maxDrawdownFromPrices(prices: number[]): number {
  let peak = 0;
  let maxDrawdown = 0;

  for (const price of prices) {
    if (price <= 0) continue;
    peak = Math.max(peak, price);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - price) / peak);
  }

  return maxDrawdown;
}

function fallbackExpectedReturn(category: string | undefined): number {
  switch (category) {
    case '암호화폐':
      return 0.12;
    case '주식':
    case '리츠':
      return 0.08;
    case '원자재':
      return 0.05;
    case '금':
      return 0.04;
    case '채권':
      return 0.025;
    case '현금':
      return 0;
    default:
      return 0.03;
  }
}

function fallbackMdd(category: string | undefined): number {
  switch (category) {
    case '암호화폐':
      return 0.45;
    case '리츠':
      return 0.28;
    case '주식':
      return 0.25;
    case '원자재':
      return 0.22;
    case '금':
      return 0.12;
    case '채권':
      return 0.08;
    case '현금':
      return 0;
    default:
      return 0.15;
  }
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

function roundCashUp(value: number, increment: number): number {
  if (increment <= 0) return round2(value);
  return Math.ceil(value / increment) * increment;
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
