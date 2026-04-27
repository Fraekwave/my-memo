/**
 * usePortfolioTimeSeries — compose transactions + historical prices into
 * a 수익률 추이 series. Derived via memo on top of useTransactions and
 * useHistoricalPrices. Handles multiple portfolios by accepting all
 * transactions + all tickers at once.
 */

import { useMemo } from 'react';
import { useHistoricalPrices } from './useHistoricalPrices';
import {
  buildPortfolioTimeSeries,
  type TimeSeriesResult,
  type TxInput,
} from '@/lib/portfolioTimeSeries';

const MAX_CHART_POINTS = 365; // cap for responsive rendering

export interface UsePortfolioTimeSeriesResult {
  series: TimeSeriesResult;
  /** Raw historical prices (date → price) per ticker, exposed so callers
   *  can derive per-asset series without a duplicate fetch. */
  pricesByTicker: Record<string, Record<string, number>>;
  isLoading: boolean;
  error: string | null;
  failedTickers: string[];
  refreshedAt: number | null;
}

export function usePortfolioTimeSeries(
  transactions: TxInput[],
): UsePortfolioTimeSeriesResult {
  // 1. Derive the ticker set + earliest date
  const tickers = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.ticker))),
    [transactions],
  );
  const fromDate = useMemo(() => {
    if (transactions.length === 0) return null;
    return transactions
      .map((t) => t.trade_date)
      .sort()[0];
  }, [transactions]);

  // 2. Fetch historical prices
  const {
    prices,
    failures,
    isLoading,
    error,
    refreshedAt,
  } = useHistoricalPrices(tickers, fromDate);

  // 3. Compose into a time series (pure memo)
  const series = useMemo(
    () =>
      buildPortfolioTimeSeries(transactions, prices, {
        maxPoints: MAX_CHART_POINTS,
      }),
    [transactions, prices],
  );

  return {
    series,
    pricesByTicker: prices,
    isLoading,
    error,
    failedTickers: failures,
    refreshedAt,
  };
}
