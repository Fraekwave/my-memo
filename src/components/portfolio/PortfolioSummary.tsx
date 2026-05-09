import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Upload } from 'lucide-react';
import { PortfolioWithAssets } from '@/hooks/usePortfolios';
import { useTransactions } from '@/hooks/useTransactions';
import { downloadFullPortfolioCsv } from '@/lib/transactionExport';
import { ReturnSummary } from './ReturnSummary';

interface PortfolioSummaryProps {
  userId: string | null;
  portfolios: PortfolioWithAssets[];
  isLoading: boolean;
  onNew: () => void;
  onCsvImport: () => void;
  onEdit: (portfolioId: number) => void;
  onBuyPlan: (portfolioId: number) => void;
  onPnl: (portfolioId: number) => void;
  onHistory: (portfolioId: number) => void;
  onRecord: (portfolioId: number) => void;
  onDelete: (portfolioId: number) => Promise<void> | void;
}

export function PortfolioSummary({
  userId,
  portfolios,
  isLoading,
  onNew,
  onCsvImport,
  onEdit,
  onBuyPlan,
  onPnl,
  onHistory,
  onRecord,
  onDelete,
}: PortfolioSummaryProps) {
  const { t } = useTranslation();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        <button
          type="button"
          onClick={onNew}
          className="flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          <span className="text-base font-semibold">{t('portfolio.newPortfolio')}</span>
        </button>
        <button
          type="button"
          onClick={onCsvImport}
          className="flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 transition-colors"
        >
          <Upload className="w-4 h-4" strokeWidth={2} />
          <span className="text-base font-semibold">{t('portfolio.importCenterTitle')}</span>
        </button>
      </div>

      {portfolios.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-stone-400 text-base">{t('portfolio.emptyTitle')}</p>
          <p className="text-stone-300 text-base mt-1">{t('portfolio.emptySub')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {portfolios.map((p) => {
            const id = p.portfolio.id;
            const isDeleting = deletingId === id;
            return (
              <div
                key={id}
                className="rounded-2xl border-2 border-stone-200 bg-white p-5 shadow-sm"
              >
                {/* Header: name + edit */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-black">{p.portfolio.name}</h2>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {t('portfolio.monthlyBudget')}: {p.portfolio.monthly_budget.toLocaleString('ko-KR')}원
                      {' · '}
                      {p.assets.length} {p.portfolio.kind === 'crypto' ? '자산' : 'ETF'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(id)}
                    className="text-sm text-stone-500 hover:text-stone-700"
                  >
                    {t('portfolio.menuEdit')}
                  </button>
                </div>

                {/* Per-portfolio chart with toggleable asset overlays */}
                <ReturnSummary userId={userId} portfolio={p} />

                {/* Primary action buttons */}
                <div className="flex gap-2 mt-4 mb-3">
                  <button
                    type="button"
                    onClick={() => onPnl(id)}
                    className="flex-1 px-4 py-2 rounded-lg border border-stone-200 bg-white text-stone-700 text-base font-medium hover:bg-stone-100 transition-colors"
                  >
                    {t('portfolio.pnlBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onBuyPlan(id)}
                    className="flex-1 px-4 py-2 rounded-lg bg-amber-700 text-white text-base font-medium hover:bg-amber-800 transition-colors"
                  >
                    {t('portfolio.buyPlanBtn')}
                  </button>
                </div>

                {/* Secondary action links */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <button
                    type="button"
                    onClick={() => onHistory(id)}
                    className="text-stone-500 hover:text-stone-700 transition-colors"
                  >
                    {t('portfolio.historyBtn')}
                  </button>
                  <span className="text-stone-300">·</span>
                  <button
                    type="button"
                    onClick={() => onRecord(id)}
                    className="text-stone-500 hover:text-stone-700 transition-colors"
                  >
                    {t('portfolio.menuRecord')}
                  </button>
                  <span className="text-stone-300">·</span>
                  <PortfolioCsvExportButton userId={userId} portfolio={p} />
                  <span className="text-stone-300">·</span>
                  {isDeleting ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await onDelete(id);
                        setDeletingId(null);
                      }}
                      className="text-red-600 font-medium hover:text-red-700 transition-colors"
                    >
                      {t('portfolio.deleteConfirm')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeletingId(id)}
                      className="text-stone-400 hover:text-red-600 transition-colors"
                    >
                      {t('portfolio.menuDelete')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PortfolioCsvExportButton({
  userId,
  portfolio,
}: {
  userId: string | null;
  portfolio: PortfolioWithAssets;
}) {
  const { t } = useTranslation();
  const { transactions, isLoading } = useTransactions(userId, portfolio.portfolio.id);
  const disabled = isLoading;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        downloadFullPortfolioCsv({ portfolio, transactions });
      }}
      className={`transition-colors ${
        disabled
          ? 'text-stone-300 cursor-not-allowed'
          : 'text-stone-500 hover:text-stone-700'
      }`}
    >
      {t('portfolio.menuExport')}
    </button>
  );
}
