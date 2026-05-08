/**
 * Compute a portfolio's lot-by-lot accumulated return time series (수익률 추이).
 *
 * For each day from the first transaction to today:
 *   sharesHeld[ticker]  = Σ transaction.shares where trade_date <= d
 *   portfolioValue[d]   = Σ sharesHeld[ticker] × price[ticker][d]
 *   cumCost[d]          = Σ each purchase lot's shares × purchase price where trade_date <= d
 *   returnPct[d]        = (portfolioValue[d] − cumCost[d]) / cumCost[d] × 100
 *
 * Missing daily prices are forward-filled with the last-known value.
 * `finalPrices`, when provided, overrides only the final date's valuation so
 * charts can use daily history while matching the latest current-price screen.
 *
 * Pure function. No I/O. Fully unit-testable.
 */

export interface TxInput {
  ticker: string;
  trade_date: string;    // ISO YYYY-MM-DD
  shares: number;        // positive
  price: number;         // price per share at purchase
}

export interface TimeSeriesPoint {
  date: string;          // ISO YYYY-MM-DD
  portfolioValue: number;
  cumCost: number;
  returnPct: number;     // in %, e.g., 12.34 = +12.34%
}

export interface TimeSeriesResult {
  points: TimeSeriesPoint[];
  startDate: string;     // == date of first transaction (the 설계일)
  endDate: string;
  finalReturnPct: number;
}

export interface BuildOptions {
  /** Today's date (ISO). Defaults to KST today. */
  today?: string;
  /** Latest market prices used only for the final point. */
  finalPrices?: Record<string, number>;
  /** Cap the number of points to avoid huge renders. If set, keeps
   *  evenly-spaced samples plus the first/last point. */
  maxPoints?: number;
}

/**
 * @param transactions   all buys across all assets in the portfolio
 * @param priceByTicker  ticker → { ISO date → price }; missing days are forward-filled
 */
export function buildPortfolioTimeSeries(
  transactions: TxInput[],
  priceByTicker: Record<string, Record<string, number>>,
  options: BuildOptions = {},
): TimeSeriesResult {
  if (transactions.length === 0) {
    return { points: [], startDate: '', endDate: '', finalReturnPct: 0 };
  }

  // 1. Determine date range
  const sortedTxs = [...transactions].sort((a, b) =>
    a.trade_date.localeCompare(b.trade_date),
  );
  const startDate = sortedTxs[0].trade_date;
  const endDate = options.today ?? todayKst();

  // 2. Prepare forward-filled prices for each ticker
  const tickers = Array.from(new Set(transactions.map((t) => t.ticker)));
  const forwardFilled: Record<string, Record<string, number>> = {};
  for (const ticker of tickers) {
    forwardFilled[ticker] = buildForwardFilled(
      priceByTicker[ticker] ?? {},
      startDate,
      endDate,
    );
  }

  // 3. Index transactions by date for fast per-day accumulation
  const txsByDate: Record<string, TxInput[]> = {};
  for (const tx of sortedTxs) {
    (txsByDate[tx.trade_date] ??= []).push(tx);
  }

  // 4. Walk each day
  const points: TimeSeriesPoint[] = [];
  const sharesHeld: Record<string, number> = {};
  let cumCost = 0;

  for (
    let d = new Date(startDate + 'T00:00:00Z');
    d <= new Date(endDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const iso = d.toISOString().slice(0, 10);

    // Apply any transactions on this date
    const todayTxs = txsByDate[iso] ?? [];
    for (const tx of todayTxs) {
      sharesHeld[tx.ticker] = (sharesHeld[tx.ticker] ?? 0) + tx.shares;
      cumCost += tx.shares * tx.price;
    }

    // Compute portfolio value at this day's prices
    let value = 0;
    for (const [ticker, shares] of Object.entries(sharesHeld)) {
      const finalPrice =
        iso === endDate && options.finalPrices?.[ticker] != null
          ? options.finalPrices[ticker]
          : null;
      const price = finalPrice ?? forwardFilled[ticker]?.[iso] ?? 0;
      value += shares * price;
    }

    const returnPct = cumCost > 0 ? ((value - cumCost) / cumCost) * 100 : 0;
    points.push({
      date: iso,
      portfolioValue: round2(value),
      cumCost: round2(cumCost),
      returnPct: round2(returnPct),
    });
  }

  // 5. Downsample if requested
  const final = options.maxPoints
    ? downsample(points, options.maxPoints)
    : points;

  const finalReturnPct = points.length > 0 ? points[points.length - 1].returnPct : 0;

  return {
    points: final,
    startDate,
    endDate,
    finalReturnPct,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Return a full map of { ISO date → price } from fromDate to toDate,
 * forward-filling gaps with the last-known price. Pre-fromDate prices
 * aren't used; for days before the first available price, the first
 * available price is back-filled (so day-one portfolio value isn't zero).
 */
export function buildForwardFilled(
  sparse: Record<string, number>,
  fromDate: string,
  toDate: string,
): Record<string, number> {
  const filled: Record<string, number> = {};
  const sortedDates = Object.keys(sparse).sort();
  if (sortedDates.length === 0) return filled;

  // Clamp the first known price as the backfill for days before it
  let lastKnown = sparse[sortedDates[0]];

  for (
    let d = new Date(fromDate + 'T00:00:00Z');
    d <= new Date(toDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const iso = d.toISOString().slice(0, 10);
    if (sparse[iso] != null) lastKnown = sparse[iso];
    filled[iso] = lastKnown;
  }
  return filled;
}

/**
 * Keep at most `maxPoints` points from the series, preserving the first
 * and last points and sampling evenly in between.
 */
function downsample(points: TimeSeriesPoint[], maxPoints: number): TimeSeriesPoint[] {
  if (points.length <= maxPoints) return points;
  const stride = (points.length - 1) / (maxPoints - 1);
  const out: TimeSeriesPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * stride);
    out.push(points[Math.min(idx, points.length - 1)]);
  }
  return out;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
