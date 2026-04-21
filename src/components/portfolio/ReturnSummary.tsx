/**
 * ReturnSummary — the landing card for 포트 mode. Shows cumulative
 * return %, inception date, and a 수익률 추이 chart. Aggregates across
 * all of the user's active portfolios so one number represents her
 * total investing performance.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import type { Transaction } from '@/lib/types';
import { usePortfolioTimeSeries } from '@/hooks/usePortfolioTimeSeries';
import { ReturnChart, type ChartPoint } from './ReturnChart';

interface ReturnSummaryProps {
  userId: string | null;
  portfolioIds: number[]; // active portfolios
}

export function ReturnSummary({ userId, portfolioIds }: ReturnSummaryProps) {
  const { t } = useTranslation();

  // Single fetch: all transactions for all portfolios the user has.
  // Keeps the aggregate computation simple and avoids per-portfolio hooks.
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || portfolioIds.length === 0) {
      setTransactions([]);
      setTxLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setTxLoading(true);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .in('portfolio_id', portfolioIds)
        .order('trade_date', { ascending: true });
      if (cancelled) return;
      if (error) setTxError(error.message);
      else setTransactions(data ?? []);
      setTxLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, portfolioIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Convert DB rows (numeric strings) → typed inputs for the pure lib
  const txInputs = useMemo(
    () =>
      transactions.map((tx) => ({
        ticker: tx.ticker,
        trade_date: tx.trade_date,
        shares: Number(tx.shares),
        price: Number(tx.price),
      })),
    [transactions],
  );

  const { series, isLoading: histLoading } = usePortfolioTimeSeries(txInputs);

  const chartPoints: ChartPoint[] = useMemo(
    () =>
      series.points.map((p) => ({
        date: p.date,
        returnPct: p.returnPct,
      })),
    [series.points],
  );

  const isEmpty = !txLoading && transactions.length === 0;
  const showChart = chartPoints.length > 1;
  const finalPct = series.finalReturnPct;
  const finalPctColor = finalPct > 0 ? 'text-emerald-600' : finalPct < 0 ? 'text-red-600' : 'text-stone-600';

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 mb-4">
      <div className="flex items-baseline justify-between mb-0.5">
        <h2 className="text-base font-semibold text-black">
          {t('portfolio.returnChartTitle')}
          <span className="text-xs text-stone-400 font-normal ml-1.5">
            ({t('portfolio.returnChartSubtitle')})
          </span>
        </h2>
      </div>

      {/* Summary stats row */}
      <div className="flex items-baseline justify-between text-sm mb-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-stone-500">{t('portfolio.cumReturn')}</span>
          <span className={`text-base font-semibold tabular-nums ${finalPctColor}`}>
            {formatSignedPct(finalPct)}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-stone-500">{t('portfolio.inceptionDate')}</span>
          <span className="text-sm text-stone-700 tabular-nums">
            {series.startDate ? formatDateLong(series.startDate) : '—'}
          </span>
        </div>
      </div>

      {/* Chart area */}
      {isEmpty ? (
        <div className="text-center py-12 text-sm text-stone-400">
          {t('portfolio.returnChartEmpty')}
        </div>
      ) : txLoading || histLoading ? (
        <div className="text-center py-12 text-sm text-stone-400">
          {t('portfolio.returnChartLoading')}
        </div>
      ) : showChart ? (
        <ReturnChart points={chartPoints} height={180} seriesLabel="포트폴리오" />
      ) : (
        <div className="text-center py-12 text-sm text-stone-400">
          {t('portfolio.returnChartEmpty')}
        </div>
      )}

      {txError && (
        <p className="text-xs text-red-600 mt-2">{txError}</p>
      )}
    </div>
  );
}

function formatSignedPct(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function formatDateLong(iso: string): string {
  // "2025-01-06" → "2025.01.06"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : iso;
}
