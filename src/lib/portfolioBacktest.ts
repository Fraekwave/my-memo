import type { AssetCategory } from './types';

export interface CandidateBacktestAsset {
  ticker: string;
  name?: string;
  category: AssetCategory;
  targetPct: number;
}

export interface CandidateBacktestPoint {
  date: string;
  value: number;
  returnPct: number;
}

export interface AnnualReturn {
  year: string;
  returnPct: number;
}

export interface CandidateBacktestMetrics {
  cumulativeReturnPct: number;
  annualizedReturnPct: number;
  maxDrawdownPct: number;
  bestYearReturnPct: number | null;
  worstYearReturnPct: number | null;
  annualReturns: AnnualReturn[];
}

export interface CandidateBacktestOk {
  status: 'ok';
  startDate: string;
  endDate: string;
  durationDays: number;
  points: CandidateBacktestPoint[];
  metrics: CandidateBacktestMetrics;
}

export type CandidateBacktestResult =
  | CandidateBacktestOk
  | {
      status:
        | 'no_assets'
        | 'invalid_weights'
        | 'missing_prices'
        | 'insufficient_overlap';
      missingTickers?: string[];
    };

export type OptimizationObjective = 'performance' | 'risk' | 'balanced';

export interface CandidateBacktestWeight {
  ticker: string;
  name?: string;
  category: AssetCategory;
  targetPct: number;
}

export interface CandidateBacktestSuggestion {
  objective: OptimizationObjective;
  weights: CandidateBacktestWeight[];
  points: CandidateBacktestPoint[];
  metrics: CandidateBacktestMetrics;
}

export interface CandidateOptimizationOk {
  status: 'ok';
  startDate: string;
  endDate: string;
  durationDays: number;
  candidateCount: number;
  stepPct: number;
  suggestions: CandidateBacktestSuggestion[];
}

export type CandidateOptimizationResult =
  | CandidateOptimizationOk
  | Exclude<CandidateBacktestResult, CandidateBacktestOk>;

export interface CandidateBacktestOptions {
  maxPoints?: number;
}

export interface CandidateOptimizationOptions {
  minWeightPct?: number;
  stepPct?: number;
  maxPoints?: number;
}

interface PreparedBacktestContext {
  status: 'ok';
  assets: CandidateBacktestAsset[];
  dates: string[];
  normalizedValues: number[][];
  startDate: string;
  endDate: string;
  durationDays: number;
}

const CASH_CATEGORY: AssetCategory = '현금';

export function buildCandidateBacktest(
  assets: CandidateBacktestAsset[],
  priceByTicker: Record<string, Record<string, number>>,
  options: CandidateBacktestOptions = {},
): CandidateBacktestResult {
  const weightedAssets = assets
    .map((asset) => ({
      ...asset,
      ticker: asset.ticker.trim(),
      targetPct: Number(asset.targetPct) || 0,
    }))
    .filter((asset) => asset.targetPct > 0);

  if (weightedAssets.length === 0) return { status: 'no_assets' };

  const totalPct = weightedAssets.reduce((sum, asset) => sum + asset.targetPct, 0);
  if (Math.abs(totalPct - 100) > 0.01) return { status: 'invalid_weights' };

  const context = prepareBacktestContext(weightedAssets, priceByTicker);
  if (context.status !== 'ok') return context;

  return evaluateWeights(
    context,
    weightedAssets.map((asset) => asset.targetPct),
    options,
  );
}

export function optimizeCandidateBacktest(
  assets: CandidateBacktestAsset[],
  priceByTicker: Record<string, Record<string, number>>,
  options: CandidateOptimizationOptions = {},
): CandidateOptimizationResult {
  const pickedAssets = assets
    .map((asset) => ({
      ...asset,
      ticker: asset.ticker.trim(),
      targetPct: Number(asset.targetPct) || 0,
    }))
    .filter((asset) => asset.category === CASH_CATEGORY || asset.ticker.length > 0);

  if (pickedAssets.length === 0) return { status: 'no_assets' };

  const context = prepareBacktestContext(pickedAssets, priceByTicker);
  if (context.status !== 'ok') return context;

  const stepPct =
    options.stepPct ?? (pickedAssets.length <= 4 ? 5 : 10);
  const requestedMinPct = options.minWeightPct ?? stepPct;
  const minWeightPct =
    pickedAssets.length * requestedMinPct <= 100 ? requestedMinPct : 0;
  const weightVectors = generateWeightVectors(
    pickedAssets.length,
    stepPct,
    minWeightPct,
  );
  if (weightVectors.length === 0) return { status: 'invalid_weights' };

  const evaluated = weightVectors.map((weights) => {
    const result = evaluateWeights(context, weights, {
      maxPoints: options.maxPoints,
    });
    return { weights, result };
  });

  const okEvaluated = evaluated.filter(
    (row): row is { weights: number[]; result: CandidateBacktestOk } =>
      row.result.status === 'ok',
  );
  if (okEvaluated.length === 0) return { status: 'insufficient_overlap' };

  const performance = pickBest(okEvaluated, comparePerformance);
  const risk = pickBest(okEvaluated, compareRisk);
  const balanced = pickBest(okEvaluated, compareBalanced);

  return {
    status: 'ok',
    startDate: context.startDate,
    endDate: context.endDate,
    durationDays: context.durationDays,
    candidateCount: okEvaluated.length,
    stepPct,
    suggestions: [
      toSuggestion('performance', context.assets, performance),
      toSuggestion('risk', context.assets, risk),
      toSuggestion('balanced', context.assets, balanced),
    ],
  };
}

function prepareBacktestContext(
  assets: CandidateBacktestAsset[],
  priceByTicker: Record<string, Record<string, number>>,
): PreparedBacktestContext | Exclude<CandidateBacktestResult, CandidateBacktestOk> {
  const pricedAssets = assets.filter((asset) => asset.category !== CASH_CATEGORY);
  if (pricedAssets.length === 0) return { status: 'insufficient_overlap' };

  const dateRanges = pricedAssets.map((asset) => {
    const dates = sortedPriceDates(priceByTicker[asset.ticker] ?? {});
    return {
      ticker: asset.ticker,
      first: dates[0],
      last: dates[dates.length - 1],
    };
  });

  const missingTickers = dateRanges
    .filter((range) => !range.first || !range.last)
    .map((range) => range.ticker);
  if (missingTickers.length > 0) {
    return { status: 'missing_prices', missingTickers };
  }

  const startDate = maxIso(dateRanges.map((range) => range.first));
  const endDate = minIso(dateRanges.map((range) => range.last));
  if (!startDate || !endDate || startDate >= endDate) {
    return { status: 'insufficient_overlap' };
  }

  const durationDays = daysBetween(startDate, endDate);
  if (durationDays < 7) return { status: 'insufficient_overlap' };

  const dates = enumerateDates(startDate, endDate);
  const normalizedValues = assets.map((asset) => {
    if (asset.category === CASH_CATEGORY) {
      return dates.map(() => 1);
    }

    const filled = buildForwardFilledPrices(
      priceByTicker[asset.ticker] ?? {},
      startDate,
      endDate,
    );
    const base = filled[startDate];
    if (!Number.isFinite(base) || base <= 0) return [];
    return dates.map((date) => (filled[date] ?? base) / base);
  });

  const missingNormalizedIdx = normalizedValues.findIndex((values) => values.length === 0);
  if (missingNormalizedIdx >= 0) {
    return {
      status: 'missing_prices',
      missingTickers: [assets[missingNormalizedIdx].ticker],
    };
  }

  return {
    status: 'ok',
    assets,
    dates,
    normalizedValues,
    startDate,
    endDate,
    durationDays,
  };
}

function evaluateWeights(
  context: PreparedBacktestContext,
  weights: number[],
  options: CandidateBacktestOptions = {},
): CandidateBacktestOk {
  const fullPoints = context.dates.map((date, dateIndex) => {
    const value = context.normalizedValues.reduce((sum, values, assetIndex) => {
      return sum + (weights[assetIndex] / 100) * values[dateIndex];
    }, 0);
    return {
      date,
      value: round4(value),
      returnPct: round2((value - 1) * 100),
    };
  });

  const metrics = buildMetrics(fullPoints, context.durationDays);
  return {
    status: 'ok',
    startDate: context.startDate,
    endDate: context.endDate,
    durationDays: context.durationDays,
    points: options.maxPoints ? downsample(fullPoints, options.maxPoints) : fullPoints,
    metrics,
  };
}

function buildMetrics(
  points: CandidateBacktestPoint[],
  durationDays: number,
): CandidateBacktestMetrics {
  const first = points[0]?.value ?? 1;
  const last = points[points.length - 1]?.value ?? first;
  const cumulativeReturnPct = first > 0 ? round2(((last / first) - 1) * 100) : 0;
  const annualizedReturnPct =
    durationDays > 0 && first > 0 && last > 0
      ? round2(((last / first) ** (365.25 / durationDays) - 1) * 100)
      : 0;

  let peak = points[0]?.value ?? 1;
  let maxDrawdownPct = 0;
  for (const point of points) {
    if (point.value > peak) peak = point.value;
    const drawdownPct = peak > 0 ? ((point.value / peak) - 1) * 100 : 0;
    if (drawdownPct < maxDrawdownPct) maxDrawdownPct = drawdownPct;
  }

  const annualReturns = buildAnnualReturns(points);
  const annualValues = annualReturns.map((row) => row.returnPct);

  return {
    cumulativeReturnPct,
    annualizedReturnPct,
    maxDrawdownPct: round2(maxDrawdownPct),
    bestYearReturnPct:
      annualValues.length > 0 ? round2(Math.max(...annualValues)) : null,
    worstYearReturnPct:
      annualValues.length > 0 ? round2(Math.min(...annualValues)) : null,
    annualReturns,
  };
}

function buildAnnualReturns(points: CandidateBacktestPoint[]): AnnualReturn[] {
  const byYear = new Map<string, { first: number; last: number }>();
  for (const point of points) {
    const year = point.date.slice(0, 4);
    const current = byYear.get(year);
    if (!current) {
      byYear.set(year, { first: point.value, last: point.value });
    } else {
      current.last = point.value;
    }
  }
  return Array.from(byYear.entries()).map(([year, row]) => ({
    year,
    returnPct: row.first > 0 ? round2(((row.last / row.first) - 1) * 100) : 0,
  }));
}

function generateWeightVectors(
  assetCount: number,
  stepPct: number,
  minWeightPct: number,
): number[][] {
  if (assetCount <= 0) return [];
  if (assetCount === 1) return [[100]];
  const totalUnits = Math.round(100 / stepPct);
  const minUnits = Math.round(minWeightPct / stepPct);
  const remainingUnits = totalUnits - assetCount * minUnits;
  if (remainingUnits < 0) return [];

  const out: number[][] = [];
  const current = Array(assetCount).fill(minUnits);
  const distribute = (idx: number, remaining: number) => {
    if (idx === assetCount - 1) {
      current[idx] = minUnits + remaining;
      out.push(current.map((units) => units * stepPct));
      return;
    }
    for (let units = 0; units <= remaining; units += 1) {
      current[idx] = minUnits + units;
      distribute(idx + 1, remaining - units);
    }
  };
  distribute(0, remainingUnits);
  return out;
}

function pickBest(
  candidates: Array<{ weights: number[]; result: CandidateBacktestOk }>,
  compare: (
    a: { weights: number[]; result: CandidateBacktestOk },
    b: { weights: number[]; result: CandidateBacktestOk },
  ) => number,
): { weights: number[]; result: CandidateBacktestOk } {
  return candidates.reduce((best, candidate) =>
    compare(candidate, best) > 0 ? candidate : best,
  );
}

function comparePerformance(
  a: { result: CandidateBacktestOk },
  b: { result: CandidateBacktestOk },
): number {
  return compareBy(
    a,
    b,
    (row) => row.result.metrics.annualizedReturnPct,
    (row) => row.result.metrics.maxDrawdownPct,
  );
}

function compareRisk(
  a: { result: CandidateBacktestOk },
  b: { result: CandidateBacktestOk },
): number {
  return compareBy(
    a,
    b,
    (row) => row.result.metrics.maxDrawdownPct,
    (row) => row.result.metrics.annualizedReturnPct,
  );
}

function compareBalanced(
  a: { result: CandidateBacktestOk },
  b: { result: CandidateBacktestOk },
): number {
  return compareBy(
    a,
    b,
    (row) => calmarLikeScore(row.result.metrics),
    (row) => row.result.metrics.annualizedReturnPct,
  );
}

function compareBy<T>(
  a: T,
  b: T,
  primary: (row: T) => number,
  secondary: (row: T) => number,
): number {
  const primaryDelta = primary(a) - primary(b);
  if (Math.abs(primaryDelta) > 0.0001) return primaryDelta;
  return secondary(a) - secondary(b);
}

function calmarLikeScore(metrics: CandidateBacktestMetrics): number {
  const drawdownPenalty = Math.max(Math.abs(metrics.maxDrawdownPct), 1);
  return metrics.annualizedReturnPct / drawdownPenalty;
}

function toSuggestion(
  objective: OptimizationObjective,
  assets: CandidateBacktestAsset[],
  candidate: { weights: number[]; result: CandidateBacktestOk },
): CandidateBacktestSuggestion {
  return {
    objective,
    weights: assets.map((asset, idx) => ({
      ticker: asset.ticker,
      name: asset.name,
      category: asset.category,
      targetPct: candidate.weights[idx],
    })),
    points: candidate.result.points,
    metrics: candidate.result.metrics,
  };
}

function buildForwardFilledPrices(
  sparse: Record<string, number>,
  fromDate: string,
  toDate: string,
): Record<string, number> {
  const entries = Object.entries(sparse)
    .filter(([, price]) => Number.isFinite(price) && price > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const filled: Record<string, number> = {};
  if (entries.length === 0) return filled;

  let idx = 0;
  let lastKnown = entries[0][1];
  for (const date of enumerateDates(fromDate, toDate)) {
    while (idx < entries.length && entries[idx][0] <= date) {
      lastKnown = entries[idx][1];
      idx += 1;
    }
    filled[date] = lastKnown;
  }
  return filled;
}

function sortedPriceDates(prices: Record<string, number>): string[] {
  return Object.entries(prices)
    .filter(([, price]) => Number.isFinite(price) && price > 0)
    .map(([date]) => date)
    .sort();
}

function enumerateDates(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  for (
    let d = new Date(fromDate + 'T00:00:00Z');
    d <= new Date(toDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function maxIso(values: Array<string | undefined>): string | null {
  const clean = values.filter((value): value is string => Boolean(value));
  if (clean.length === 0) return null;
  return clean.reduce((max, value) => (value > max ? value : max), clean[0]);
}

function minIso(values: Array<string | undefined>): string | null {
  const clean = values.filter((value): value is string => Boolean(value));
  if (clean.length === 0) return null;
  return clean.reduce((min, value) => (value < min ? value : min), clean[0]);
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round(
    (Date.parse(toDate + 'T00:00:00Z') - Date.parse(fromDate + 'T00:00:00Z')) /
      86_400_000,
  );
}

function downsample<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const stride = (points.length - 1) / (maxPoints - 1);
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * stride);
    out.push(points[Math.min(idx, points.length - 1)]);
  }
  return out;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}
