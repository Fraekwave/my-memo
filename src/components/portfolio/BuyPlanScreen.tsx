import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { PortfolioWithAssets } from '@/hooks/usePortfolios';
import { useTransactions } from '@/hooks/useTransactions';
import { useAssetPrices } from '@/hooks/useAssetPrices';
import { computeHoldings } from '@/lib/pnl';
import { planBuys, type BuyRecommendation, type RebalanceAsset } from '@/lib/rebalance';
import { formatKrw, formatShares } from '@/lib/formatNumber';

interface BuyPlanScreenProps {
  userId: string | null;
  portfolio: PortfolioWithAssets;
  onBack: () => void;
  onRecordBuys: (prefill: BuyRecommendation[]) => void;
}

export function BuyPlanScreen({
  userId,
  portfolio,
  onBack,
  onRecordBuys,
}: BuyPlanScreenProps) {
  const { t } = useTranslation();
  const { transactions } = useTransactions(userId, portfolio.portfolio.id);

  // Tickers in this portfolio (stable reference)
  const tickers = useMemo(
    () => portfolio.assets.map((a) => a.ticker),
    [portfolio.assets],
  );

  const { prices, failures, isLoading, refresh, setManualPrice } = useAssetPrices(tickers);

  // Cash input — default = monthly budget
  const [cashInput, setCashInput] = useState(
    String(portfolio.portfolio.monthly_budget ?? 0),
  );

  // Inline manual-entry state: ticker → draft string
  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});

  // Reset drafts when failures change
  useEffect(() => {
    setManualDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const t of failures) next[t] = prev[t] ?? '';
      return next;
    });
  }, [failures]);

  const holdings = useMemo(() => computeHoldings(transactions), [transactions]);

  // Compute the rebalance plan only when all prices are known.
  const allPricesReady = failures.length === 0 && tickers.every((t) => prices[t] != null);
  const cashToInvest = useMemo(() => {
    const n = Number(cashInput);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [cashInput]);

  const plan = useMemo(() => {
    if (!allPricesReady) return null;
    const rebalanceAssets: RebalanceAsset[] = portfolio.assets.map((a) => ({
      ticker: a.ticker,
      targetPct: Number(a.target_pct),
      currentShares: holdings[a.ticker] ?? 0,
      price: prices[a.ticker] ?? 0,
    }));
    return planBuys(rebalanceAssets, cashToInvest, {
      allowFractional: portfolio.portfolio.kind === 'crypto',
    });
  }, [allPricesReady, portfolio.assets, portfolio.portfolio.kind, holdings, prices, cashToInvest]);

  // Look up display name for a ticker
  const nameOf = useCallback(
    (ticker: string) => portfolio.assets.find((a) => a.ticker === ticker)?.name ?? ticker,
    [portfolio.assets],
  );

  const saveManualPrices = useCallback(async () => {
    const entries = Object.entries(manualDrafts).filter(
      ([, v]) => v !== '' && Number(v) > 0,
    );
    for (const [ticker, v] of entries) {
      await setManualPrice(ticker, Number(v));
    }
  }, [manualDrafts, setManualPrice]);

  const fractional = portfolio.portfolio.kind === 'crypto';

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
            {t('portfolio.buyPlanTitle')}
          </h2>
          <p className="text-sm text-stone-500">{portfolio.portfolio.name}</p>
        </div>

        {/* Cash input */}
        <div className="rounded-xl bg-amber-50/50 border border-amber-100/60 p-4">
          <label className="block text-base uppercase tracking-widest text-amber-600 font-semibold mb-1">
            {t('portfolio.buyPlanCash')}
          </label>
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value)}
              className="flex-1 min-w-0 text-2xl font-semibold text-black placeholder-stone-300 bg-transparent outline-none"
            />
            <span className="text-lg text-stone-500">원</span>
          </div>
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
                  <div className="relative w-32 flex-shrink-0">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="0.01"
                      value={manualDrafts[ticker] ?? ''}
                      onChange={(e) =>
                        setManualDrafts((prev) => ({
                          ...prev,
                          [ticker]: e.target.value,
                        }))
                      }
                      placeholder="0"
                      className="w-full pl-3 pr-8 py-2 rounded-lg border border-stone-200 bg-white text-base text-right text-black placeholder-stone-300 outline-none focus:border-amber-400"
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

        {/* Loading state */}
        {isLoading && failures.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-stone-500">{t('portfolio.buyPlanFetchingPrices')}</p>
          </div>
        )}

        {/* Plan results */}
        {plan && (
          <div className="space-y-3">
            {plan.buys.length === 0 ? (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 text-center">
                <p className="text-base text-stone-600">{t('portfolio.buyPlanEmpty')}</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-stone-200 bg-stone-50 divide-y divide-stone-200">
                  {plan.buys.map((b) => {
                    const price = prices[b.ticker] ?? 0;
                    const sharesLabel = fractional
                      ? formatShares(b.sharesToBuy, 8)
                      : `${b.sharesToBuy}주`;
                    return (
                      <div key={b.ticker} className="p-4 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-semibold text-black truncate">
                            {nameOf(b.ticker)}
                          </div>
                          <div className="text-sm text-stone-500 mt-0.5 tabular-nums">
                            {sharesLabel} × {formatKrw(price)}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="text-base font-semibold text-black tabular-nums">
                            {formatKrw(b.estimatedCost)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total + remaining */}
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-1">
                  <div className="flex justify-between text-base">
                    <span className="text-stone-700">{t('portfolio.buyPlanTotal')}</span>
                    <span className="font-semibold text-black tabular-nums">
                      {formatKrw(plan.buys.reduce((s, b) => s + b.estimatedCost, 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">{t('portfolio.buyPlanRemaining')}</span>
                    <span className="text-stone-600 tabular-nums">
                      {formatKrw(plan.remainingCash)}
                    </span>
                  </div>
                </div>

                {/* Record CTA */}
                <button
                  type="button"
                  onClick={() => onRecordBuys(plan.buys)}
                  className="w-full px-4 py-3 rounded-xl bg-amber-700 text-white text-base font-medium hover:bg-amber-800 transition-colors"
                >
                  {t('portfolio.buyPlanRecordBtn')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
