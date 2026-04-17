import { useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { PortfolioWithAssets } from '@/hooks/usePortfolios';
import { useTransactions, TransactionInput } from '@/hooks/useTransactions';
import {
  parseCsv,
  validate,
  generateCsvTemplate,
  type ParsedRow,
  type RowStatus,
} from '@/lib/transactionImport';
import { formatKrw } from '@/lib/formatNumber';

interface TransactionImportWizardProps {
  userId: string | null;
  portfolio: PortfolioWithAssets;
  onBack: () => void;
}

type Step = 'upload' | 'review' | 'done';

export function TransactionImportWizard({
  userId,
  portfolio,
  onBack,
}: TransactionImportWizardProps) {
  const { t } = useTranslation();
  const { transactions, bulkInsert } = useTransactions(userId, portfolio.portfolio.id);

  const [step, setStep] = useState<Step>('upload');
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseErrorMessage, setParseErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [insertResult, setInsertResult] = useState<{ inserted: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const knownTickers = useMemo(
    () => new Set(portfolio.assets.map((a) => a.ticker)),
    [portfolio.assets],
  );

  const existingKeys = useMemo(() => {
    const s = new Set<string>();
    for (const tx of transactions) {
      s.add(`${tx.trade_date}|${tx.ticker}|${tx.shares}|${tx.price}`);
    }
    return s;
  }, [transactions]);

  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { valid: 0, orphan: 0, duplicate: 0, invalid: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const validRows = useMemo(() => rows.filter((r) => r.status === 'valid'), [rows]);

  const handleParse = useCallback(() => {
    setParseErrorMessage(null);
    const parsed = parseCsv(csvText);
    if (parsed.errors.some((e) => e.rowIndex === 0)) {
      setParseErrorMessage(parsed.errors[0].message);
      setRows([]);
      return;
    }
    const validated = validate(parsed.rows, { knownTickers, existingKeys });
    setRows(validated);
    setStep('review');
  }, [csvText, knownTickers, existingKeys]);

  const handleFilePick = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '');
      setCsvText(text);
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const handleDownloadTemplate = useCallback(() => {
    const tpl = generateCsvTemplate(
      portfolio.assets.map((a) => ({ ticker: a.ticker, name: a.name })),
    );
    const blob = new Blob(['\uFEFF' + tpl], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${portfolio.portfolio.name}-template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [portfolio]);

  const handleConfirm = useCallback(async () => {
    if (validRows.length === 0) return;
    const inputs: TransactionInput[] = validRows.map((r) => ({
      ticker: r.ticker,
      trade_date: r.trade_date,
      shares: r.shares,
      price: r.price,
      note: r.note,
    }));
    setProgress({ done: 0, total: inputs.length });
    const result = await bulkInsert(inputs, (done, total) =>
      setProgress({ done, total }),
    );
    setInsertResult(result);
    setStep('done');
  }, [validRows, bulkInsert]);

  const reset = useCallback(() => {
    setStep('upload');
    setCsvText('');
    setRows([]);
    setParseErrorMessage(null);
    setProgress(null);
    setInsertResult(null);
  }, []);

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
        <StepIndicator step={step} t={t} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-black mb-1">
            {t('portfolio.importTitle')}
          </h2>
          <p className="text-sm text-stone-500">{portfolio.portfolio.name}</p>
        </div>

        {step === 'upload' && (
          <>
            <p className="text-sm text-stone-600">{t('portfolio.importDropHint')}</p>

            {/* File picker */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <Upload className="w-4 h-4" strokeWidth={1.5} />
                <span className="text-base font-medium">{t('portfolio.importFileBtn')}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <Download className="w-4 h-4" strokeWidth={1.5} />
                <span className="text-base font-medium">{t('portfolio.importTemplateBtn')}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePick(f);
                  e.target.value = ''; // reset so same file can be re-picked
                }}
              />
            </div>

            {/* Paste area */}
            <div>
              <label className="block text-sm text-stone-500 mb-1">
                {t('portfolio.importPasteLabel')}
              </label>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="날짜,종목코드,종목명,수량,단가,메모&#10;2024-10-15,069500,KODEX 200,3,33250,"
                rows={10}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm font-mono text-black placeholder-stone-300 outline-none focus:border-amber-400 resize-y"
              />
            </div>

            {parseErrorMessage && (
              <p className="text-sm text-red-600">{parseErrorMessage}</p>
            )}

            <button
              type="button"
              onClick={handleParse}
              disabled={!csvText.trim()}
              className={`w-full px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                csvText.trim()
                  ? 'bg-amber-700 text-white hover:bg-amber-800'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              }`}
            >
              {t('portfolio.importNextBtn')}
            </button>
          </>
        )}

        {step === 'review' && (
          <>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
              <p className="text-sm font-medium text-stone-700">
                {t('portfolio.importReviewSummary', {
                  total: rows.length,
                  valid: counts.valid,
                  skip: counts.orphan + counts.duplicate + counts.invalid,
                })}
              </p>
            </div>

            {/* Row list (paginated-ish: show all but in a scroll area) */}
            <div className="max-h-96 overflow-y-auto rounded-xl border border-stone-200 divide-y divide-stone-100">
              {rows.map((r) => (
                <RowPreview key={r.rowIndex} row={r} t={t} />
              ))}
            </div>

            {counts.valid === 0 && (
              <p className="text-sm text-red-600">
                {t('portfolio.importNoValidRows')}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="flex-1 px-4 py-3 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors text-base font-medium"
              >
                {t('portfolio.importBackBtn')}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={counts.valid === 0 || progress !== null}
                className={`flex-1 px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                  counts.valid > 0 && progress === null
                    ? 'bg-amber-700 text-white hover:bg-amber-800'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                }`}
              >
                {progress
                  ? t('portfolio.importInProgress', {
                      done: progress.done,
                      total: progress.total,
                    })
                  : t('portfolio.importConfirmBtn', { count: counts.valid })}
              </button>
            </div>
          </>
        )}

        {step === 'done' && insertResult && (
          <>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-amber-700 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-base font-semibold text-black">
                {t('portfolio.importDoneToast', { count: insertResult.inserted })}
              </p>
              {insertResult.failed > 0 && (
                <p className="text-sm text-red-600 mt-2">
                  {insertResult.failed}건 실패
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="flex-1 px-4 py-3 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors text-base font-medium"
              >
                다시 가져오기
              </button>
              <button
                type="button"
                onClick={onBack}
                className="flex-1 px-4 py-3 rounded-xl bg-amber-700 text-white hover:bg-amber-800 transition-colors text-base font-medium"
              >
                완료
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────
// Sub-components
// ───────────────────────────────────────

function StepIndicator({ step, t }: { step: Step; t: (k: string) => string }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: t('portfolio.importStep1') },
    { id: 'review', label: t('portfolio.importStep2') },
    { id: 'done', label: t('portfolio.importStep3') },
  ];
  const currentIdx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div
          key={s.id}
          className={`text-xs px-2 py-0.5 rounded-full ${
            i <= currentIdx
              ? 'bg-amber-700 text-white'
              : 'bg-stone-100 text-stone-400'
          }`}
        >
          {s.label}
        </div>
      ))}
    </div>
  );
}

function RowPreview({ row, t }: { row: ParsedRow; t: (k: string) => string }) {
  const badge = (() => {
    switch (row.status) {
      case 'valid':
        return {
          label: t('portfolio.importStatusValid'),
          classes: 'bg-amber-50 text-amber-700',
        };
      case 'orphan':
        return {
          label: t('portfolio.importStatusOrphan'),
          classes: 'bg-stone-100 text-stone-500',
        };
      case 'duplicate':
        return {
          label: t('portfolio.importStatusDuplicate'),
          classes: 'bg-stone-100 text-stone-500',
        };
      case 'invalid':
        return {
          label: t('portfolio.importStatusInvalid'),
          classes: 'bg-red-50 text-red-600',
        };
    }
  })();

  return (
    <div className="px-3 py-2 flex items-center gap-3 text-sm">
      <span
        className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${badge.classes}`}
      >
        {badge.label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-stone-800 truncate">
          {row.trade_date} · {row.ticker}
          {row.name ? ` · ${row.name}` : ''}
        </div>
        <div className="text-stone-500 text-xs tabular-nums">
          {row.shares} × {formatKrw(row.price)}
          {row.statusMessage ? ` — ${row.statusMessage}` : ''}
        </div>
      </div>
      {row.status === 'invalid' && (
        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" strokeWidth={1.5} />
      )}
    </div>
  );
}
