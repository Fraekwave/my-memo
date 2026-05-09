import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, Download, Upload } from 'lucide-react';
import type { AssetInput, PortfolioInput, PortfolioWithAssets } from '@/hooks/usePortfolios';
import { useTransactions, type TransactionInput } from '@/hooks/useTransactions';
import { supabase } from '@/lib/supabase';
import {
  generatePortfolioTransferTemplate,
  parsePortfolioTransferCsv,
  type PortfolioTransferDraft,
  type PortfolioTransferMode,
} from '@/lib/portfolioTransferCsv';

interface PortfolioCsvImportCenterProps {
  userId: string | null;
  portfolios: PortfolioWithAssets[];
  createPortfolio: (
    input: PortfolioInput,
    assets: AssetInput[],
  ) => Promise<PortfolioWithAssets | null>;
  onBack: () => void;
}

type ImportCenterMode = 'choose' | PortfolioTransferMode;
type Step = 'upload' | 'review' | 'done';

export function PortfolioCsvImportCenter({
  userId,
  portfolios,
  createPortfolio,
  onBack,
}: PortfolioCsvImportCenterProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ImportCenterMode>('choose');
  const [transactionPortfolioId, setTransactionPortfolioId] = useState<number | null>(
    portfolios[0]?.portfolio.id ?? null,
  );
  const selectedPortfolioId = transactionPortfolioId ?? portfolios[0]?.portfolio.id ?? null;

  if (mode !== 'choose') {
    const targetPortfolio =
      mode === 'transactions' && selectedPortfolioId != null
        ? portfolios.find((portfolio) => portfolio.portfolio.id === selectedPortfolioId) ?? null
        : null;

    return (
      <PortfolioTransferImportForm
        userId={userId}
        mode={mode}
        targetPortfolio={targetPortfolio}
        createPortfolio={createPortfolio}
        onBack={() => setMode('choose')}
        onDone={onBack}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors p-1.5 -ml-1.5 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span>{t('common.back')}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-black mb-1">
            {t('portfolio.importCenterTitle')}
          </h2>
          <p className="text-sm text-stone-500">{t('portfolio.importCenterSubtitle')}</p>
        </div>

        <ImportChoiceCard
          title={t('portfolio.importFullTitle')}
          description={t('portfolio.importFullHint')}
          actionLabel={t('portfolio.importFullAction')}
          onClick={() => setMode('full')}
        />

        <ImportChoiceCard
          title={t('portfolio.importPortfolioTitle')}
          description={t('portfolio.importPortfolioHint')}
          actionLabel={t('portfolio.importPortfolioAction')}
          onClick={() => setMode('portfolio')}
        />

        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-black">
              {t('portfolio.importTransactionsTitle')}
            </h3>
            <p className="text-sm text-stone-500 mt-1">
              {t('portfolio.importTransactionsHint')}
            </p>
          </div>

          {portfolios.length > 0 ? (
            <>
              <label className="block">
                <span className="block text-sm text-stone-500 mb-1">
                  {t('portfolio.importChoosePortfolio')}
                </span>
                <select
                  value={selectedPortfolioId ?? ''}
                  onChange={(e) => setTransactionPortfolioId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-base text-black outline-none focus:border-amber-400"
                >
                  {portfolios.map((portfolio) => (
                    <option key={portfolio.portfolio.id} value={portfolio.portfolio.id}>
                      {portfolio.portfolio.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={selectedPortfolioId == null}
                onClick={() => {
                  if (selectedPortfolioId != null) setMode('transactions');
                }}
                className="w-full px-4 py-3 rounded-xl bg-amber-700 text-white hover:bg-amber-800 transition-colors text-base font-medium"
              >
                {t('portfolio.importTransactionsAction')}
              </button>
            </>
          ) : (
            <p className="text-sm text-stone-400">
              {t('portfolio.importTransactionsNeedsPortfolio')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportChoiceCard({
  title,
  description,
  actionLabel,
  onClick,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <div>
        <h3 className="text-base font-semibold text-black">{title}</h3>
        <p className="text-sm text-stone-500 mt-1">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="w-full px-4 py-3 rounded-xl bg-amber-700 text-white hover:bg-amber-800 transition-colors text-base font-medium"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function PortfolioTransferImportForm({
  userId,
  mode,
  targetPortfolio,
  createPortfolio,
  onBack,
  onDone,
}: {
  userId: string | null;
  mode: PortfolioTransferMode;
  targetPortfolio: PortfolioWithAssets | null;
  createPortfolio: (
    input: PortfolioInput,
    assets: AssetInput[],
  ) => Promise<PortfolioWithAssets | null>;
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('upload');
  const [csvText, setCsvText] = useState('');
  const [draft, setDraft] = useState<PortfolioTransferDraft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ portfolioName: string; transactions: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { bulkInsert: bulkInsertIntoTarget } = useTransactions(
    userId,
    targetPortfolio?.portfolio.id ?? null,
  );

  const title =
    mode === 'full'
      ? t('portfolio.transferImportTitleFull')
      : mode === 'portfolio'
        ? t('portfolio.transferImportTitlePortfolio')
        : t('portfolio.transferImportTitleTransactions');

  const handleFilePick = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(String(event.target?.result ?? ''));
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const handleDownloadTemplate = useCallback(() => {
    const csv = generatePortfolioTransferTemplate();
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inadone-full-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleParse = useCallback(() => {
    const parsed = parsePortfolioTransferCsv(csvText, mode);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setWarnings([]);
      setDraft(null);
      return;
    }
    if (mode === 'transactions') {
      if (!targetPortfolio) {
        setErrors([t('portfolio.importTransactionsNeedsPortfolio')]);
        setWarnings([]);
        setDraft(null);
        return;
      }
      const targetTickers = new Set(targetPortfolio.assets.map((asset) => asset.ticker));
      const unknownTickers = Array.from(
        new Set(
          parsed.draft.transactions
            .map((transaction) => transaction.ticker)
            .filter((ticker) => !targetTickers.has(ticker)),
        ),
      );
      if (unknownTickers.length > 0) {
        setErrors([
          t('portfolio.transferImportTickerMismatch', {
            tickers: unknownTickers.join(', '),
          }),
        ]);
        setWarnings([]);
        setDraft(null);
        return;
      }
    }
    setErrors([]);
    setWarnings(parsed.warnings);
    setDraft(parsed.draft);
    setStep('review');
  }, [csvText, mode, targetPortfolio, t]);

  const handleConfirm = useCallback(async () => {
    if (!userId || !draft || isSaving) return;
    setIsSaving(true);
    const transactionsToImport = mode === 'portfolio' ? [] : draft.transactions;
    setProgress(
      transactionsToImport.length > 0
        ? { done: 0, total: transactionsToImport.length }
        : null,
    );

    let portfolioId: number;
    let portfolioName: string;
    if (mode === 'transactions') {
      if (!targetPortfolio) {
        setErrors([t('portfolio.importTransactionsNeedsPortfolio')]);
        setIsSaving(false);
        return;
      }
      portfolioId = targetPortfolio.portfolio.id;
      portfolioName = targetPortfolio.portfolio.name;
    } else {
      const created = await createPortfolio(draft.portfolio, draft.assets);
      if (!created) {
        setErrors([t('portfolio.transferImportCreateFailed')]);
        setIsSaving(false);
        return;
      }
      portfolioId = created.portfolio.id;
      portfolioName = created.portfolio.name;
    }

    let inserted = 0;
    if (transactionsToImport.length > 0) {
      const insertResult =
        mode === 'transactions'
          ? await bulkInsertIntoTarget(
              transactionsToImport,
              (done, total) => setProgress({ done, total }),
            )
          : await insertTransactionsForPortfolio({
              userId,
              portfolioId,
              transactions: transactionsToImport,
              onProgress: (done, total) => setProgress({ done, total }),
            });
      inserted = insertResult.inserted;
      if (insertResult.failed > 0) {
        setWarnings((prev) => [
          ...prev,
          t('portfolio.transferImportTransactionFailed', { count: insertResult.failed }),
        ]);
      }
    }

    setResult({ portfolioName, transactions: inserted });
    setStep('done');
    setIsSaving(false);
  }, [userId, draft, isSaving, mode, targetPortfolio, createPortfolio, bulkInsertIntoTarget, t]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors p-1.5 -ml-1.5 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span>{t('common.back')}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-black mb-1">{title}</h2>
          <p className="text-sm text-stone-500">{t('portfolio.transferImportDropHint')}</p>
        </div>

        {step === 'upload' && (
          <>
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
                <span className="text-base font-medium">
                  {t('portfolio.transferImportTemplateBtn')}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFilePick(file);
                  event.target.value = '';
                }}
              />
            </div>

            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              placeholder={generatePortfolioTransferTemplate()}
              rows={12}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm font-mono text-black placeholder-stone-300 outline-none focus:border-amber-400 resize-y"
            />

            {errors.length > 0 && <ErrorList errors={errors} />}

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

        {step === 'review' && draft && (
          <>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-2">
              <p className="text-base font-semibold text-black">{draft.portfolio.name}</p>
              <p className="text-sm text-stone-600">
                {t('portfolio.transferImportSummary', {
                  assets: draft.assets.length,
                  transactions: mode === 'portfolio' ? 0 : draft.transactions.length,
                })}
              </p>
            </div>

            {warnings.length > 0 && <WarningList warnings={warnings} />}
            {errors.length > 0 && <ErrorList errors={errors} />}

            <div className="rounded-xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
              {draft.assets.map((asset) => (
                <div key={asset.ticker} className="px-3 py-2 text-sm flex items-center gap-3">
                  <span className="w-16 text-stone-500 tabular-nums">{asset.target_pct}%</span>
                  <span className="flex-1 min-w-0 truncate text-stone-800">
                    {asset.ticker} · {asset.name}
                  </span>
                  <span className="text-stone-400">{asset.category}</span>
                </div>
              ))}
            </div>

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
                disabled={isSaving}
                className={`flex-1 px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                  !isSaving
                    ? 'bg-amber-700 text-white hover:bg-amber-800'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                }`}
              >
                {progress
                  ? t('portfolio.importInProgress', {
                      done: progress.done,
                      total: progress.total,
                    })
                  : t('portfolio.transferImportConfirmBtn')}
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-amber-700 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-base font-semibold text-black">
                {t('portfolio.transferImportDone', { name: result.portfolioName })}
              </p>
              <p className="text-sm text-stone-500 mt-1">
                {t('portfolio.transferImportDoneSummary', {
                  transactions: result.transactions,
                })}
              </p>
            </div>
            {warnings.length > 0 && <WarningList warnings={warnings} />}
            <button
              type="button"
              onClick={onDone}
              className="w-full px-4 py-3 rounded-xl bg-amber-700 text-white hover:bg-amber-800 transition-colors text-base font-medium"
            >
              {t('common.confirm')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  return (
    <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 space-y-1">
      {warnings.map((warning) => (
        <p key={warning} className="text-sm text-stone-600">
          {warning}
        </p>
      ))}
    </div>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-1">
      {errors.map((error) => (
        <p key={error} className="text-sm text-red-600">
          {error}
        </p>
      ))}
    </div>
  );
}

async function insertTransactionsForPortfolio({
  userId,
  portfolioId,
  transactions,
  onProgress,
}: {
  userId: string;
  portfolioId: number;
  transactions: TransactionInput[];
  onProgress: (done: number, total: number) => void;
}): Promise<{ inserted: number; failed: number }> {
  let inserted = 0;
  let failed = 0;
  const total = transactions.length;
  const chunkSize = 500;

  for (let i = 0; i < transactions.length; i += chunkSize) {
    const chunk = transactions.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('transactions')
      .insert(
        chunk.map((transaction) => ({
          user_id: userId,
          portfolio_id: portfolioId,
          ticker: transaction.ticker,
          trade_date: transaction.trade_date,
          shares: transaction.shares,
          price: transaction.price,
          note: transaction.note ?? '',
        })),
      )
      .select();

    if (error) {
      failed += chunk.length;
    } else {
      inserted += data?.length ?? chunk.length;
    }
    onProgress(Math.min(i + chunk.length, total), total);
  }

  return { inserted, failed };
}
