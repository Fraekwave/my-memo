import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw, Minus, Plus } from 'lucide-react';
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

/** Parse a comma-formatted KRW string to a number ("1,234,567" → 1234567). */
function parseKrwInput(s: string): number {
  const cleaned = s.replace(/[^\d]/g, '');
  if (!cleaned) return 0;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Crypto ± button adjusts shares by this KRW amount, converted via current price. */
const CRYPTO_KRW_STEP = 10_000;

export function BuyPlanScreen({
  userId,
  portfolio,
  onBack,
  onRecordBuys,
}: BuyPlanScreenProps) {
  const { t } = useTranslation();
  const { transactions } = useTransactions(userId, portfolio.portfolio.id);

  const tickers = useMemo(
    () => portfolio.assets.map((a) => a.ticker),
    [portfolio.assets],
  );

  const { prices, failures, isLoading, refresh, setManualPrice } = useAssetPrices(tickers);

  // Cash input — default = monthly budget, user can override.
  const [cashInput, setCashInput] = useState(
    String(portfolio.portfolio.monthly_budget ?? 0),
  );

  // Inline manual-entry state: ticker → draft string
  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setManualDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const ticker of failures) next[ticker] = prev[ticker] ?? '';
      return next;
    });
  }, [failures]);

  const holdings = useMemo(() => computeHoldings(transactions), [transactions]);

  const fractional = portfolio.portfolio.kind === 'crypto';
  const allPricesReady = failures.length === 0 && tickers.every((x) => prices[x] != null);

  const cashToInvest = useMemo(() => parseKrwInput(cashInput), [cashInput]);

  // Initial plan from algorithm
  const initialPlan = useMemo(() => {
    if (!allPricesReady) return null;
    const rebalanceAssets: RebalanceAsset[] = portfolio.assets.map((a) => ({
      ticker: a.ticker,
      targetPct: Number(a.target_pct),
      currentShares: holdings[a.ticker] ?? 0,
      price: prices[a.ticker] ?? 0,
    }));
    return planBuys(rebalanceAssets, cashToInvest, {
      allowFractional: fractional,
    });
  }, [allPricesReady, portfolio.assets, fractional, holdings, prices, cashToInvest]);

  // User-adjustable shares-to-buy per ticker. Reset when the initial plan changes.
  const [adjustedShares, setAdjustedShares] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!initialPlan) return;
    const map: Record<string, number> = {};
    // Start every portfolio asset at the plan's recommendation (0 if not bought).
    for (const a of portfolio.assets) {
      const match = initialPlan.buys.find((b) => b.ticker === a.ticker);
      map[a.ticker] = match ? match.sharesToBuy : 0;
    }
    setAdjustedShares(map);
  }, [initialPlan, portfolio.assets]);

  // Adjust one ticker's share count.
  const adjustShares = useCallback(
    (ticker: string, delta: number) => {
      setAdjustedShares((prev) => {
        const current = prev[ticker] ?? 0;
        const price = prices[ticker] ?? 0;
        let next: number;
        if (fractional) {
          // Crypto: delta is in KRW
          const currentKrw = current * price;
          const nextKrw = Math.max(0, currentKrw + delta);
          next = price > 0 ? nextKrw / price : 0;
          // Round to 8 decimals
          next = Math.floor(next * 1e8) / 1e8;
        } else {
          next = Math.max(0, current + delta);
        }
        return { ...prev, [ticker]: next };
      });
    },
    [prices, fractional],
  );

  const nameOf = useCallback(
    (ticker: string) => portfolio.assets.find((a) => a.ticker === ticker)?.name ?? ticker,
    [portfolio.assets],
  );

  // Build live summary from adjusted shares.
  const summary = useMemo(() => {
    if (!initialPlan) return null;
    let totalCost = 0;
    const rows = portfolio.assets
      .map((a) => {
        const shares = adjustedShares[a.ticker] ?? 0;
        const price = prices[a.ticker] ?? 0;
        const cost = shares * price;
        totalCost += cost;
        return { ticker: a.ticker, shares, price, cost };
      })
      .filter((r) => r.shares > 0 || initialPlan.buys.some((b) => b.ticker === r.ticker));
    const remaining = cashToInvest - totalCost;
    return { rows, totalCost, remaining };
  }, [initialPlan, portfolio.assets, adjustedShares, prices, cashToInvest]);

  const saveManualPrices = useCallback(async () => {
    const entries = Object.entries(manualDrafts).filter(
      ([, v]) => v !== '' && Number(v) > 0,
    );
    for (const [ticker, v] of entries) {
      await setManualPrice(ticker, Number(v));
    }
  }, [manualDrafts, setManualPrice]);

  const handleRecord = useCallback(() => {
    if (!summary) return;
    const buys: BuyRecommendation[] = summary.rows
      .filter((r) => r.shares > 0)
      .map((r) => ({
        ticker: r.ticker,
        sharesToBuy: r.shares,
        estimatedCost: r.cost,
      }));
    onRecordBuys(buys);
  }, [summary, onRecordBuys]);

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

        {/* Cash input (comma-formatted) */}
        <div className="rounded-xl bg-amber-50/50 border border-amber-100/60 p-4">
          <label className="block text-base uppercase tracking-widest text-amber-600 font-semibold mb-1">
            {t('portfolio.buyPlanCash')}
          </label>
          <div className="flex items-baseline gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={
                cashInput === '' ? '' : parseKrwInput(cashInput).toLocaleString('ko-KR')
              }
              onChange={(e) =>
                setCashInput(
                  e.target.value === '' ? '' : String(parseKrwInput(e.target.value)),
                )
              }
              className="flex-1 min-w-0 text-2xl font-semibold text-black placeholder-stone-300 bg-transparent outline-none tabular-nums"
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

        {isLoading && failures.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-stone-500">{t('portfolio.buyPlanFetchingPrices')}</p>
          </div>
        )}

        {summary && (
          <div className="space-y-3">
            <p className="text-xs text-stone-500">
              추천 수량입니다. ± 버튼으로 조정할 수 있어요.
            </p>

            <div className="rounded-xl border border-stone-200 bg-stone-50 divide-y divide-stone-200">
              {summary.rows.map((row) => {
                const sharesLabel = fractional
                  ? formatShares(row.shares, 8)
                  : `${row.shares}주`;
                const step = fractional ? CRYPTO_KRW_STEP : 1;
                const canDecrease = fractional
                  ? row.shares * row.price >= step
                  : row.shares >= 1;
                return (
                  <div key={row.ticker} className="p-4">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-semibold text-black truncate">
                          {nameOf(row.ticker)}
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5 tabular-nums">
                          {formatKrw(row.price)} / {fractional ? '1 BTC' : '1주'}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-base font-semibold text-black tabular-nums">
                          {formatKrw(row.cost)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-stone-600 tabular-nums">
                        {sharesLabel}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adjustShares(row.ticker, -step)}
                          disabled={!canDecrease}
                          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                            canDecrease
                              ? 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-100'
                              : 'bg-stone-100 text-stone-300 cursor-not-allowed'
                          }`}
                          aria-label="감소"
                        >
                          <Minus className="w-4 h-4" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustShares(row.ticker, step)}
                          className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-700 text-white hover:bg-amber-800 transition-colors"
                          aria-label="증가"
                        >
                          <Plus className="w-4 h-4" strokeWidth={2} />
                        </button>
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
                  {formatKrw(summary.totalCost)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">{t('portfolio.buyPlanRemaining')}</span>
                <span
                  className={`tabular-nums ${
                    summary.remaining < 0 ? 'text-red-600 font-medium' : 'text-stone-600'
                  }`}
                >
                  {formatKrw(summary.remaining)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRecord}
              disabled={summary.totalCost === 0}
              className={`w-full px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                summary.totalCost > 0
                  ? 'bg-amber-700 text-white hover:bg-amber-800'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              }`}
            >
              {t('portfolio.buyPlanRecordBtn')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
