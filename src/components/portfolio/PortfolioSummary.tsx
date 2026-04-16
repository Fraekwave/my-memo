// STUB — Phase 2 WIP. Full implementation pending.
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PortfolioWithAssets } from '@/hooks/usePortfolios';

interface PortfolioSummaryProps {
  portfolios: PortfolioWithAssets[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (portfolioId: number) => void;
  onBuyPlan: (portfolioId: number) => void;
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
}: PortfolioSummaryProps) {
  const { t } = useTranslation();

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
          {portfolios.map((p) => (
            <div
              key={p.portfolio.id}
              className="rounded-xl border border-stone-200 bg-stone-50 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-base font-semibold text-black">{p.portfolio.name}</span>
                <button
                  type="button"
                  onClick={() => onEdit(p.portfolio.id)}
                  className="text-sm text-stone-500 hover:text-stone-700"
                >
                  {t('portfolio.menuEdit')}
                </button>
              </div>
              <div className="text-sm text-stone-500 mb-3">
                {t('portfolio.monthlyBudget')}: {p.portfolio.monthly_budget.toLocaleString('ko-KR')}원
                {' · '}
                {p.assets.length} {p.portfolio.kind === 'crypto' ? '자산' : 'ETF'}
              </div>
              <button
                type="button"
                onClick={() => onBuyPlan(p.portfolio.id)}
                className="w-full px-4 py-2 rounded-lg bg-amber-700 text-white text-base font-medium hover:bg-amber-800 transition-colors"
              >
                {t('portfolio.buyPlanBtn')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
