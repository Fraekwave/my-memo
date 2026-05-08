/**
 * P&L (profit & loss) computations for a portfolio.
 *
 * Uses lot-by-lot accumulated cost: costBasis = Σ each purchase lot's
 * shares × purchase price.
 * All math is pure and fully unit-testable.
 */

export interface TransactionRecord {
  ticker: string;
  trade_date: string;       // ISO YYYY-MM-DD
  shares: number;
  price: number;            // price per share at purchase
}

export interface AssetPnl {
  ticker: string;
  totalShares: number;
  costBasis: number;        // sum of (shares × buy price)
  currentValue: number;     // totalShares × currentPrice
  unrealizedGain: number;   // currentValue − costBasis
  returnPct: number;        // unrealizedGain / costBasis × 100 (0 if costBasis = 0)
}

export interface PortfolioPnl {
  assets: AssetPnl[];
  totalCostBasis: number;
  totalCurrentValue: number;
  totalUnrealizedGain: number;
  totalReturnPct: number;
}

/**
 * Compute per-asset P&L from transaction history + current prices.
 */
export function computeAssetPnl(
  ticker: string,
  transactions: TransactionRecord[],
  currentPrice: number,
): AssetPnl {
  const txs = transactions.filter((t) => t.ticker === ticker);
  const totalShares = txs.reduce((s, t) => s + t.shares, 0);
  const costBasis = txs.reduce((s, t) => s + t.shares * t.price, 0);
  const currentValue = totalShares * currentPrice;
  const unrealizedGain = currentValue - costBasis;
  const returnPct = costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0;

  return {
    ticker,
    totalShares: round8(totalShares),
    costBasis: round2(costBasis),
    currentValue: round2(currentValue),
    unrealizedGain: round2(unrealizedGain),
    returnPct: round2(returnPct),
  };
}

/**
 * Compute portfolio-wide P&L.
 *
 * @param tickers List of all tickers in the portfolio (including those with 0 transactions)
 * @param transactions All transactions (will be filtered per ticker)
 * @param prices Current price per ticker
 */
export function computePortfolioPnl(
  tickers: string[],
  transactions: TransactionRecord[],
  prices: Record<string, number>,
): PortfolioPnl {
  const assets = tickers.map((t) =>
    computeAssetPnl(t, transactions, prices[t] ?? 0),
  );

  const totalCostBasis = assets.reduce((s, a) => s + a.costBasis, 0);
  const totalCurrentValue = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalUnrealizedGain = totalCurrentValue - totalCostBasis;
  const totalReturnPct =
    totalCostBasis > 0 ? (totalUnrealizedGain / totalCostBasis) * 100 : 0;

  return {
    assets,
    totalCostBasis: round2(totalCostBasis),
    totalCurrentValue: round2(totalCurrentValue),
    totalUnrealizedGain: round2(totalUnrealizedGain),
    totalReturnPct: round2(totalReturnPct),
  };
}

/**
 * Compute current holdings (total shares per ticker) from transaction history.
 * Useful for the rebalance algorithm.
 */
export function computeHoldings(
  transactions: TransactionRecord[],
): Record<string, number> {
  const holdings: Record<string, number> = {};
  for (const tx of transactions) {
    holdings[tx.ticker] = (holdings[tx.ticker] ?? 0) + tx.shares;
  }
  return holdings;
}

/**
 * Benchmark return: what if all transaction cash had been invested in the
 * benchmark ticker at each transaction's trade_date instead of the actual
 * asset? Returns the percentage gain/loss of that hypothetical portfolio.
 *
 * Requires a function to look up the benchmark's historical price on a given date.
 */
export function computeBenchmarkReturn(
  transactions: TransactionRecord[],
  benchmarkPriceOnDate: (date: string) => number | null,
  benchmarkCurrentPrice: number,
): { costBasis: number; currentValue: number; returnPct: number } {
  let totalShares = 0;
  let totalCost = 0;

  for (const tx of transactions) {
    const cashUsed = tx.shares * tx.price;
    const benchPrice = benchmarkPriceOnDate(tx.trade_date);
    if (benchPrice == null || benchPrice <= 0) continue; // skip if benchmark price unavailable
    const hypotheticalShares = cashUsed / benchPrice;
    totalShares += hypotheticalShares;
    totalCost += cashUsed;
  }

  const currentValue = totalShares * benchmarkCurrentPrice;
  const returnPct =
    totalCost > 0 ? ((currentValue - totalCost) / totalCost) * 100 : 0;

  return {
    costBasis: round2(totalCost),
    currentValue: round2(currentValue),
    returnPct: round2(returnPct),
  };
}

// ───────────────── helpers ─────────────────

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round8(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}
