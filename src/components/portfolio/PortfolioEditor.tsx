import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { PortfolioWithAssets, PortfolioInput, AssetInput } from '@/hooks/usePortfolios';
import { PortfolioKind, AssetCategory } from '@/lib/types';

interface PortfolioEditorProps {
  existing: PortfolioWithAssets | null;
  onCreate: (input: PortfolioInput, assets: AssetInput[]) => Promise<void> | void;
  onUpdate: (input: PortfolioInput, assets: AssetInput[]) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onBack: () => void;
}

const ALL_CATEGORIES: readonly AssetCategory[] = [
  '국내주식',
  '해외주식',
  '채권',
  '금',
  '원자재',
  '리츠',
  '암호화폐',
  '기타',
];

// Default BTC asset row when a new crypto portfolio is created.
const DEFAULT_BTC_ROW: DraftAsset = {
  ticker: 'KRW-BTC',
  name: '비트코인',
  category: '암호화폐',
  target_pct: 100,
};

interface DraftAsset {
  ticker: string;
  name: string;
  category: AssetCategory;
  target_pct: number;
}

export function PortfolioEditor({
  existing,
  onCreate,
  onUpdate,
  onDelete,
  onBack,
}: PortfolioEditorProps) {
  const { t } = useTranslation();
  const isEdit = existing !== null;

  // Form state
  const [name, setName] = useState(existing?.portfolio.name ?? '');
  const [kind, setKind] = useState<PortfolioKind>(existing?.portfolio.kind ?? 'etf');
  const [monthlyBudget, setMonthlyBudget] = useState(
    existing?.portfolio.monthly_budget != null
      ? String(existing.portfolio.monthly_budget)
      : '',
  );
  const [benchmarkTicker, setBenchmarkTicker] = useState(
    existing?.portfolio.benchmark_ticker ?? '',
  );

  const initialAssets: DraftAsset[] = useMemo(() => {
    if (existing && existing.assets.length > 0) {
      return existing.assets.map((a) => ({
        ticker: a.ticker,
        name: a.name,
        category: a.category,
        target_pct: Number(a.target_pct),
      }));
    }
    // New portfolio: seed with BTC row if crypto, else one blank row
    return [];
  }, [existing]);

  const [assets, setAssets] = useState<DraftAsset[]>(() => {
    if (initialAssets.length > 0) return initialAssets;
    if (kind === 'crypto') return [{ ...DEFAULT_BTC_ROW }];
    return [{ ticker: '', name: '', category: '국내주식', target_pct: 0 }];
  });

  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const totalPct = useMemo(
    () => assets.reduce((s, a) => s + (Number(a.target_pct) || 0), 0),
    [assets],
  );
  const totalPctOk = Math.abs(totalPct - 100) < 0.01;

  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    const budget = Number(monthlyBudget);
    if (!Number.isFinite(budget) || budget < 0) return false;
    if (assets.length === 0) return false;
    if (!totalPctOk) return false;
    for (const a of assets) {
      if (!a.ticker.trim()) return false;
      if (!a.name.trim()) return false;
      if (a.target_pct < 0) return false;
    }
    return true;
  }, [name, monthlyBudget, assets, totalPctOk]);

  const handleKindChange = (next: PortfolioKind) => {
    setKind(next);
    // If switching from etf → crypto and the current assets look like
    // default ETF placeholders, seed a BTC row. Don't overwrite real data.
    if (next === 'crypto' && !isEdit) {
      const allBlank = assets.every((a) => !a.ticker.trim() && !a.name.trim());
      if (allBlank) {
        setAssets([{ ...DEFAULT_BTC_ROW }]);
      }
    }
    if (next === 'etf' && !isEdit && assets.length === 1 && assets[0].ticker === 'KRW-BTC') {
      setAssets([{ ticker: '', name: '', category: '국내주식', target_pct: 0 }]);
    }
  };

  const updateAsset = (idx: number, patch: Partial<DraftAsset>) => {
    setAssets((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  const addAssetRow = () => {
    setAssets((prev) => [
      ...prev,
      {
        ticker: '',
        name: '',
        category: kind === 'crypto' ? '암호화폐' : '국내주식',
        target_pct: 0,
      },
    ]);
  };

  const removeAssetRow = (idx: number) => {
    setAssets((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = useCallback(async () => {
    if (!canSave || isSaving) return;
    setSaveError(null);
    setIsSaving(true);

    const portfolioInput: PortfolioInput = {
      name: name.trim(),
      kind,
      monthly_budget: Number(monthlyBudget),
      benchmark_ticker: benchmarkTicker.trim() || null,
    };
    const assetInputs: AssetInput[] = assets.map((a, i) => ({
      ticker: a.ticker.trim(),
      name: a.name.trim(),
      category: a.category,
      target_pct: Number(a.target_pct),
      order_index: i,
    }));

    try {
      if (isEdit) {
        await onUpdate(portfolioInput, assetInputs);
      } else {
        await onCreate(portfolioInput, assetInputs);
      }
    } catch (err: any) {
      setSaveError(err?.message ?? '저장에 실패했어요');
    } finally {
      setIsSaving(false);
    }
  }, [
    canSave,
    isSaving,
    isEdit,
    name,
    kind,
    monthlyBudget,
    benchmarkTicker,
    assets,
    onCreate,
    onUpdate,
  ]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    await onDelete();
  }, [onDelete]);

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
          disabled={!canSave || isSaving}
          className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
            canSave && !isSaving
              ? 'bg-amber-700 text-white hover:bg-amber-800'
              : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          }`}
        >
          {isSaving ? t('portfolio.savingBtn') : t('portfolio.saveBtn')}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <h2 className="text-xl font-semibold text-black">
          {isEdit ? t('portfolio.editorTitleEdit') : t('portfolio.editorTitleNew')}
        </h2>

        {/* Basic info — warm amber card */}
        <div className="rounded-xl bg-amber-50/50 border border-amber-100/60 p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-base uppercase tracking-widest text-amber-600 font-semibold mb-1">
              {t('portfolio.fieldName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('portfolio.fieldNamePlaceholder')}
              className="w-full text-base font-semibold text-black placeholder-stone-300 bg-transparent outline-none"
            />
          </div>

          {/* Kind */}
          <div>
            <label className="block text-base uppercase tracking-widest text-amber-600 font-semibold mb-1">
              {t('portfolio.fieldKind')}
            </label>
            <div className="flex gap-2">
              {(['etf', 'crypto'] as PortfolioKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleKindChange(k)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    kind === k
                      ? 'bg-amber-700 text-white'
                      : 'bg-stone-100 text-stone-500 hover:text-stone-700'
                  }`}
                >
                  {k === 'etf' ? t('portfolio.kindEtf') : t('portfolio.kindCrypto')}
                </button>
              ))}
            </div>
          </div>

          {/* Monthly budget + Benchmark on one row */}
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <label className="block text-base uppercase tracking-widest text-amber-600 font-semibold mb-1">
                {t('portfolio.fieldMonthlyBudget')}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                placeholder={t('portfolio.fieldMonthlyBudgetPlaceholder')}
                className="w-full text-base text-black placeholder-stone-300 bg-transparent outline-none"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-base uppercase tracking-widest text-amber-600 font-semibold mb-1">
                {t('portfolio.fieldBenchmark')}
              </label>
              <input
                type="text"
                value={benchmarkTicker}
                onChange={(e) => setBenchmarkTicker(e.target.value)}
                placeholder="069500"
                className="w-full text-base text-black placeholder-stone-300 bg-transparent outline-none"
              />
              <p className="text-xs text-stone-400 mt-0.5">{t('portfolio.fieldBenchmarkHint')}</p>
            </div>
          </div>
        </div>

        {/* Assets section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-semibold text-black">{t('portfolio.assetsTitle')}</h3>
            <span
              className={`text-sm font-medium tabular-nums ${
                totalPctOk ? 'text-amber-700' : 'text-red-600'
              }`}
            >
              {t('portfolio.totalPctLabel')}: {totalPct.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-stone-400 mb-3">{t('portfolio.assetsHint')}</p>

          <div className="space-y-3">
            {assets.map((asset, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-2"
              >
                {/* Row 1: ticker + name */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={asset.ticker}
                    onChange={(e) => updateAsset(idx, { ticker: e.target.value.trim() })}
                    placeholder={t('portfolio.assetTickerPlaceholder')}
                    className="w-28 flex-shrink-0 px-3 py-2 rounded-lg border border-stone-200 bg-white text-base text-black placeholder-stone-300 outline-none focus:border-amber-400"
                  />
                  <input
                    type="text"
                    value={asset.name}
                    onChange={(e) => updateAsset(idx, { name: e.target.value })}
                    placeholder={t('portfolio.assetNamePlaceholder')}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-stone-200 bg-white text-base text-black placeholder-stone-300 outline-none focus:border-amber-400"
                  />
                </div>
                {/* Row 2: category + target_pct + remove */}
                <div className="flex gap-2 items-center">
                  <select
                    value={asset.category}
                    onChange={(e) =>
                      updateAsset(idx, { category: e.target.value as AssetCategory })
                    }
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-stone-200 bg-white text-base text-black outline-none focus:border-amber-400"
                  >
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <div className="relative w-24 flex-shrink-0">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.1"
                      value={asset.target_pct}
                      onChange={(e) =>
                        updateAsset(idx, { target_pct: Number(e.target.value) || 0 })
                      }
                      placeholder="0"
                      className="w-full pl-3 pr-7 py-2 rounded-lg border border-stone-200 bg-white text-base text-right text-black placeholder-stone-300 outline-none focus:border-amber-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-base pointer-events-none">
                      %
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAssetRow(idx)}
                    disabled={assets.length === 1}
                    className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                      assets.length === 1
                        ? 'text-stone-200 cursor-not-allowed'
                        : 'text-stone-400 hover:text-red-600 hover:bg-red-50'
                    }`}
                    aria-label="자산 제거"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Warning if total pct off */}
          {!totalPctOk && assets.length > 0 && (
            <p className="text-sm text-red-600 mt-2">
              {t('portfolio.totalPctWarning', { pct: totalPct.toFixed(1) })}
            </p>
          )}

          <button
            type="button"
            onClick={addAssetRow}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-stone-300 text-stone-500 hover:border-amber-400 hover:text-amber-700 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span className="text-base font-medium">{t('portfolio.addAsset')}</span>
          </button>
        </div>

        {saveError && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}
      </div>

      {/* Delete button at bottom (edit mode only) */}
      {isEdit && onDelete && (
        <div className="px-4 py-3 border-t border-stone-100">
          {showDeleteConfirm ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-red-500 flex-1 min-w-0">
                {t('portfolio.deleteConfirmHint')}
              </span>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-xs text-stone-500 hover:text-stone-700 px-3 py-1.5 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-stone-400 hover:text-red-600 transition-colors"
            >
              {t('portfolio.deleteBtn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
