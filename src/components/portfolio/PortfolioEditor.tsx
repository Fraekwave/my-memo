import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { PortfolioWithAssets, PortfolioInput, AssetInput } from '@/hooks/usePortfolios';
import { AssetCategory, PortfolioKind } from '@/lib/types';
import { resolveTickerName, prewarmTickerNameResolver } from '@/lib/tickerName';
import {
  BENCHMARK_PRESETS,
  makeBenchmarkPresetRef,
  resolveBenchmarkReference,
  type BenchmarkPresetId,
} from '@/lib/benchmarkPortfolios';

interface PortfolioEditorProps {
  existing: PortfolioWithAssets | null;
  onCreate: (input: PortfolioInput, assets: AssetInput[]) => Promise<void> | void;
  onUpdate: (input: PortfolioInput, assets: AssetInput[]) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onBack: () => void;
}

const ALL_CATEGORIES: readonly AssetCategory[] = [
  '주식',
  '채권',
  '금',
  '원자재',
  '리츠',
  '암호화폐',
  '현금',
];

const BTC_TICKER = 'KRW-BTC';
const BTC_NAME = '비트코인';

interface DraftAsset {
  ticker: string;
  name: string;
  category: AssetCategory;
  target_pct: number;
}

type BenchmarkMode = 'none' | 'custom' | BenchmarkPresetId;

/**
 * Derive the portfolio kind from its asset categories.
 * All crypto → 'crypto' (fractional shares). Otherwise → 'etf' (integer shares).
 */
function deriveKind(assets: DraftAsset[]): PortfolioKind {
  if (assets.length === 0) return 'etf';
  return assets.every((a) => a.category === '암호화폐') ? 'crypto' : 'etf';
}

/** Parse a comma-formatted KRW string to a number ("1,234,567" → 1234567). */
function parseKrwInput(s: string): number {
  const cleaned = s.replace(/[^\d]/g, '');
  if (!cleaned) return 0;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

function getInitialBenchmarkState(value: string | null | undefined): {
  mode: BenchmarkMode;
  customTicker: string;
} {
  const ref = resolveBenchmarkReference(value);
  if (ref.kind === 'none') return { mode: 'none', customTicker: '' };
  if (ref.kind === 'preset') return { mode: ref.preset.id, customTicker: '' };
  return { mode: 'custom', customTicker: ref.ticker };
}

function toBenchmarkReferenceValue(
  mode: BenchmarkMode,
  customTicker: string,
): string | null {
  if (mode === 'none') return null;
  if (mode === 'custom') return customTicker.trim() || null;
  return makeBenchmarkPresetRef(mode);
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
  const [monthlyBudget, setMonthlyBudget] = useState(
    existing?.portfolio.monthly_budget != null && existing.portfolio.monthly_budget > 0
      ? String(existing.portfolio.monthly_budget)
      : '',
  );
  const initialBenchmark = useMemo(
    () => getInitialBenchmarkState(existing?.portfolio.benchmark_ticker),
    [existing?.portfolio.benchmark_ticker],
  );
  const [benchmarkMode, setBenchmarkMode] = useState<BenchmarkMode>(initialBenchmark.mode);
  const [customBenchmarkTicker, setCustomBenchmarkTicker] = useState(initialBenchmark.customTicker);

  const initialAssets: DraftAsset[] = useMemo(() => {
    if (existing && existing.assets.length > 0) {
      return existing.assets.map((a) => ({
        ticker: a.ticker,
        name: a.name,
        category: a.category,
        target_pct: Number(a.target_pct),
      }));
    }
    return [];
  }, [existing]);

  const [assets, setAssets] = useState<DraftAsset[]>(() => {
    if (initialAssets.length > 0) return initialAssets;
    // New portfolio always starts with one blank 주식 row.
    // User changes category to 암호화폐 if they want a crypto portfolio.
    return [{ ticker: '', name: '', category: '주식', target_pct: 0 }];
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
    const budget = parseKrwInput(monthlyBudget);
    if (budget < 0) return false;
    if (benchmarkMode === 'custom' && !customBenchmarkTicker.trim()) return false;
    if (assets.length === 0) return false;
    if (!totalPctOk) return false;
    for (const a of assets) {
      if (!a.ticker.trim()) return false;
      if (!a.name.trim()) return false;
      if (a.target_pct < 0) return false;
    }
    return true;
  }, [name, monthlyBudget, benchmarkMode, customBenchmarkTicker, assets, totalPctOk]);

  // Tracks rows currently waiting on a name lookup so we can show
  // "검색 중..." in the name field. Set of asset row indexes.
  const [resolvingRows, setResolvingRows] = useState<Set<number>>(new Set());

  // Tracks rows whose name was auto-filled by the resolver (vs. typed
  // by the user). When the user re-types the ticker on a row whose name
  // was auto-filled, we refresh — when they edit the name field
  // themselves, we mark the row "owned" and stop refreshing.
  const [autoFilledRows, setAutoFilledRows] = useState<Set<number>>(new Set());

  // Pre-warm the resolve-ticker-name edge function on mount so the
  // user's first lookup doesn't pay Deno cold-start latency.
  useEffect(() => {
    prewarmTickerNameResolver();
  }, []);

  /**
   * Auto-resolve the asset name. Fires the moment the ticker becomes a
   * valid 6-digit Korean code — no waiting for blur. The user sees a
   * "검색 중..." placeholder in the name field while the lookup runs;
   * on success the name field auto-fills.
   */
  const triggerNameLookup = useCallback(async (idx: number, code: string) => {
    setResolvingRows((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    const resolved = await resolveTickerName(code);
    setResolvingRows((prev) => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
    if (!resolved) return;
    let didFill = false;
    setAssets((prev) =>
      prev.map((a, i) => {
        if (i !== idx) return a;
        if (a.ticker !== code) return a; // user changed ticker meanwhile
        didFill = true;
        return { ...a, name: resolved };
      }),
    );
    if (didFill) {
      setAutoFilledRows((prev) => {
        const next = new Set(prev);
        next.add(idx);
        return next;
      });
    }
  }, []);

  const updateAsset = (idx: number, patch: Partial<DraftAsset>) => {
    setAssets((prev) =>
      prev.map((a, i) => {
        if (i !== idx) return a;
        const next = { ...a, ...patch };
        // When category changes to 암호화폐: force BTC ticker (we only support BTC
        // for now). Replace any existing ticker, even non-empty ones like "000000".
        // When category changes away: clear KRW-BTC placeholder if present.
        if (patch.category !== undefined && patch.category !== a.category) {
          if (patch.category === '암호화폐') {
            next.ticker = BTC_TICKER;
            if (!a.name.trim()) next.name = BTC_NAME;
          } else if (a.category === '암호화폐' && a.ticker === BTC_TICKER) {
            next.ticker = '';
            if (a.name === BTC_NAME) next.name = '';
          }
        }
        // Instant name lookup the moment the ticker becomes a valid
        // 6-digit Korean code. Refresh whenever:
        //   (a) name field is empty, OR
        //   (b) name was previously auto-filled by us (so the user is
        //       just re-typing a different code on the same row).
        // We DO NOT refresh if the user typed the name themselves.
        if (
          patch.ticker !== undefined &&
          patch.ticker !== a.ticker &&
          /^\d{6}$/.test(patch.ticker) &&
          next.category !== '암호화폐'
        ) {
          const isUserEdited =
            next.name.trim().length > 0 && !autoFilledRows.has(idx);
          if (!isUserEdited) {
            // Clear the previous auto-fill so "검색 중…" placeholder shows.
            next.name = '';
            void triggerNameLookup(idx, patch.ticker);
          }
        }
        return next;
      }),
    );
  };

  const addAssetRow = () => {
    setAssets((prev) => [
      ...prev,
      {
        ticker: '',
        name: '',
        category: '주식',
        target_pct: 0,
      },
    ]);
  };

  const removeAssetRow = (idx: number) => {
    setAssets((prev) => prev.filter((_, i) => i !== idx));
    // Remap the index-keyed Sets: drop idx, decrement everything above it.
    const remap = (s: Set<number>) => {
      const out = new Set<number>();
      for (const i of s) {
        if (i === idx) continue;
        out.add(i > idx ? i - 1 : i);
      }
      return out;
    };
    setAutoFilledRows((prev) => remap(prev));
    setResolvingRows((prev) => remap(prev));
  };

  const handleSave = useCallback(async () => {
    if (!canSave || isSaving) return;
    setSaveError(null);
    setIsSaving(true);

    const portfolioInput: PortfolioInput = {
      name: name.trim(),
      kind: deriveKind(assets),
      monthly_budget: parseKrwInput(monthlyBudget),
      benchmark_ticker: toBenchmarkReferenceValue(benchmarkMode, customBenchmarkTicker),
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
    monthlyBudget,
    benchmarkMode,
    customBenchmarkTicker,
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

          {/* Monthly budget + Benchmark on one row */}
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <label className="block text-base uppercase tracking-widest text-amber-600 font-semibold mb-1">
                {t('portfolio.fieldMonthlyBudget')}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={
                  monthlyBudget === ''
                    ? ''
                    : parseKrwInput(monthlyBudget).toLocaleString('ko-KR')
                }
                onChange={(e) =>
                  setMonthlyBudget(
                    e.target.value === ''
                      ? ''
                      : String(parseKrwInput(e.target.value)),
                  )
                }
                placeholder="500,000"
                className="w-full text-base text-black placeholder-stone-300 bg-transparent outline-none tabular-nums"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-base uppercase tracking-widest text-amber-600 font-semibold mb-1">
                {t('portfolio.fieldBenchmark')}
              </label>
              <select
                value={benchmarkMode}
                onChange={(e) => setBenchmarkMode(e.target.value as BenchmarkMode)}
                className="w-full text-base text-black bg-transparent outline-none"
              >
                <option value="none">{t('portfolio.benchmarkNone')}</option>
                {BENCHMARK_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
                <option value="custom">{t('portfolio.benchmarkCustom')}</option>
              </select>
              {benchmarkMode === 'custom' && (
                <input
                  type="text"
                  value={customBenchmarkTicker}
                  onChange={(e) => setCustomBenchmarkTicker(e.target.value.trim())}
                  placeholder={t('portfolio.benchmarkCustomPlaceholder')}
                  className="mt-2 w-full text-base text-black placeholder-stone-300 bg-transparent outline-none"
                />
              )}
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
                {/* Row 1: ticker + name. For 암호화폐, ticker is auto-filled KRW-BTC and readonly. */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={asset.ticker}
                    onChange={(e) => updateAsset(idx, { ticker: e.target.value.trim() })}
                    readOnly={asset.category === '암호화폐'}
                    placeholder={t('portfolio.assetTickerPlaceholder')}
                    className={`w-28 flex-shrink-0 px-3 py-2 rounded-lg border border-stone-200 text-base text-black placeholder-stone-300 outline-none focus:border-amber-400 ${
                      asset.category === '암호화폐' ? 'bg-stone-100 text-stone-500' : 'bg-white'
                    }`}
                  />
                  <input
                    type="text"
                    value={asset.name}
                    onChange={(e) => {
                      // The user is taking ownership of the name — stop
                      // overwriting it on future ticker changes.
                      if (autoFilledRows.has(idx)) {
                        setAutoFilledRows((prev) => {
                          const next = new Set(prev);
                          next.delete(idx);
                          return next;
                        });
                      }
                      updateAsset(idx, { name: e.target.value });
                    }}
                    placeholder={
                      resolvingRows.has(idx)
                        ? '검색 중…'
                        : t('portfolio.assetNamePlaceholder')
                    }
                    className={`flex-1 min-w-0 px-3 py-2 rounded-lg border border-stone-200 bg-white text-base text-black placeholder-stone-300 outline-none focus:border-amber-400 ${
                      resolvingRows.has(idx) ? 'placeholder-amber-500' : ''
                    }`}
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
