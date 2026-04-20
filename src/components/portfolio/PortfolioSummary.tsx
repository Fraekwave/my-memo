import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PortfolioWithAssets } from '@/hooks/usePortfolios';

interface PortfolioSummaryProps {
  portfolios: PortfolioWithAssets[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (portfolioId: number) => void;
  onBuyPlan: (portfolioId: number) => void;
  onPnl: (portfolioId: number) => void;
  onHistory: (portfolioId: number) => void;
  onImport: (portfolioId: number) => void;
  onRecord: (portfolioId: number) => void;
  onDelete: (portfolioId: number) => Promise<void> | void;
}

export function PortfolioSummary({
  portfolios,
  isLoading,
  onNew,
  onEdit,
  onBuyPlan,
  onPnl,
  onHistory,
  onImport,
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
      <button
        type="button"
        onClick={onNew}
        className="w-full flex items-center justify-center gap-2 px-4 py-4 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        <span className="text-base font-semibold">{t('portfolio.newPortfolio')}</span>
      </button>

      {portfolios.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-stone-400 text-base">{t('portfolio.emptyTitle')}</p>
          <p className="text-stone-300 text-base mt-1">{t('portfolio.emptySub')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {portfolios.map((p) => {
            const id = p.portfolio.id;
            const isDeleting = deletingId === id;
            return (
              <div
                key={id}
                className="rounded-xl border border-stone-200 bg-stone-50 p-4"
              >
                {/* Header: name + edit */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-semibold text-black">{p.portfolio.name}</span>
                  <button
                    type="button"
                    onClick={() => onEdit(id)}
                    className="text-sm text-stone-500 hover:text-stone-700"
                  >
                    {t('portfolio.menuEdit')}
                  </button>
                </div>

                {/* Metadata */}
                <div className="text-sm text-stone-500 mb-3">
                  {t('portfolio.monthlyBudget')}: {p.portfolio.monthly_budget.toLocaleString('ko-KR')}원
                  {' · '}
                  {p.assets.length} {p.portfolio.kind === 'crypto' ? '자산' : 'ETF'}
                </div>

                {/* Primary action buttons */}
                <div className="flex gap-2 mb-3">
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
                <div className="flex items-center gap-3 text-sm">
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
                  <button
                    type="button"
                    onClick={() => onImport(id)}
                    className="text-stone-500 hover:text-stone-700 transition-colors"
                  >
                    {t('portfolio.menuImport')}
                  </button>
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
