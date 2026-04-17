import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw, Minus, Plus } from 'lucide-react';
import { PortfolioWithAssets } from '@/hooks/usePortfolios';
import { useTransactions } from '@/hooks/useTransactions';
import { useAssetPrices } from '@/hooks/useAssetPrices';
import { computeHoldings } from '@/lib/pnl';
import {
  planBuys,
  type BuyRecommendation,
  type RebalanceAsset,
  type Strategy,
} from '@/lib/rebalance';
import { formatKrw } from '@/lib/formatNumber';
import { PortfolioAsset } from '@/lib/types';

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

// ± step sizes
const ETF_STEP = 1;              // 1 share
const CRYPTO_STEP = 0.00001;     // 0.000010 BTC

/** Does this asset use fractional shares? (crypto only) */
const isFractional = (a: PortfolioAsset) => a.category === '암호화폐';

/** Display a fractional share count with a fixed number of decimals (no trimming). */
function formatFractional(shares: number, decimals = 6): string {
  if (!Number.isFinite(shares) || shares === 0) return (0).toFixed(decimals);
  return shares.toFixed(decimals);
}

/**
 * Round a fractional share count to a given step so floating-point math
 * doesn't produce values like 0.4921870000001.
 */
function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

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

  // Strategy — user picks how the algorithm breaks ties.
  const [strategy, setStrategy] = useState<Strategy>('balanced');

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
  const allPricesReady = failures.length === 0 && tickers.every((x) => prices[x] != null);
  const cashToInvest = useMemo(() => parseKrwInput(cashInput), [cashInput]);

  /**
   * Split the portfolio's assets into crypto and non-crypto groups,
   * split the cash proportionally by target_pct sums, then run planBuys
   * separately for each group (fractional vs integer). Merge results.
   */
  const initialPlan = useMemo(() => {
    if (!allPricesReady) return null;

    const cryptoAssets = portfolio.assets.filter(isFractional);
    const nonCryptoAssets = portfolio.assets.filter((a) => !isFractional(a));

    const cryptoPctSum = cryptoAssets.reduce((s, a) => s + Number(a.target_pct), 0);
    const nonCryptoPctSum = nonCryptoAssets.reduce((s, a) => s + Number(a.target_pct), 0);
    const totalPctSum = cryptoPctSum + nonCryptoPctSum || 1;

    const cryptoCash = Math.round((cashToInvest * cryptoPctSum) / totalPctSum);
    const nonCryptoCash = cashToInvest - cryptoCash;

    // Renormalize target_pct within each subset so each sums to 100.
    const toRebalance = (assets: PortfolioAsset[], subsetPctSum: number): RebalanceAsset[] =>
      assets.map((a) => ({
        ticker: a.ticker,
        targetPct: subsetPctSum > 0 ? (Number(a.target_pct) / subsetPctSum) * 100 : 0,
        currentShares: holdings[a.ticker] ?? 0,
        price: prices[a.ticker] ?? 0,
        category: a.category,
      }));

    const cryptoResult =
      cryptoAssets.length > 0
        ? planBuys(toRebalance(cryptoAssets, cryptoPctSum), cryptoCash, {
            allowFractional: true,
          })
        : {
            buys: [] as BuyRecommendation[],
            remainingCash: cryptoCash,
            projectedWeights: {},
            projectedDrift: 0,
          };

    const nonCryptoResult =
      nonCryptoAssets.length > 0
        ? planBuys(toRebalance(nonCryptoAssets, nonCryptoPctSum), nonCryptoCash, {
            strategy,
          })
        : {
            buys: [] as BuyRecommendation[],
            remainingCash: nonCryptoCash,
            projectedWeights: {},
            projectedDrift: 0,
          };

    return {
      buys: [...cryptoResult.buys, ...nonCryptoResult.buys],
      remainingCash: cryptoResult.remainingCash + nonCryptoResult.remainingCash,
    };
  }, [allPricesReady, portfolio.assets, holdings, prices, cashToInvest, strategy]);

  // User-adjustable share count per ticker.
  const [adjustedShares, setAdjustedShares] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!initialPlan) return;
    const map: Record<string, number> = {};
    for (const a of portfolio.assets) {
      const match = initialPlan.buys.find((b) => b.ticker === a.ticker);
      map[a.ticker] = match ? match.sharesToBuy : 0;
    }
    setAdjustedShares(map);
  }, [initialPlan, portfolio.assets]);

  // Adjust one ticker's share count.
  const adjustShares = useCallback(
    (asset: PortfolioAsset, direction: 1 | -1) => {
      const step = isFractional(asset) ? CRYPTO_STEP : ETF_STEP;
      setAdjustedShares((prev) => {
        const current = prev[asset.ticker] ?? 0;
        let next = current + direction * step;
        if (next < 0) next = 0;
        if (isFractional(asset)) next = roundToStep(next, CRYPTO_STEP);
        else next = Math.round(next);
        return { ...prev, [asset.ticker]: next };
      });
    },
    [],
  );

  const nameOf = useCallback(
    (ticker: string) => portfolio.assets.find((a) => a.ticker === ticker)?.name ?? ticker,
    [portfolio.assets],
  );

  // Build live summary from adjusted shares.
  // Each row includes three weights:
  //   targetPct   — from portfolio_assets.target_pct (static)
  //   currentPct  — holdings × price / total current value (static pre-buy)
  //   accumPct    — (holdings + adjusted) × price / total projected value (live)
  const summary = useMemo(() => {
    if (!initialPlan) return null;

    // Pre-buy totals (based only on current holdings)
    const totalCurrentValue = portfolio.assets.reduce((s, a) => {
      const sh = holdings[a.ticker] ?? 0;
      const pr = prices[a.ticker] ?? 0;
      return s + sh * pr;
    }, 0);

    // Post-buy projected values
    let totalCost = 0;
    const rawRows = portfolio.assets.map((a) => {
      const shares = adjustedShares[a.ticker] ?? 0;
      const price = prices[a.ticker] ?? 0;
      const cost = shares * price;
      totalCost += cost;
      const currentShares = holdings[a.ticker] ?? 0;
      const currentValue = currentShares * price;
      const projectedValue = (currentShares + shares) * price;
      return { asset: a, shares, price, cost, currentValue, projectedValue };
    });

    const totalProjectedValue = totalCurrentValue + totalCost;

    const rows = rawRows.map((r) => ({
      asset: r.asset,
      shares: r.shares,
      price: r.price,
      cost: r.cost,
      targetPct: Number(r.asset.target_pct),
      currentPct:
        totalCurrentValue > 0 ? (r.currentValue / totalCurrentValue) * 100 : 0,
      accumPct:
        totalProjectedValue > 0 ? (r.projectedValue / totalProjectedValue) * 100 : 0,
    }));

    const remaining = cashToInvest - totalCost;
    return { rows, totalCost, remaining, totalCurrentValue, totalProjectedValue };
  }, [initialPlan, portfolio.assets, adjustedShares, prices, holdings, cashToInvest]);

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
        ticker: r.asset.ticker,
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
            {/* Strategy picker */}
            <div>
              <label className="block text-xs uppercase tracking-widest text-stone-500 font-semibold mb-1.5">
                {t('portfolio.buyPlanStrategy')}
              </label>
              <div className="flex items-center gap-1 bg-stone-100 rounded-full p-0.5">
                {(['balanced', 'aggressive', 'conservative'] as Strategy[]).map((s) => {
                  const label =
                    s === 'balanced'
                      ? t('portfolio.strategyBalanced')
                      : s === 'aggressive'
                        ? t('portfolio.strategyAggressive')
                        : t('portfolio.strategyConservative');
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStrategy(s)}
                      className={`flex-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                        strategy === s
                          ? 'bg-amber-700 text-white shadow-sm'
                          : 'text-stone-500 hover:text-stone-700'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-stone-400 mt-1 text-center">
                {strategy === 'balanced'
                  ? t('portfolio.strategyBalancedHint')
                  : strategy === 'aggressive'
                    ? t('portfolio.strategyAggressiveHint')
                    : t('portfolio.strategyConservativeHint')}
              </p>
            </div>

            <p className="text-xs text-stone-500">
              추천 수량입니다. ± 버튼으로 조정할 수 있어요.
            </p>

            <div className="rounded-xl border border-stone-200 bg-stone-50 divide-y divide-stone-200">
              {summary.rows.map((row) => {
                const frac = isFractional(row.asset);
                const sharesLabel = frac
                  ? formatFractional(row.shares, 6)
                  : `${row.shares}주`;
                const perUnitLabel = frac
                  ? `1 ${row.asset.ticker.replace('KRW-', '')}` // "1 BTC"
                  : '1주';
                const canDecrease = frac
                  ? row.shares > 0.000009 // at least one step worth
                  : row.shares >= 1;
                return (
                  <div key={row.asset.ticker} className="p-4">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-semibold text-black truncate">
                          {row.asset.name || row.asset.ticker}
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5 tabular-nums">
                          {formatKrw(row.price)} / {perUnitLabel}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-base font-semibold text-black tabular-nums">
                          {formatKrw(row.cost)}
                        </div>
                      </div>
                    </div>

                    {/* Three-weight pills: target / current / accumulated */}
                    <div className="flex items-center gap-1.5 mb-2 text-xs tabular-nums">
                      <WeightPill label="목표" pct={row.targetPct} tone="target" />
                      <WeightPill label="현재" pct={row.currentPct} tone="current" />
                      <WeightPill
                        label="예상"
                        pct={row.accumPct}
                        tone="accum"
                        diffFromTarget={row.accumPct - row.targetPct}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-stone-600 tabular-nums">
                        {sharesLabel}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adjustShares(row.asset, -1)}
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
                          onClick={() => adjustShares(row.asset, 1)}
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

/**
 * Tiny pill displaying a percentage with a label ("목표 / 현재 / 예상").
 * The "예상" pill optionally colors based on distance to target.
 */
function WeightPill({
  label,
  pct,
  tone,
  diffFromTarget,
}: {
  label: string;
  pct: number;
  tone: 'target' | 'current' | 'accum';
  diffFromTarget?: number;
}) {
  let bg = 'bg-stone-100 text-stone-600';
  if (tone === 'target') {
    bg = 'bg-amber-50 text-amber-700';
  } else if (tone === 'accum') {
    // Color the "예상" pill green-ish when within 1% of target, else neutral/red.
    const drift = Math.abs(diffFromTarget ?? 0);
    if (drift < 1) {
      bg = 'bg-amber-100 text-amber-800 font-medium';
    } else if (drift < 3) {
      bg = 'bg-stone-100 text-stone-700';
    } else {
      bg = 'bg-red-50 text-red-600';
    }
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${bg}`}>
      <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
      <span>{pct.toFixed(1)}%</span>
    </span>
  );
}
