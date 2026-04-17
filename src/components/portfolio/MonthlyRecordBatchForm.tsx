import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { PortfolioWithAssets } from '@/hooks/usePortfolios';
import { useTransactions, TransactionInput } from '@/hooks/useTransactions';
import type { BuyRecommendation } from '@/lib/rebalance';
import { formatKrw } from '@/lib/formatNumber';

interface MonthlyRecordBatchFormProps {
  userId: string | null;
  portfolio: PortfolioWithAssets;
  prefill?: BuyRecommendation[];
  onBack: () => void;
  onDone: () => void;
}

interface DraftRow {
  ticker: string;
  name: string;
  shares: string;
  price: string;
}

function todayIso(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function MonthlyRecordBatchForm({
  userId,
  portfolio,
  prefill,
  onBack,
  onDone,
}: MonthlyRecordBatchFormProps) {
  const { t } = useTranslation();
  const { bulkInsert } = useTransactions(userId, portfolio.portfolio.id);

  const [tradeDate, setTradeDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build initial rows. One row per portfolio asset, pre-filled from prefill if available.
  const [rows, setRows] = useState<DraftRow[]>(() => {
    const prefillMap = new Map<string, BuyRecommendation>();
    for (const p of prefill ?? []) prefillMap.set(p.ticker, p);

    return portfolio.assets.map((a) => {
      const pre = prefillMap.get(a.ticker);
      const pricePerShare =
        pre && pre.sharesToBuy > 0 ? pre.estimatedCost / pre.sharesToBuy : 0;
      return {
        ticker: a.ticker,
        name: a.name,
        shares: pre ? String(pre.sharesToBuy) : '',
        price: pre && pricePerShare > 0 ? String(Math.round(pricePerShare)) : '',
      };
    });
  });

  const updateRow = (idx: number, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  // Filter rows that will actually be inserted (shares > 0 AND price > 0)
  const validRows = useMemo(
    () =>
      rows.filter((r) => {
        const s = Number(r.shares);
        const p = Number(r.price);
        return Number.isFinite(s) && s > 0 && Number.isFinite(p) && p > 0;
      }),
    [rows],
  );

  const totalCost = useMemo(
    () =>
      validRows.reduce((sum, r) => sum + Number(r.shares) * Number(r.price), 0),
    [validRows],
  );

  const canSave = validRows.length > 0 && !saving && !!tradeDate;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      const inputs: TransactionInput[] = validRows.map((r) => ({
        ticker: r.ticker,
        trade_date: tradeDate,
        shares: Number(r.shares),
        price: Number(r.price),
        note: note.trim() || undefined,
      }));
      const { inserted, failed } = await bulkInsert(inputs);
      if (failed > 0 && inserted === 0) {
        setError('저장에 실패했어요');
      } else {
        onDone();
      }
    } catch (err: any) {
      setError(err?.message ?? '저장에 실패했어요');
    } finally {
      setSaving(false);
    }
  }, [canSave, validRows, tradeDate, note, bulkInsert, onDone]);

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
          onClick={handleSave}
          disabled={!canSave}
          className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
            canSave
              ? 'bg-amber-700 text-white hover:bg-amber-800'
              : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          }`}
        >
          {saving
            ? t('portfolio.savingBtn')
            : t('portfolio.recordSaveAllBtn')}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-black mb-1">
            {t('portfolio.recordBatchTitle')}
          </h2>
          <p className="text-sm text-stone-500">{portfolio.portfolio.name}</p>
        </div>

        {/* Shared fields */}
        <div className="rounded-xl bg-amber-50/50 border border-amber-100/60 p-4 space-y-3">
          <div>
            <label className="block text-base uppercase tracking-widest text-amber-600 font-semibold mb-1">
              {t('portfolio.recordDate')}
            </label>
            <input
              type="date"
              value={tradeDate}
              onChange={(e) => setTradeDate(e.target.value)}
              className="w-full text-base text-black bg-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-base uppercase tracking-widest text-amber-600 font-semibold mb-1">
              {t('portfolio.recordNote')}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder=""
              className="w-full text-base text-black placeholder-stone-300 bg-transparent outline-none"
            />
          </div>
        </div>

        {/* Row grid */}
        <div>
          <p className="text-xs text-stone-400 mb-2">{t('portfolio.recordEmptyHint')}</p>
          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div
                key={row.ticker}
                className="rounded-xl border border-stone-200 bg-stone-50 p-3"
              >
                <div className="text-base font-semibold text-black mb-1 truncate">
                  {row.name}
                </div>
                <div className="text-xs text-stone-400 mb-2">{row.ticker}</div>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs text-stone-500 mb-0.5">
                      {t('portfolio.recordShares')}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={row.shares}
                      onChange={(e) => updateRow(idx, { shares: e.target.value })}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-base text-right text-black placeholder-stone-300 outline-none focus:border-amber-400 tabular-nums"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs text-stone-500 mb-0.5">
                      {t('portfolio.recordPrice')}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="any"
                        value={row.price}
                        onChange={(e) => updateRow(idx, { price: e.target.value })}
                        placeholder="0"
                        className="w-full pl-3 pr-8 py-2 rounded-lg border border-stone-200 bg-white text-base text-right text-black placeholder-stone-300 outline-none focus:border-amber-400 tabular-nums"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none">
                        원
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        {validRows.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 flex justify-between">
            <span className="text-base text-stone-700">
              {t('portfolio.buyPlanTotal')}
            </span>
            <span className="text-base font-semibold text-black tabular-nums">
              {formatKrw(totalCost)}
            </span>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
