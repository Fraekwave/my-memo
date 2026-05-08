/**
 * ReturnSummary — per-portfolio P&L chart card with a what-if simulation.
 * Default: shows the actual portfolio return line. Tap any asset pill to
 * "exclude" it; the chart adds a recomputed line showing what the portfolio
 * would have looked like without that asset (or set of assets).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioWithAssets } from '@/hooks/usePortfolios';
import { useTransactions } from '@/hooks/useTransactions';
import { useAssetPrices } from '@/hooks/useAssetPrices';
import { usePortfolioTimeSeries } from '@/hooks/usePortfolioTimeSeries';
import {
  ReturnChart,
  TOTAL_COLOR,
  type ChartSeries,
} from './ReturnChart';
import { PriceFreshnessLabel } from './PriceFreshnessLabel';
import { buildPortfolioTimeSeries, type TxInput } from '@/lib/portfolioTimeSeries';

// Simulated (what-if) line color. Theme-aware: amber-700 in light, brighter
// orange-400 in dark, both clearly distinct from the white/black reference line.
const SIMULATED_COLOR = 'var(--chart-simulated)';

interface ReturnSummaryProps {
  userId: string | null;
  portfolio: PortfolioWithAssets;
}

export function ReturnSummary({ userId, portfolio }: ReturnSummaryProps) {
  const { t } = useTranslation();
  const portfolioId = portfolio.portfolio.id;

  // Defensive: pin the asset order so pills don't shuffle across renders.
  // usePortfolios already sorts on fetch + edit, but this guards against
  // stale caches and any future regression.
  const sortedAssets = useMemo(
    () =>
      [...portfolio.assets].sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
      ),
    [portfolio.assets],
  );

  const { transactions, isLoading: txLoading, error: txError } = useTransactions(
    userId,
    portfolioId,
  );

  const txInputs: TxInput[] = useMemo(
    () =>
      transactions
        .map((tx) => ({
          ticker: tx.ticker,
          trade_date: tx.trade_date,
          shares: Number(tx.shares),
          price: Number(tx.price),
        }))
        .sort((a, b) => a.trade_date.localeCompare(b.trade_date)),
    [transactions],
  );
  const currentTickers = useMemo(
    () => sortedAssets.map((a) => a.ticker),
    [sortedAssets],
  );
  const {
    prices: currentPrices,
    isLoading: currentLoading,
    lastFetchedAt: currentFetchedAt,
  } = useAssetPrices(currentTickers);

  const {
    series: totalSeries,
    isLoading: histLoading,
    refreshedAt,
    pricesByTicker,
  } = usePortfolioTimeSeries(txInputs, currentPrices);

  // What-if state: which assets are EXCLUDED from the simulation.
  // Default = empty set (no exclusions, simulation matches reality).
  const [excludedAssets, setExcludedAssets] = useState<Set<string>>(new Set());
  const toggleExclude = (ticker: string) =>
    setExcludedAssets((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  const resetExclusions = () => setExcludedAssets(new Set());

  // Per-asset final return % — informative even when not excluded ("BTC has done +52% so far").
  const assetFinalPct = useMemo(() => {
    const out = new Map<string, number>();
    for (const a of sortedAssets) {
      const onlyThis = txInputs.filter((tx) => tx.ticker === a.ticker);
      if (onlyThis.length === 0) continue;
      const result = buildPortfolioTimeSeries(onlyThis, pricesByTicker, {
        finalPrices: currentPrices,
      });
      out.set(a.ticker, result.finalReturnPct);
    }
    return out;
  }, [txInputs, pricesByTicker, currentPrices, sortedAssets]);

  // Simulated (= total minus excluded assets) recomputed when toggles change.
  // Skipped entirely when nothing is excluded.
  const simulatedSeries = useMemo(() => {
    if (excludedAssets.size === 0) return null;
    const remaining = txInputs.filter((tx) => !excludedAssets.has(tx.ticker));
    if (remaining.length === 0) return null; // every asset excluded — degenerate
    return buildPortfolioTimeSeries(remaining, pricesByTicker, {
      maxPoints: 365,
      finalPrices: currentPrices,
    });
  }, [excludedAssets, txInputs, pricesByTicker, currentPrices]);

  // Human-readable list of excluded names for the simulated line label.
  const excludedNamesLabel = useMemo(() => {
    if (excludedAssets.size === 0) return '';
    const names = sortedAssets
      .filter((a) => excludedAssets.has(a.ticker))
      .map((a) => a.name || a.ticker);
    // Cap to 2 names then "외 N"
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}`;
  }, [excludedAssets, sortedAssets]);

  // Build chart series: baseline always, simulated only when something is excluded.
  const chartSeries: ChartSeries[] = useMemo(() => {
    const list: ChartSeries[] = [];
    const baselinePoints = totalSeries.points.map((p) => ({
      date: p.date,
      returnPct: p.returnPct,
    }));
    if (baselinePoints.length === 0) return list;

    list.push({
      id: 'actual',
      label: t('portfolio.actualSeriesLabel'),
      color: TOTAL_COLOR,
      points: baselinePoints,
      // Baseline stays primary so the X-axis ticks track the longest series.
      isPrimary: true,
      // Stay full opacity even with overlays — it's the visual anchor; thicker
      // stroke + darker color already separate it from the simulated line.
      opacity: 1,
    });

    if (simulatedSeries) {
      list.push({
        id: 'simulated',
        label: t('portfolio.simulatedSeriesLabel', { names: excludedNamesLabel }),
        color: SIMULATED_COLOR,
        points: simulatedSeries.points.map((p) => ({
          date: p.date,
          returnPct: p.returnPct,
        })),
      });
    }

    return list;
  }, [totalSeries.points, simulatedSeries, excludedNamesLabel, t]);

  const isEmpty = !txLoading && transactions.length === 0;
  const hasChart = chartSeries.length > 0 && (chartSeries[0]?.points.length ?? 0) > 1;
  const isRefreshing = txLoading || histLoading || currentLoading;

  // Headline number = baseline final return. The simulated number is shown
  // separately below the toggles so the user always sees both.
  const finalPct = totalSeries.finalReturnPct;
  const finalPctColor =
    finalPct > 0 ? 'text-emerald-600' : finalPct < 0 ? 'text-red-600' : 'text-stone-600';
  const simulatedPct = simulatedSeries?.finalReturnPct ?? null;
  const simulatedPctColor =
    simulatedPct == null
      ? 'text-stone-500'
      : simulatedPct > 0
        ? 'text-emerald-600'
        : simulatedPct < 0
          ? 'text-red-600'
          : 'text-stone-600';

  return (
    <div className="bg-white">
      {/* Summary stats row */}
      <div className="flex items-baseline justify-between text-sm mb-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-stone-500">{t('portfolio.cumReturn')}</span>
          <span className={`text-lg font-semibold tabular-nums ${finalPctColor}`}>
            {formatSignedPct(finalPct)}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-stone-500">{t('portfolio.inceptionDate')}</span>
          <span className="text-sm text-stone-700 tabular-nums">
            {totalSeries.startDate ? formatDateLong(totalSeries.startDate) : '—'}
          </span>
        </div>
      </div>

      {(currentFetchedAt ?? refreshedAt) != null && !isEmpty && (
        <div className="mb-2">
          <PriceFreshnessLabel lastFetchedAt={currentFetchedAt ?? refreshedAt} />
        </div>
      )}

      {/* Chart area */}
      {isEmpty ? (
        <div className="text-center py-12 text-sm text-stone-400">
          {t('portfolio.returnChartEmpty')}
        </div>
      ) : hasChart ? (
        <div className={isRefreshing ? 'opacity-70 transition-opacity' : ''}>
          <ReturnChart series={chartSeries} height={180} />
        </div>
      ) : isRefreshing ? (
        <div className="text-center py-12 text-sm text-stone-400">
          {t('portfolio.returnChartLoading')}
        </div>
      ) : (
        <div className="text-center py-12 text-sm text-stone-400">
          {t('portfolio.returnChartEmpty')}
        </div>
      )}

      {/* Per-asset toggle row.
          The header above the pills is a CONSTANT-HEIGHT two-row block
          (min-height pinned) so toggling assets never shifts the pill grid
          vertically. Row 1: helper text + reset link. Row 2: simulated
          summary (or invisible spacer when nothing is excluded). */}
      {hasChart && sortedAssets.length > 0 && (
        <div className="mt-3">
          {/* Row 1 — helper / reset */}
          <div className="flex items-center justify-between min-h-[18px]">
            <div className="text-xs text-stone-400">
              {excludedAssets.size === 0
                ? t('portfolio.assetTogglesHint')
                : t('portfolio.simulatedExcludedCount', { count: excludedAssets.size })}
            </div>
            <button
              type="button"
              onClick={resetExclusions}
              className={`text-xs font-medium transition-opacity ${
                excludedAssets.size > 0
                  ? 'text-amber-700 hover:text-amber-800 opacity-100'
                  : 'text-amber-700 opacity-0 pointer-events-none'
              }`}
            >
              {t('portfolio.simulatedReset')}
            </button>
          </div>

          {/* Row 2 — simulated summary (always reserves height; invisible when idle) */}
          <div
            className={`mt-1 mb-2 text-sm flex items-center gap-2 min-h-[20px] transition-opacity ${
              simulatedPct != null ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-hidden={simulatedPct == null}
          >
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: SIMULATED_COLOR }}
            />
            <span className="text-stone-500 truncate">
              {excludedNamesLabel ? `${excludedNamesLabel} 제외` : '\u00A0'}
            </span>
            <span className={`font-semibold tabular-nums ${simulatedPctColor}`}>
              {simulatedPct != null ? formatSignedPct(simulatedPct) : '\u00A0'}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {sortedAssets.map((a) => {
              const excluded = excludedAssets.has(a.ticker);
              const pct = assetFinalPct.get(a.ticker);
              const pctText = pct != null ? formatSignedPct(pct) : '—';
              const pctColor =
                pct == null
                  ? 'text-stone-400'
                  : pct > 0
                    ? 'text-emerald-600'
                    : pct < 0
                      ? 'text-red-600'
                      : 'text-stone-500';
              return (
                <button
                  key={a.ticker}
                  type="button"
                  onClick={() => toggleExclude(a.ticker)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors ${
                    excluded
                      ? 'border-stone-200 bg-stone-100 text-stone-400'
                      : 'border-stone-300 bg-stone-50 text-stone-800 hover:bg-stone-100'
                  }`}
                  aria-pressed={!excluded}
                  title={excluded ? '시뮬레이션에서 제외됨 — 탭하여 다시 포함' : '탭하여 시뮬레이션에서 제외'}
                >
                  <span
                    className={`font-medium truncate max-w-[100px] ${
                      excluded ? 'line-through' : ''
                    }`}
                  >
                    {a.name || a.ticker}
                  </span>
                  <span className={`tabular-nums ${excluded ? 'text-stone-400' : pctColor}`}>
                    {pctText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {txError && <p className="text-xs text-red-600 mt-2">{txError}</p>}
    </div>
  );
}

function formatSignedPct(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function formatDateLong(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : iso;
}
