import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { PortfolioWithAssets } from '@/hooks/usePortfolios';
import { useTransactions } from '@/hooks/useTransactions';
import { useAssetPrices } from '@/hooks/useAssetPrices';
import { computePortfolioPnl } from '@/lib/pnl';
import { formatKrw, formatShares, formatSignedPct } from '@/lib/formatNumber';
import { PriceFreshnessLabel } from './PriceFreshnessLabel';

interface PnlDashboardProps {
  userId: string | null;
  portfolio: PortfolioWithAssets;
  onBack: () => void;
}

/** Parse a comma-formatted KRW string to a number. */
function parseKrwInput(s: string): number {
  const cleaned = s.replace(/[^\d]/g, '');
  if (!cleaned) return 0;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

function gainColor(v: number): string {
  if (v > 0) return 'text-emerald-600';
  if (v < 0) return 'text-red-600';
  return 'text-stone-500';
}

export function PnlDashboard({ userId, portfolio, onBack }: PnlDashboardProps) {
  const { t } = useTranslation();
  const { transactions } = useTransactions(userId, portfolio.portfolio.id);

  const tickers = useMemo(
    () => portfolio.assets.map((a) => a.ticker),
    [portfolio.assets],
  );

  const { prices, failures, isLoading, lastFetchedAt, refresh, setManualPrice } = useAssetPrices(tickers);

  // Inline manual-entry state for failed tickers
  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setManualDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const ticker of failures) next[ticker] = prev[ticker] ?? '';
      return next;
    });
  }, [failures]);

  const saveManualPrices = useCallback(async () => {
    const entries = Object.entries(manualDrafts).filter(
      ([, v]) => v !== '' && Number(v) > 0,
    );
    for (const [ticker, v] of entries) {
      await setManualPrice(ticker, Number(v));
    }
  }, [manualDrafts, setManualPrice]);

  const allPricesReady = failures.length === 0 && tickers.every((x) => prices[x] != null);

  const pnl = useMemo(() => {
    if (!allPricesReady) return null;
    return computePortfolioPnl(tickers, transactions, prices);
  }, [allPricesReady, tickers, transactions, prices]);

  const nameOf = useCallback(
    (ticker: string) => portfolio.assets.find((a) => a.ticker === ticker)?.name ?? ticker,
    [portfolio.assets],
  );

  const categoryOf = useCallback(
    (ticker: string) => portfolio.assets.find((a) => a.ticker === ticker)?.category,
    [portfolio.assets],
  );

  const hasTransactions = transactions.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors p-1.5 -ml-1.5 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span>{t('common.back')}</span>
        </button>
        <button
          type="button"
          onClick={() => refresh(true)}
          disabled={isLoading}
          className="p-2 text-stone-400 hover:text-stone-700 transition-colors rounded-lg disabled:opacity-40"
          aria-label="새로고침"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-black mb-1">
            {t('portfolio.pnlTitle')}
          </h2>
          <p className="text-sm text-stone-500">{portfolio.portfolio.name}</p>
        </div>

        {/* Price failures — inline manual entry */}
        {failures.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-3">
            <div>
              <p className="text-base font-semibold text-red-700">
                {t('portfolio.manualPriceTitle')}
              </p>
              <p className="text-sm text-stone-600 mt-0.5">
                {t('portfolio.manualPriceHint')}
              </p>
            </div>
            <div className="space-y-2">
              {failures.map((ticker) => (
                <div key={ticker} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium text-black truncate">
                      {nameOf(ticker)}
                    </div>
                    <div className="text-xs text-stone-400">{ticker}</div>
                  </div>
                  <div className="relative w-36 flex-shrink-0">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={
                        manualDrafts[ticker] == null || manualDrafts[ticker] === ''
                          ? ''
                          : parseKrwInput(manualDrafts[ticker]).toLocaleString('ko-KR')
                      }
                      onChange={(e) =>
                        setManualDrafts((prev) => ({
                          ...prev,
                          [ticker]:
                            e.target.value === ''
                              ? ''
                              : String(parseKrwInput(e.target.value)),
                        }))
                      }
                      placeholder="0"
                      className="w-full pl-3 pr-8 py-2 rounded-lg border border-stone-200 bg-white text-base text-right text-black placeholder-stone-300 outline-none focus:border-amber-400 tabular-nums"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none">
                      원
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={saveManualPrices}
              className="w-full px-4 py-2 rounded-lg bg-amber-700 text-white text-base font-medium hover:bg-amber-800 transition-colors"
            >
              {t('portfolio.manualPriceSaveBtn')}
            </button>
          </div>
        )}

        {/* Loading */}
        {isLoading && failures.length === 0 && !pnl && (
          <div className="text-center py-8">
            <p className="text-sm text-stone-500">{t('portfolio.buyPlanFetchingPrices')}</p>
          </div>
        )}

        {/* No transactions */}
        {!isLoading && !pnl && hasTransactions === false && failures.length === 0 && (
          <div className="text-center py-16">
            <p className="text-stone-400 text-base">{t('portfolio.noTransactionsYet')}</p>
            <p className="text-stone-300 text-sm mt-1">{t('portfolio.historyEmpty')}</p>
          </div>
        )}

        {/* P&L Summary + Asset List */}
        {pnl && (
          <div className="space-y-4">
            {/* Portfolio Summary Card */}
            <div className="rounded-xl bg-amber-50/50 border border-amber-100/60 p-4 space-y-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-amber-600 font-semibold">
                  {t('portfolio.pnlCurrentValue')}
                </div>
                <div className="text-2xl font-semibold text-black tabular-nums">
                  {formatKrw(pnl.totalCurrentValue)}
                </div>
                {lastFetchedAt != null && (
                  <div className="mt-0.5">
                    <PriceFreshnessLabel lastFetchedAt={lastFetchedAt} />
                  </div>
                )}
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-stone-500">{t('portfolio.pnlCostBasis')}</span>
                <span className="text-black tabular-nums">{formatKrw(pnl.totalCostBasis)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-stone-500">{t('portfolio.pnlGain')}</span>
                <span className={`font-medium tabular-nums ${gainColor(pnl.totalUnrealizedGain)}`}>
                  {pnl.totalUnrealizedGain >= 0 ? '+' : ''}{formatKrw(pnl.totalUnrealizedGain)}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-stone-500">{t('portfolio.pnlReturnPct')}</span>
                <span className={`font-medium tabular-nums ${gainColor(pnl.totalReturnPct)}`}>
                  {formatSignedPct(pnl.totalReturnPct)}
                </span>
              </div>
            </div>

            {/* Per-Asset List */}
            {pnl.assets.some((a) => a.totalShares > 0) && (
              <div className="rounded-xl border border-stone-200 bg-stone-50 divide-y divide-stone-200">
                {pnl.assets
                  .filter((a) => a.totalShares > 0)
                  .map((asset) => {
                    const isCrypto = categoryOf(asset.ticker) === '암호화폐';
                    const sharesLabel = isCrypto
                      ? formatShares(asset.totalShares)
                      : `${formatShares(asset.totalShares)}주`;
                    return (
                      <div key={asset.ticker} className="p-4">
                        <div className="flex items-start justify-between mb-1">
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-black truncate">
                              {nameOf(asset.ticker)}
                            </div>
                            <div className="text-xs text-stone-400 mt-0.5">
                              {asset.ticker} · {sharesLabel}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <div className="text-base font-semibold text-black tabular-nums">
                              {formatKrw(asset.currentValue)}
                            </div>
                            <div className={`text-xs font-medium tabular-nums ${gainColor(asset.returnPct)}`}>
                              {formatSignedPct(asset.returnPct)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-stone-500 mt-2">
                          <span>{t('portfolio.pnlCostLabel')} {formatKrw(asset.costBasis)}</span>
                          <span className={gainColor(asset.unrealizedGain)}>
                            {asset.unrealizedGain >= 0 ? '+' : ''}{formatKrw(asset.unrealizedGain)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
